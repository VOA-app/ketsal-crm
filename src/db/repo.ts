// Чтение и запись данных на устройстве (SPEC §4.5). В IndexedDB попадает только шифротекст:
// записи разложены по 16 шардам, настройки и ревизии шардов — в каталоге, фото — отдельными конвертами.
// Исключение — заголовок vault.json (SPEC §5.3), в нём нет секретов.
import { aadFor, open, seal } from '../crypto/aead';
import { requireSession } from '../crypto/session';
import type { VaultHeader } from '../crypto/vault';
import { defaultLists, defaultSettings, emptyData } from '../domain/defaults';
import type { Data, Entity, Lists, Settings } from '../domain/types';
import { pack, SHARD_IDS, shardOf, unpack } from './codec';
import { COLL_KIND, COLLS, KIND_COLL, type Coll, type Kind } from './kinds';
import { db, type ShardRow } from './local';

/** Запись в шарде — конверт без предметных знаний (SPEC §4.1). Поля HLC появятся на этапе 3. */
interface StoredRecord {
  id: string;
  kind: Kind;
  createdAt: string;
  v: unknown;
}

interface ShardBody {
  format: 1;
  records: StoredRecord[];
}

interface CatalogBody {
  format: 1;
  catalogRev: number;
  shardRevs: Record<string, number>;
  settings: Settings;
  lists: Lists;
}

/** Расшифрованные шарды текущей сессии: нужны, чтобы перезаписывать шард целиком. Стираются при блокировке. */
let shards: Map<string, Map<string, StoredRecord>> | null = null;
let catalog: CatalogBody | null = null;

/** Записи идут строго по очереди: шард читается, меняется и пишется целиком. */
let queue: Promise<unknown> = Promise.resolve();
const serial = <T>(fn: () => Promise<T>): Promise<T> => {
  const p = queue.then(fn, fn);
  queue = p.catch(() => undefined);
  return p;
};

// ── Заголовок хранилища и служебные значения ──

export async function getVaultHeader(): Promise<VaultHeader | null> {
  return ((await db().meta.get('vault'))?.value as VaultHeader | undefined) ?? null;
}

export async function saveVaultHeader(h: VaultHeader): Promise<void> {
  await db().meta.put({ key: 'vault', value: h });
}

// ── Записи ──

const toRecord = (coll: Coll, e: Entity<object>): StoredRecord => {
  const { id, createdAt, ...v } = e;
  return { id, kind: COLL_KIND[coll], createdAt, v };
};

function toData(records: Iterable<StoredRecord>, cat: CatalogBody, today: string): Data {
  const data = emptyData(today);
  for (const c of COLLS) (data[c] as unknown[]) = [];
  for (const r of records) {
    const coll = KIND_COLL[r.kind];
    if (coll) (data[coll] as unknown[]).push({ ...(r.v as object), id: r.id, createdAt: r.createdAt });
  }
  // Недостающие настройки — значения по умолчанию: так переживаем добавление новых полей
  data.settings = {
    ...defaultSettings(),
    ...cat.settings,
    templates: { ...defaultSettings().templates, ...cat.settings?.templates },
  };
  data.lists = { ...defaultLists(), ...cat.lists };
  return data;
}

async function writeShard(id: string, rev: number) {
  const { dek, vaultId } = requireSession();
  const body: ShardBody = { format: 1, records: Array.from(shards!.get(id)!.values()) };
  const ct = await seal(dek, pack(body), aadFor(vaultId, 'shard', id, rev));
  return { id, rev, ct };
}

async function writeCatalog() {
  const { dek, vaultId } = requireSession();
  const ct = await seal(dek, pack(catalog), aadFor(vaultId, 'catalog', 'catalog', catalog!.catalogRev));
  return { id: 'catalog' as const, rev: catalog!.catalogRev, ct };
}

/** Расшифровать всю базу (после входа). Ошибку расшифровки не глотаем — её увидит пользователь. */
export async function loadData(today: string): Promise<Data> {
  const { dek, vaultId } = requireSession();
  const d = db();
  const catRow = await d.catalog.get('catalog');
  if (!catRow) throw new Error('catalog missing');
  const cat = unpack<CatalogBody>(await open(dek, catRow.ct, aadFor(vaultId, 'catalog', 'catalog', catRow.rev)));
  if (cat.catalogRev !== catRow.rev) throw new Error('catalog rev mismatch');
  const map = new Map<string, Map<string, StoredRecord>>();
  const rows = await d.shards.toArray();
  for (const id of SHARD_IDS) map.set(id, new Map());
  for (const row of rows) {
    // Ревизия шарда должна совпадать с каталогом: так ловим подмену старой копией
    if ((cat.shardRevs[row.id] ?? 0) !== row.rev) throw new Error(`shard ${row.id} rev mismatch`);
    const body = unpack<ShardBody>(await open(dek, row.ct, aadFor(vaultId, 'shard', row.id, row.rev)));
    const m = map.get(row.id)!;
    for (const r of body.records) m.set(r.id, r);
  }
  shards = map;
  catalog = cat;
  return toData(
    Array.from(map.values()).flatMap((m) => Array.from(m.values())),
    cat,
    today,
  );
}

export interface Change {
  puts: { coll: Coll; item: Entity<object> }[];
  dels: string[];
  settings?: Settings;
  lists?: Lists;
}

/** Применить изменения: перешифровать затронутые шарды и каталог. */
export function writeChange(ch: Change): Promise<void> {
  return serial(async () => {
    if (!shards || !catalog) throw new Error('locked');
    const dirty = new Set<string>();
    for (const { coll, item } of ch.puts) {
      const s = shardOf(item.id);
      shards.get(s)!.set(item.id, toRecord(coll, item));
      dirty.add(s);
    }
    for (const id of ch.dels) {
      const s = shardOf(id);
      if (shards.get(s)!.delete(id)) dirty.add(s);
    }
    if (ch.settings) catalog.settings = ch.settings;
    if (ch.lists) catalog.lists = ch.lists;
    if (!dirty.size && !ch.settings && !ch.lists) return;
    const rows: ShardRow[] = [];
    for (const s of dirty) {
      catalog.shardRevs[s] = (catalog.shardRevs[s] ?? 0) + 1;
      rows.push(await writeShard(s, catalog.shardRevs[s]));
    }
    catalog.catalogRev += 1;
    const cat = await writeCatalog();
    const d = db();
    await d.transaction('rw', d.shards, d.catalog, d.outbox, async () => {
      await d.shards.bulkPut(rows);
      await d.catalog.put(cat);
      // Очередь на отправку в Диск — для этапа 3
      if (rows.length) await d.outbox.bulkAdd(rows.map((r) => ({ shardId: r.id })));
    });
  });
}

/** Записать всю базу заново (создание хранилища, демо-данные, очистка). */
export function replaceAll(data: Data): Promise<void> {
  return serial(async () => {
    const prevRev = catalog?.catalogRev ?? (await db().catalog.get('catalog'))?.rev ?? 0;
    const prevShardRevs = catalog?.shardRevs ?? {};
    shards = new Map(SHARD_IDS.map((id) => [id, new Map()]));
    for (const c of COLLS) {
      for (const e of data[c] as Entity<object>[]) shards.get(shardOf(e.id))!.set(e.id, toRecord(c, e));
    }
    catalog = { format: 1, catalogRev: prevRev + 1, shardRevs: {}, settings: data.settings, lists: data.lists };
    const rows: ShardRow[] = [];
    for (const id of SHARD_IDS) {
      catalog.shardRevs[id] = (prevShardRevs[id] ?? 0) + 1;
      rows.push(await writeShard(id, catalog.shardRevs[id]));
    }
    const cat = await writeCatalog();
    const d = db();
    await d.transaction('rw', d.shards, d.catalog, async () => {
      await d.shards.clear();
      await d.shards.bulkPut(rows);
      await d.catalog.put(cat);
    });
  });
}

/** Блокировка: расшифрованные шарды больше не нужны в памяти. */
export function forgetDecrypted() {
  shards = null;
  catalog = null;
}

// ── Фото ──

export async function putBlobs(items: { id: string; blob: Blob; kind: 'photo' | 'thumb' }[]): Promise<void> {
  const { dek, vaultId } = requireSession();
  const rows = [];
  for (const it of items) {
    const ct = await seal(dek, new Uint8Array(await it.blob.arrayBuffer()), aadFor(vaultId, 'photo', it.id, 1));
    rows.push({ id: it.id, kind: it.kind, ct, synced: false });
  }
  await db().blobs.bulkPut(rows);
}

export async function getBlob(id: string): Promise<Blob | null> {
  const row = await db().blobs.get(id);
  if (!row) return null;
  const { dek, vaultId } = requireSession();
  const pt = await open(dek, row.ct, aadFor(vaultId, 'photo', id, 1));
  return new Blob([pt.slice().buffer as ArrayBuffer], { type: 'image/jpeg' });
}

export async function deleteBlobs(ids: string[]): Promise<void> {
  if (ids.length) await db().blobs.bulkDelete(ids);
}

export async function clearBlobs(): Promise<void> {
  await db().blobs.clear();
}

// ── Перенос открытых данных этапа 1 ──

/** Открытые данные этапа 1 или null. Читаются один раз при создании хранилища. */
export async function loadLegacyData(
  today: string,
): Promise<{ data: Data; blobs: { id: string; blob: Blob }[] } | null> {
  const d = db();
  const [records, cat] = await Promise.all([d.devRecords.toArray(), d.devCatalog.toArray()]);
  if (!records.length && !cat.length) return null;
  const settings = cat.find((x) => x.key === 'settings')?.value as Settings | undefined;
  const lists = cat.find((x) => x.key === 'lists')?.value as Lists | undefined;
  const data = toData(
    records as StoredRecord[],
    {
      format: 1,
      catalogRev: 0,
      shardRevs: {},
      settings: settings ?? defaultSettings(),
      lists: lists ?? defaultLists(),
    },
    today,
  );
  return { data, blobs: await d.devBlobs.toArray() };
}

export async function hasLegacyData(): Promise<boolean> {
  return (await db().devRecords.count()) > 0;
}

/** Стереть открытые таблицы этапа 1. */
export async function clearLegacy(): Promise<void> {
  const d = db();
  await d.transaction('rw', d.devRecords, d.devCatalog, d.devBlobs, async () => {
    await d.devRecords.clear();
    await d.devCatalog.clear();
    await d.devBlobs.clear();
  });
}

/** Просим браузер не стирать базу при нехватке места (SPEC: на старте вызывать persist). */
export async function requestPersist(): Promise<void> {
  try {
    if (navigator.storage?.persist && !(await navigator.storage.persisted())) await navigator.storage.persist();
  } catch {
    // не критично
  }
}
