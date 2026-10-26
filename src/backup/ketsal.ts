// Зашифрованная резервная копия `.ketsal` (SPEC §9.1).
//
// ZIP без сжатия с той же раскладкой, что на Диске: vault.json, catalog.enc, shards/, blobs/, thumbs/,
// плюс manifest.json с SHA-256 каждого файла. Всё, кроме vault.json и manifest.json, — шифротекст.
// Открыть копию можно её паролем или ключом восстановления; копию этого же хранилища — текущим ключом.
import { aadFor, open, seal } from '../crypto/aead';
import { sha256Hex } from '../crypto/hash';
import type { Session } from '../crypto/session';
import type { VaultHeader } from '../crypto/vault';
import { pack, SHARD_IDS, unpack } from '../db/codec';
import { COLLS, KIND_COLL } from '../db/kinds';
import { unflattenCatalog, type LocalStore } from '../db/localStore';
import { emptyData } from '../domain/defaults';
import { photoFiles, photoRefs } from '../domain/photos';
import type { Data } from '../domain/types';
import { frame, sortById, unframe, type RemoteCatalog, type RemoteShard } from '../sync/engine';
import type { CatalogState, Envelope } from '../sync/merge';
import { photoPath } from '../sync/photos';
import { ZipReader, ZipWriter } from './zip';

export const BACKUP_EXT = '.ketsal';
const MANIFEST = 'manifest.json';
const VAULT = 'vault.json';
const CATALOG = 'catalog.enc';

export interface BackupManifest {
  format: 'ketsal-backup';
  version: 1;
  createdAt: string;
  vaultId: string;
  counts: { clients: number; procedures: number; photos: number };
  /** Путь → SHA-256 (hex) */
  files: Record<string, string>;
}

export interface BuildResult {
  blob: Blob;
  manifest: BackupManifest;
  /** Фото, которых нет на устройстве (не удалось скачать с Диска) — в копию не попали */
  missingPhotos: number;
}

/** Собрать копию из базы этого устройства. Фото берутся как есть — они уже зашифрованы. */
export async function buildBackup(d: {
  local: LocalStore;
  session: () => Session;
  header: VaultHeader;
  today: string;
  now?: Date;
}): Promise<BuildResult> {
  const now = d.now ?? new Date();
  const { dek, vaultId } = d.session();
  const zip = new ZipWriter(now);
  const files: Record<string, string> = {};
  const add = async (path: string, data: Uint8Array) => {
    files[path] = await sha256Hex(data);
    zip.add(path, data);
  };

  await add(VAULT, new TextEncoder().encode(JSON.stringify(d.header, null, 2)));

  const shardFiles: RemoteCatalog['shardFiles'] = {};
  const shards: [string, Uint8Array][] = [];
  for (const id of SHARD_IDS) {
    // Вместе с удалёнными записями: при «Объединить» удаление не должно вернуться
    const body: RemoteShard = { format: 2, records: sortById(d.local.shardEnvelopes(id)) };
    const file = `${id}-1-backup.enc`;
    shardFiles[id] = { rev: 1, file };
    shards.push([`shards/${file}`, frame(1, await seal(dek, pack(body), aadFor(vaultId, 'shard', id, 1)))]);
  }
  const cat: RemoteCatalog = { format: 2, catalogRev: 1, shardFiles, ...d.local.catalogState() };
  await add(CATALOG, frame(1, await seal(dek, pack(cat), aadFor(vaultId, 'catalog', 'catalog', 1))));
  for (const [path, data] of shards) await add(path, data);

  const data = d.local.data(d.today);
  const wanted = photoFiles(photoRefs(data));
  let missing = 0;
  let photos = 0;
  // Сначала превью, потом оригиналы: так при обрыве в начале файла окажутся самые лёгкие
  for (const kind of ['thumb', 'photo'] as const) {
    for (const [id, k] of wanted) {
      if (k !== kind) continue;
      const row = await d.local.blobRow(id);
      if (!row) {
        if (kind === 'photo') missing += 1;
        continue;
      }
      await add(photoPath(kind, id), row.ct);
      if (kind === 'photo') photos += 1;
    }
  }

  const manifest: BackupManifest = {
    format: 'ketsal-backup',
    version: 1,
    createdAt: now.toISOString(),
    vaultId,
    counts: { clients: data.clients.length, procedures: data.procedures.length, photos },
    files,
  };
  zip.add(MANIFEST, new TextEncoder().encode(JSON.stringify(manifest, null, 2)));
  return { blob: zip.finish('application/octet-stream'), manifest, missingPhotos: missing };
}

export const backupFileName = (today: string) => `ketsal-${today}${BACKUP_EXT}`;

// ── Чтение ──

/** Это не копия приложения или файл повреждён. */
export class BackupFormatError extends Error {
  constructor(readonly reason: 'notBackup' | 'damaged') {
    super(`backup ${reason}`);
    this.name = 'BackupFormatError';
  }
}

export interface BackupInfo {
  zip: ZipReader;
  manifest: BackupManifest;
  header: VaultHeader;
}

/** Открыть файл копии и проверить SHA-256 каждого файла по manifest.json. */
export async function inspectBackup(file: Blob, onProgress?: (done: number, total: number) => void) {
  let zip: ZipReader;
  let manifest: BackupManifest;
  try {
    zip = await ZipReader.open(file);
    manifest = JSON.parse(new TextDecoder().decode(await zip.read(MANIFEST))) as BackupManifest;
  } catch {
    throw new BackupFormatError('notBackup');
  }
  if (manifest?.format !== 'ketsal-backup' || manifest.version !== 1 || !manifest.files) {
    throw new BackupFormatError('notBackup');
  }
  const names = Array.from(zip.entries.keys()).filter((n) => n !== MANIFEST);
  const listed = Object.keys(manifest.files);
  if (names.length !== listed.length || listed.some((n) => !zip.has(n))) throw new BackupFormatError('damaged');
  let done = 0;
  for (const name of listed) {
    let data: Uint8Array;
    try {
      data = await zip.read(name);
    } catch {
      throw new BackupFormatError('damaged');
    }
    if ((await sha256Hex(data)) !== manifest.files[name]) throw new BackupFormatError('damaged');
    done += 1;
    onProgress?.(done, listed.length);
  }
  let header: VaultHeader;
  try {
    header = JSON.parse(new TextDecoder().decode(await zip.read(VAULT))) as VaultHeader;
  } catch {
    throw new BackupFormatError('damaged');
  }
  if (header.format !== 'ketsal-vault' || header.vaultId !== manifest.vaultId) throw new BackupFormatError('damaged');
  return { zip, manifest, header } satisfies BackupInfo;
}

/** Расшифровать записи и настройки копии её ключом. Неверный ключ или подмена — DecryptError. */
export async function decodeBackup(
  info: BackupInfo,
  dek: CryptoKey,
): Promise<{ records: Envelope[]; catalog: CatalogState }> {
  const vaultId = info.header.vaultId;
  const { rev, env } = unframe(await info.zip.read(CATALOG));
  const cat = unpack<RemoteCatalog>(await open(dek, env, aadFor(vaultId, 'catalog', 'catalog', rev)));
  if (cat.catalogRev !== rev) throw new BackupFormatError('damaged');
  const records: Envelope[] = [];
  for (const [id, ref] of Object.entries(cat.shardFiles)) {
    const f = unframe(await info.zip.read(`shards/${ref.file}`));
    if (f.rev !== ref.rev) throw new BackupFormatError('damaged');
    records.push(...unpack<RemoteShard>(await open(dek, f.env, aadFor(vaultId, 'shard', id, f.rev))).records);
  }
  return { records, catalog: { values: cat.values, fieldUpdatedAt: cat.fieldUpdatedAt } };
}

/** Живые записи копии как данные приложения (для «Заменить всё»). */
function toData(records: Envelope[], catalog: CatalogState, skip: Set<string>, today: string): Data {
  const data = emptyData(today);
  for (const c of COLLS) (data[c] as unknown[]) = [];
  for (const e of records) {
    if (e.deleted || !e.v || skip.has(e.id)) continue;
    const coll = KIND_COLL[e.kind];
    if (coll) (data[coll] as unknown[]).push({ ...e.v, id: e.id, createdAt: e.createdAt });
  }
  const { settings, lists } = unflattenCatalog(catalog.values);
  data.settings = settings;
  data.lists = lists;
  return data;
}

export type ImportMode = 'merge' | 'replace';

export interface ImportResult {
  clients: number;
  procedures: number;
  photos: number;
}

/**
 * Восстановить из копии. «Объединить» — слияние по правилам синхронизации; «Заменить всё» — данные
 * станут как в копии, правки уйдут на Диск. Удалённое на этом устройстве из копии не возвращается.
 * Фото копии другого хранилища перешифровываются текущим ключом.
 */
export async function importBackup(d: {
  local: LocalStore;
  session: () => Session;
  info: BackupInfo;
  backupDek: CryptoKey;
  mode: ImportMode;
  today: string;
  onProgress?: (done: number, total: number) => void;
}): Promise<ImportResult> {
  const { records, catalog } = await decodeBackup(d.info, d.backupDek);
  if (d.mode === 'merge') await d.local.importMerged(records, catalog);
  else await d.local.replaceAll(toData(records, catalog, d.local.tombstonedIds(), d.today));

  const data = d.local.data(d.today);
  const { dek, vaultId } = d.session();
  const backupVault = d.info.header.vaultId;
  const sameKey = backupVault === vaultId && d.backupDek === dek;
  const wanted = Array.from(photoFiles(photoRefs(data))).filter(([id, kind]) => d.info.zip.has(photoPath(kind, id)));
  const have = await d.local.presentBlobs(wanted.map(([id]) => id));
  const todo = wanted.filter(([id]) => !have.has(id));
  let photos = 0;
  let done = 0;
  for (const [id, kind] of todo) {
    const ct = await d.info.zip.read(photoPath(kind, id));
    // Проверяем каждое фото ключом копии; чужое хранилище — перешифровать своим
    const plain = await open(d.backupDek, ct, aadFor(backupVault, 'photo', id, 1));
    const mine = sameKey ? ct : await seal(dek, plain, aadFor(vaultId, 'photo', id, 1));
    await d.local.putImportedBlob(id, kind, mine);
    if (kind === 'photo') photos += 1;
    done += 1;
    d.onProgress?.(done, todo.length);
  }
  return { clients: data.clients.length, procedures: data.procedures.length, photos };
}
