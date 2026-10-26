// Цикл синхронизации (SPEC §7.2). Всё, что уходит на Диск, — шифротекст, кроме vault.json.
//
// Раскладка на Диске (уточнение §6.2): `vault.json`, `catalog.enc`, `shards/<id>-<rev>-<устройство>.enc`.
// У каждой версии шарда своё имя, каталог указывает на действующие. Так одновременная запись с двух
// устройств не затирает файлы молча: устройство, чья запись в каталоге проиграла, при следующей
// синхронизации увидит чужие имена файлов, сольёт их со своими данными и отправит недостающее.
import { aadFor, open, seal } from '../crypto/aead';
import type { Session } from '../crypto/session';
import type { VaultHeader } from '../crypto/vault';
import { pack, SHARD_IDS, unpack } from '../db/codec';
import type { LocalStore } from '../db/localStore';
import type { HLC } from '../domain/hlc';
import type { StorageAdapter } from './adapter';
import { fixDuplicateCardNos, mergeCatalog, mergeRecords, type CatalogState, type Envelope } from './merge';

const VAULT = 'vault.json';
const CATALOG = 'catalog.enc';
const SHARD_DIR = 'shards';

export interface RemoteCatalog {
  format: 2;
  catalogRev: number;
  shardFiles: Record<string, { rev: number; file: string }>;
  values: Record<string, unknown>;
  fieldUpdatedAt: Record<string, HLC>;
}

export interface RemoteShard {
  format: 2;
  records: Envelope[];
}

/** Каталог на Диске старее, чем это устройство уже видело: возможен откат данных (§7.2, шаг 1). */
export class RollbackError extends Error {
  constructor() {
    super('remote rollback');
    this.name = 'RollbackError';
  }
}

/** На Диске другое хранилище (другой vaultId): объединять нельзя. */
export class OtherVaultError extends Error {
  constructor() {
    super('other vault');
    this.name = 'OtherVaultError';
  }
}

/** Файл на Диске повреждён или подменён: расшифровка не прошла. */
export class RemoteCorruptError extends Error {
  constructor(readonly path: string) {
    super(`corrupt ${path}`);
    this.name = 'RemoteCorruptError';
  }
}

export interface SyncDeps {
  local: LocalStore;
  remote: StorageAdapter;
  session: () => Session;
  header: VaultHeader;
}

export interface SyncResult {
  /** Данные на устройстве изменились — экраны нужно обновить */
  changed: boolean;
  uploaded: number;
}

// ── Файл на Диске: 4 байта ревизии + конверт KTS1 (ревизия входит и в AAD) ──

export function frame(rev: number, env: Uint8Array): Uint8Array {
  const out = new Uint8Array(4 + env.length);
  new DataView(out.buffer).setUint32(0, rev);
  out.set(env, 4);
  return out;
}

export function unframe(bytes: Uint8Array): { rev: number; env: Uint8Array } {
  if (bytes.length < 4) throw new Error('short');
  return { rev: new DataView(bytes.buffer, bytes.byteOffset, 4).getUint32(0), env: bytes.subarray(4) };
}

const json = (x: unknown) => JSON.stringify(x);
export const sortById = (r: Envelope[]) => r.slice().sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

export const shardFileName = (id: string, rev: number, device: string) => `${id}-${rev}-${device}.enc`;

async function readCatalog(d: SyncDeps): Promise<RemoteCatalog | null> {
  const bytes = await d.remote.read(CATALOG);
  if (!bytes) return null;
  const { dek, vaultId } = d.session();
  try {
    const { rev, env } = unframe(bytes);
    const body = unpack<RemoteCatalog>(await open(dek, env, aadFor(vaultId, 'catalog', 'catalog', rev)));
    if (body.catalogRev !== rev) throw new Error('rev');
    return body;
  } catch {
    throw new RemoteCorruptError(CATALOG);
  }
}

async function readShard(d: SyncDeps, id: string, ref: { rev: number; file: string }): Promise<Envelope[] | null> {
  const path = `${SHARD_DIR}/${ref.file}`;
  const bytes = await d.remote.read(path);
  // Файла нет: другое устройство переписало каталог в момент чтения — повторим цикл
  if (!bytes) return null;
  const { dek, vaultId } = d.session();
  try {
    const { rev, env } = unframe(bytes);
    if (rev !== ref.rev) throw new Error('rev');
    return unpack<RemoteShard>(await open(dek, env, aadFor(vaultId, 'shard', id, rev))).records;
  } catch {
    throw new RemoteCorruptError(path);
  }
}

/** Проверить vault.json на Диске: положить свой, если его нет; другое хранилище — ошибка. */
async function ensureVault(d: SyncDeps) {
  const bytes = await d.remote.read(VAULT);
  if (!bytes) {
    await d.remote.write(VAULT, new TextEncoder().encode(JSON.stringify(d.header, null, 2)));
    return;
  }
  let remote: VaultHeader;
  try {
    remote = JSON.parse(new TextDecoder().decode(bytes)) as VaultHeader;
  } catch {
    throw new RemoteCorruptError(VAULT);
  }
  if (remote.vaultId !== d.header.vaultId) throw new OtherVaultError();
}

/** vault.json с Диска — для второго устройства, у которого хранилища ещё нет. */
export async function fetchRemoteHeader(remote: StorageAdapter): Promise<VaultHeader | null> {
  const bytes = await remote.read(VAULT);
  if (!bytes) return null;
  const h = JSON.parse(new TextDecoder().decode(bytes)) as VaultHeader;
  if (h.format !== 'ketsal-vault') throw new RemoteCorruptError(VAULT);
  return h;
}

async function once(d: SyncDeps): Promise<SyncResult & { conflict: boolean }> {
  const { local } = d;
  const device = await local.deviceId();
  const meta = await local.getSyncMeta();

  // 1. Каталог с Диска; откат ниже уже виденного — стоп
  const rc = await readCatalog(d);
  if (rc && rc.catalogRev < meta.remoteCatalogRev) throw new RollbackError();

  // 2. Шарды, у которых на Диске другой файл, чем это устройство видело: скачать и слить
  const merged = new Map<string, Envelope[]>();
  const remoteRecords = new Map<string, Envelope[]>();
  for (const id of SHARD_IDS) {
    const ref = rc?.shardFiles[id];
    if (!ref || ref.file === meta.remoteShardFiles[id]) continue;
    const recs = await readShard(d, id, ref);
    if (!recs) return { changed: false, uploaded: 0, conflict: true };
    remoteRecords.set(id, recs);
    merged.set(id, mergeRecords(local.shardEnvelopes(id), recs));
  }
  const remoteCat: CatalogState | null = rc ? { values: rc.values, fieldUpdatedAt: rc.fieldUpdatedAt } : null;
  const mergedCat = remoteCat ? mergeCatalog(local.catalogState(), remoteCat) : null;

  // Дубль номера карты после слияния — исправление тоже пойдёт на Диск
  const all = SHARD_IDS.flatMap((id) => merged.get(id) ?? local.shardEnvelopes(id));
  const fixes = fixDuplicateCardNos(all, () => local.clock!.tick());
  const changed = await local.applyMerged(merged, mergedCat, fixes);

  // 3–4. Что отправить: изменённое на устройстве и то, чего на Диске не хватает после слияния
  const pending = await local.pending();
  const toUpload: string[] = [];
  for (const id of SHARD_IDS) {
    const mine = sortById(local.shardEnvelopes(id));
    const theirs = remoteRecords.get(id);
    const ref = rc?.shardFiles[id];
    if (theirs) {
      if (json(mine) !== json(sortById(theirs))) toUpload.push(id);
    } else if (pending.ids.has(id) || (!ref && mine.length)) toUpload.push(id);
  }
  const catNow = local.catalogState();
  const catDiffers = !remoteCat || json(sortKeys(catNow)) !== json(sortKeys(remoteCat));
  if (!toUpload.length && !catDiffers && !pending.ids.has('catalog') && rc) {
    await local.clearPending(pending.maxSeq);
    await local.setSyncMeta({
      remoteCatalogRev: rc.catalogRev,
      remoteShardFiles: Object.fromEntries(Object.entries(rc.shardFiles).map(([k, v]) => [k, v.file])),
      lastSyncAt: new Date().toISOString(),
    });
    return { changed, uploaded: 0, conflict: false };
  }

  const { dek, vaultId } = d.session();
  const files: Record<string, { rev: number; file: string }> = { ...(rc?.shardFiles ?? {}) };
  for (const id of toUpload) {
    const rev = (files[id]?.rev ?? 0) + 1;
    const body: RemoteShard = { format: 2, records: sortById(local.shardEnvelopes(id)) };
    const file = shardFileName(id, rev, device);
    await d.remote.write(
      `${SHARD_DIR}/${file}`,
      frame(rev, await seal(dek, pack(body), aadFor(vaultId, 'shard', id, rev))),
    );
    files[id] = { rev, file };
  }

  // 6. Каталог с новыми ссылками
  const catRev = Math.max(rc?.catalogRev ?? 0, meta.remoteCatalogRev) + 1;
  const cat: RemoteCatalog = { format: 2, catalogRev: catRev, shardFiles: files, ...local.catalogState() };
  const catEnv = await seal(dek, pack(cat), aadFor(vaultId, 'catalog', 'catalog', catRev));
  await d.remote.write(CATALOG, frame(catRev, catEnv));

  // 7. Перечитать каталог: если его успело переписать другое устройство — повторить цикл
  const check = await readCatalog(d);
  if (!check || json(check.shardFiles) !== json(files) || check.catalogRev !== catRev) {
    return { changed, uploaded: toUpload.length, conflict: true };
  }
  await local.clearPending(pending.maxSeq);
  await local.setSyncMeta({
    remoteCatalogRev: catRev,
    remoteShardFiles: Object.fromEntries(Object.entries(files).map(([k, v]) => [k, v.file])),
    lastSyncAt: new Date().toISOString(),
  });

  // 8. Сборка мусора: старые версии шардов, на которые каталог давно не ссылается
  await collectGarbage(d, files);
  return { changed, uploaded: toUpload.length, conflict: false };
}

const sortKeys = (c: CatalogState) => ({
  values: Object.fromEntries(Object.entries(c.values).sort(([a], [b]) => (a < b ? -1 : 1))),
  fieldUpdatedAt: Object.fromEntries(Object.entries(c.fieldUpdatedAt).sort(([a], [b]) => (a < b ? -1 : 1))),
});

/** Удаляем версии шарда, отставшие от действующей больше чем на 2 ревизии: их уже никто не читает. */
async function collectGarbage(d: SyncDeps, files: Record<string, { rev: number; file: string }>) {
  try {
    const list = await d.remote.list(SHARD_DIR);
    for (const f of list) {
      const m = /^([0-9a-f]{2})-(\d+)-[^.]+\.enc$/.exec(f.name);
      if (!m) continue;
      const cur = files[m[1]];
      if (cur && cur.file !== f.name && Number(m[2]) <= cur.rev - 3) await d.remote.remove(`${SHARD_DIR}/${f.name}`);
    }
  } catch {
    // мусор уберём в следующий раз
  }
}

/** Синхронизация: до трёх попыток, если параллельно писало другое устройство. */
export async function sync(d: SyncDeps): Promise<SyncResult> {
  await ensureVault(d);
  let changed = false;
  let uploaded = 0;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const r = await once(d);
    changed ||= r.changed;
    uploaded += r.uploaded;
    if (!r.conflict) return { changed, uploaded };
  }
  return { changed, uploaded };
}
