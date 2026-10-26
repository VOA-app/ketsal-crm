// Локальное хранилище одного устройства (SPEC §4.5): шифрованные шарды записей, каталог, фото,
// очередь изменений для отправки и состояние синхронизации. Записи — конверты с HLC (§4.1, §7.1).
import { aadFor, open, seal } from '../crypto/aead';
import type { Session } from '../crypto/session';
import { defaultLists, defaultSettings, emptyData } from '../domain/defaults';
import { Clock, maxHlc, type HLC } from '../domain/hlc';
import { photoFiles, type PhotoKind } from '../domain/photos';
import type { Data, Entity, Lists, PhotoRef, Settings } from '../domain/types';
import { fixDuplicateCardNos, mergeCatalog, mergeRecords, type CatalogState, type Envelope } from '../sync/merge';
import { pack, SHARD_IDS, shardOf, unpack } from './codec';
import { COLL_KIND, COLLS, KIND_COLL, type Coll, type Kind } from './kinds';
import type { BlobRow, KetsalDB, PhotoDelRow, ShardRow } from './local';

interface ShardBody {
  format: 2;
  records: Envelope[];
}

/** Каталог: настройки и списки плоскими ключами `settings.x`, `lists.y` — для пополевого слияния. */
export interface CatalogBody {
  format: 2;
  catalogRev: number;
  shardRevs: Record<string, number>;
  values: Record<string, unknown>;
  fieldUpdatedAt: Record<string, HLC>;
}

/** Что уже есть на Диске (по данным последней синхронизации этого устройства). */
export interface SyncMeta {
  remoteCatalogRev: number;
  /** Шард → имя файла на Диске, который это устройство уже видело */
  remoteShardFiles: Record<string, string>;
  lastSyncAt: string;
}

export interface Change {
  puts: { coll: Coll; item: Entity<object> }[];
  dels: string[];
  /** Полное удаление (§1.3): tombstone `purged` без данных */
  purges?: string[];
  settings?: Settings;
  lists?: Lists;
}

// Форматы этапа 2 — переводятся в новый при первой загрузке
interface ShardBodyV1 {
  format: 1;
  records: { id: string; kind: Kind; createdAt: string; v: Record<string, unknown> }[];
}
interface CatalogBodyV1 {
  format: 1;
  catalogRev: number;
  shardRevs: Record<string, number>;
  settings: Settings;
  lists: Lists;
}

const json = (x: unknown) => JSON.stringify(x ?? null);

export function flattenCatalog(settings: Settings, lists: Lists): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(settings)) out[`settings.${k}`] = v;
  for (const [k, v] of Object.entries(lists)) out[`lists.${k}`] = v;
  return out;
}

export function unflattenCatalog(values: Record<string, unknown>): { settings: Settings; lists: Lists } {
  const settings: Record<string, unknown> = { ...defaultSettings() };
  const lists: Record<string, unknown> = { ...defaultLists() };
  for (const [k, v] of Object.entries(values)) {
    if (k.startsWith('settings.')) settings[k.slice(9)] = v;
    else if (k.startsWith('lists.')) lists[k.slice(6)] = v;
  }
  const s = settings as unknown as Settings;
  s.templates = { ...defaultSettings().templates, ...s.templates };
  return { settings: s, lists: lists as unknown as Lists };
}

export class LocalStore {
  private shards: Map<string, Map<string, Envelope>> | null = null;
  private cat: CatalogBody | null = null;
  private queue: Promise<unknown> = Promise.resolve();
  clock: Clock | null = null;

  constructor(
    readonly db: KetsalDB,
    private readonly session: () => Session,
  ) {}

  /** Операции с шардами идут строго по очереди: шард читается, меняется и пишется целиком. */
  serial<T>(fn: () => Promise<T>): Promise<T> {
    const p = this.queue.then(fn, fn);
    this.queue = p.catch(() => undefined);
    return p;
  }

  /** Дождаться окончания всех записей. */
  idle(): Promise<void> {
    return this.serial(async () => undefined);
  }

  get unlocked(): boolean {
    return !!this.shards && !!this.cat;
  }

  // ── Служебные значения (открытые, без данных клиентов) ──

  async getMeta<T>(key: string): Promise<T | undefined> {
    return (await this.db.meta.get(key))?.value as T | undefined;
  }

  async setMeta(key: string, value: unknown): Promise<void> {
    await this.db.meta.put({ key, value });
  }

  async deviceId(): Promise<string> {
    let id = await this.getMeta<string>('deviceId');
    if (!id) {
      const b = new Uint8Array(6);
      crypto.getRandomValues(b);
      id = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
      await this.setMeta('deviceId', id);
    }
    return id;
  }

  private async ensureClock(): Promise<Clock> {
    if (!this.clock) this.clock = new Clock(await this.deviceId());
    return this.clock;
  }

  async getSyncMeta(): Promise<SyncMeta> {
    return (await this.getMeta<SyncMeta>('sync')) ?? { remoteCatalogRev: 0, remoteShardFiles: {}, lastSyncAt: '' };
  }

  async setSyncMeta(m: SyncMeta): Promise<void> {
    await this.setMeta('sync', m);
  }

  // ── Шифрование локальных строк ──

  private async sealShard(id: string, rev: number): Promise<ShardRow> {
    const { dek, vaultId } = this.session();
    const body: ShardBody = { format: 2, records: Array.from(this.shards!.get(id)!.values()) };
    return { id, rev, ct: await seal(dek, pack(body), aadFor(vaultId, 'shard', id, rev)) };
  }

  private async sealCatalog() {
    const { dek, vaultId } = this.session();
    const rev = this.cat!.catalogRev;
    return {
      id: 'catalog' as const,
      rev,
      ct: await seal(dek, pack(this.cat), aadFor(vaultId, 'catalog', 'catalog', rev)),
    };
  }

  /** Записать в базу перечисленные шарды и каталог, подняв их локальные ревизии. */
  private async persist(shardIds: Iterable<string>, outbox: Iterable<string> = []) {
    const rows: ShardRow[] = [];
    for (const s of shardIds) {
      this.cat!.shardRevs[s] = (this.cat!.shardRevs[s] ?? 0) + 1;
      rows.push(await this.sealShard(s, this.cat!.shardRevs[s]));
    }
    this.cat!.catalogRev += 1;
    const cat = await this.sealCatalog();
    const box = Array.from(new Set(outbox));
    const d = this.db;
    await d.transaction('rw', d.shards, d.catalog, d.outbox, async () => {
      if (rows.length) await d.shards.bulkPut(rows);
      await d.catalog.put(cat);
      if (box.length) await d.outbox.bulkAdd(box.map((shardId) => ({ shardId })));
    });
  }

  // ── Загрузка ──

  /** Расшифровать всю базу (после входа). Ошибку расшифровки не глотаем — её увидит пользователь. */
  async load(today: string): Promise<Data> {
    return this.serial(async () => {
      const { dek, vaultId } = this.session();
      const clock = await this.ensureClock();
      const catRow = await this.db.catalog.get('catalog');
      if (!catRow) throw new Error('catalog missing');
      const raw = unpack<CatalogBody | CatalogBodyV1>(
        await open(dek, catRow.ct, aadFor(vaultId, 'catalog', 'catalog', catRow.rev)),
      );
      if (raw.catalogRev !== catRow.rev) throw new Error('catalog rev mismatch');
      const migrate = raw.format === 1;
      const map = new Map<string, Map<string, Envelope>>(SHARD_IDS.map((id) => [id, new Map()]));
      for (const row of await this.db.shards.toArray()) {
        // Ревизия шарда должна совпадать с каталогом: так ловим подмену старой копией
        if ((raw.shardRevs[row.id] ?? 0) !== row.rev) throw new Error(`shard ${row.id} rev mismatch`);
        const body = unpack<ShardBody | ShardBodyV1>(
          await open(dek, row.ct, aadFor(vaultId, 'shard', row.id, row.rev)),
        );
        const m = map.get(row.id)!;
        for (const r of body.records) {
          if (body.format === 1) {
            const t = clock.tick();
            const v = r.v as Record<string, unknown>;
            m.set(r.id, {
              id: r.id,
              kind: r.kind,
              createdAt: r.createdAt,
              updatedAt: t,
              fieldUpdatedAt: Object.fromEntries(Object.keys(v).map((k) => [k, t])),
              v,
            });
          } else {
            const e = r as Envelope;
            clock.receive(e.updatedAt);
            m.set(e.id, e);
          }
        }
      }
      this.shards = map;
      if (raw.format === 1) {
        const values = flattenCatalog({ ...defaultSettings(), ...raw.settings }, { ...defaultLists(), ...raw.lists });
        const t = clock.tick();
        this.cat = {
          format: 2,
          catalogRev: raw.catalogRev,
          shardRevs: raw.shardRevs,
          values,
          fieldUpdatedAt: Object.fromEntries(Object.keys(values).map((k) => [k, t])),
        };
      } else {
        this.cat = raw;
        for (const t of Object.values(raw.fieldUpdatedAt)) clock.receive(t);
      }
      // Данные этапа 2 переписываем в новом формате и ставим в очередь на первую отправку
      if (migrate) await this.persist(SHARD_IDS, SHARD_IDS);
      return this.data(today);
    });
  }

  /** Текущие данные из памяти — без удалённых записей. */
  data(today: string): Data {
    const data = emptyData(today);
    for (const c of COLLS) (data[c] as unknown[]) = [];
    for (const m of this.shards!.values()) {
      for (const e of m.values()) {
        if (e.deleted || !e.v) continue;
        const coll = KIND_COLL[e.kind];
        if (coll) (data[coll] as unknown[]).push({ ...e.v, id: e.id, createdAt: e.createdAt });
      }
    }
    const { settings, lists } = unflattenCatalog(this.cat!.values);
    data.settings = settings;
    data.lists = lists;
    return data;
  }

  // ── Локальные изменения ──

  private stampPut(coll: Coll, item: Entity<object>, t: HLC): Envelope | null {
    const { id, createdAt, ...rest } = item as Entity<Record<string, unknown>>;
    const v = rest as Record<string, unknown>;
    const prev = this.shards!.get(shardOf(id))!.get(id);
    const live = prev && !prev.deleted && prev.v ? prev : null;
    const fu: Record<string, HLC> = { ...(live?.fieldUpdatedAt ?? {}) };
    let changed = !live;
    for (const k of new Set([...Object.keys(v), ...Object.keys(live?.v ?? {})])) {
      if (!live || json(live.v![k]) !== json(v[k])) {
        fu[k] = t;
        changed = true;
      }
    }
    if (!changed) return null;
    return { id, kind: COLL_KIND[coll], createdAt, updatedAt: t, fieldUpdatedAt: fu, v };
  }

  /** Применить изменения: проставить время по полям, перешифровать затронутые шарды и каталог. */
  writeChange(ch: Change): Promise<void> {
    return this.serial(async () => {
      if (!this.shards || !this.cat) throw new Error('locked');
      const clock = await this.ensureClock();
      const dirty = new Set<string>();
      const set = (e: Envelope) => {
        const s = shardOf(e.id);
        this.shards!.get(s)!.set(e.id, e);
        dirty.add(s);
      };
      for (const { coll, item } of ch.puts) {
        const e = this.stampPut(coll, item, clock.tick());
        if (e) set(e);
      }
      const tomb = (id: string, purged: boolean) => {
        const prev = this.shards!.get(shardOf(id))!.get(id);
        if (!prev || prev.purged || (prev.deleted && !purged)) return;
        set({
          id,
          kind: prev.kind,
          createdAt: prev.createdAt,
          updatedAt: clock.tick(),
          fieldUpdatedAt: {},
          deleted: true,
          ...(purged ? { purged: true as const } : {}),
        });
      };
      for (const id of ch.dels) tomb(id, false);
      for (const id of ch.purges ?? []) tomb(id, true);
      let catChanged = false;
      const next = {
        ...(ch.settings ? flattenCatalog(ch.settings, defaultLists()) : {}),
        ...(ch.lists ? flattenCatalog(defaultSettings(), ch.lists) : {}),
      };
      for (const [k, val] of Object.entries(next)) {
        const isSettings = k.startsWith('settings.');
        if ((isSettings && !ch.settings) || (!isSettings && !ch.lists)) continue;
        if (json(this.cat.values[k]) !== json(val)) {
          this.cat.values[k] = val;
          this.cat.fieldUpdatedAt[k] = clock.tick();
          catChanged = true;
        }
      }
      if (!dirty.size && !catChanged) return;
      // Каталог в очереди отправки отмечаем шардом с id 'catalog'
      await this.persist(dirty, catChanged ? [...dirty, 'catalog'] : dirty);
    });
  }

  /**
   * Записать всю базу заново (создание хранилища, демо-данные, очистка): новые и изменённые записи
   * ставятся как правки, отсутствующие в новых данных — удаляются. Так замена дойдёт и до других устройств.
   */
  async replaceAll(data: Data): Promise<void> {
    if (!this.shards) await this.initEmpty();
    const keep = new Set<string>();
    const puts: Change['puts'] = [];
    for (const c of COLLS) {
      for (const e of data[c] as Entity<object>[]) {
        keep.add(e.id);
        puts.push({ coll: c, item: e });
      }
    }
    const dels: string[] = [];
    for (const m of this.shards!.values())
      for (const e of m.values()) if (!e.deleted && !keep.has(e.id)) dels.push(e.id);
    await this.writeChange({ puts, dels, settings: data.settings, lists: data.lists });
  }

  /**
   * Пустое хранилище: все 16 шардов и каталог со значениями по умолчанию без отметок времени,
   * чтобы при первой синхронизации второго устройства победили данные с Диска.
   */
  initEmpty(): Promise<void> {
    return this.serial(async () => {
      await this.ensureClock();
      const prev = await this.db.catalog.get('catalog');
      this.shards = new Map(SHARD_IDS.map((id) => [id, new Map()]));
      this.cat = {
        format: 2,
        catalogRev: prev?.rev ?? 0,
        shardRevs: {},
        values: flattenCatalog(defaultSettings(), defaultLists()),
        fieldUpdatedAt: {},
      };
      await this.db.shards.clear();
      await this.persist(SHARD_IDS);
    });
  }

  // ── Для синхронизации ──

  shardEnvelopes(id: string): Envelope[] {
    return Array.from(this.shards!.get(id)!.values());
  }

  catalogState(): CatalogState {
    return { values: { ...this.cat!.values }, fieldUpdatedAt: { ...this.cat!.fieldUpdatedAt } };
  }

  /** Шарды (и 'catalog'), изменённые локально и ещё не отправленные. */
  async pending(): Promise<{ ids: Set<string>; maxSeq: number }> {
    const rows = await this.db.outbox.toArray();
    return { ids: new Set(rows.map((r) => r.shardId)), maxSeq: rows.reduce((m, r) => Math.max(m, r.seq ?? 0), 0) };
  }

  async clearPending(maxSeq: number): Promise<void> {
    await this.db.outbox.where('seq').belowOrEqual(maxSeq).delete();
  }

  /**
   * Подставить результат слияния с Диском. Изменённые записи с Диска в очередь отправки не ставятся,
   * кроме исправлений (дубль номера карты) — их передают в `fixes`.
   */
  applyMerged(shards: Map<string, Envelope[]>, catalog: CatalogState | null, fixes: Envelope[] = []): Promise<boolean> {
    return this.serial(async () => {
      const clock = await this.ensureClock();
      const dirty = new Set<string>();
      for (const [id, records] of shards) {
        const m = this.shards!.get(id)!;
        const before = json(Array.from(m.values()).sort((a, b) => (a.id < b.id ? -1 : 1)));
        const next = new Map(records.map((e) => [e.id, e]));
        for (const e of records) clock.receive(e.updatedAt);
        if (json(Array.from(next.values()).sort((a, b) => (a.id < b.id ? -1 : 1))) !== before) {
          this.shards!.set(id, next);
          dirty.add(id);
        }
      }
      const fixed = new Set<string>();
      for (const e of fixes) {
        const s = shardOf(e.id);
        this.shards!.get(s)!.set(e.id, e);
        dirty.add(s);
        fixed.add(s);
      }
      let catChanged = false;
      if (catalog && json(catalog) !== json(this.catalogState())) {
        this.cat!.values = catalog.values;
        this.cat!.fieldUpdatedAt = catalog.fieldUpdatedAt;
        for (const t of Object.values(catalog.fieldUpdatedAt)) clock.receive(t);
        catChanged = true;
      }
      if (!dirty.size && !catChanged) return false;
      await this.persist(dirty, fixed);
      return true;
    });
  }

  /** Время последнего изменения в данных — для отметок. */
  latest(): HLC {
    let t = '';
    for (const m of this.shards!.values()) for (const e of m.values()) t = maxHlc(t, e.updatedAt);
    return t;
  }

  /** Блокировка: расшифрованные данные больше не нужны в памяти. */
  forget() {
    this.shards = null;
    this.cat = null;
  }

  // ── Резервная копия (SPEC §9.1) ──

  /** id записей, удалённых на этом устройстве: из копии они не возвращаются (удаление окончательно). */
  tombstonedIds(): Set<string> {
    const out = new Set<string>();
    for (const m of this.shards!.values()) for (const e of m.values()) if (e.deleted) out.add(e.id);
    return out;
  }

  /**
   * «Объединить» с копией: слияние как при синхронизации (§7.1), изменённое ставится в очередь отправки.
   * Возвращает, изменились ли данные.
   */
  importMerged(records: Envelope[], catalog: CatalogState): Promise<boolean> {
    return this.serial(async () => {
      const clock = await this.ensureClock();
      const byShard = new Map<string, Envelope[]>();
      for (const e of records) {
        const s = shardOf(e.id);
        if (!byShard.has(s)) byShard.set(s, []);
        byShard.get(s)!.push(e);
        clock.receive(e.updatedAt);
      }
      const dirty = new Set<string>();
      for (const [s, recs] of byShard) {
        const m = this.shards!.get(s)!;
        const merged = mergeRecords(m.values(), recs);
        const before = json(Array.from(m.values()).sort((a, b) => (a.id < b.id ? -1 : 1)));
        if (json(merged) !== before) {
          this.shards!.set(s, new Map(merged.map((e) => [e.id, e])));
          dirty.add(s);
        }
      }
      const all = SHARD_IDS.flatMap((s) => Array.from(this.shards!.get(s)!.values()));
      for (const e of fixDuplicateCardNos(all, () => clock.tick())) {
        const s = shardOf(e.id);
        this.shards!.get(s)!.set(e.id, e);
        dirty.add(s);
      }
      for (const t of Object.values(catalog.fieldUpdatedAt)) clock.receive(t);
      const cat = mergeCatalog(this.catalogState(), catalog);
      const catChanged = json(cat) !== json(this.catalogState());
      if (catChanged) {
        this.cat!.values = cat.values;
        this.cat!.fieldUpdatedAt = cat.fieldUpdatedAt;
      }
      if (!dirty.size && !catChanged) return false;
      await this.persist(dirty, catChanged ? [...dirty, 'catalog'] : dirty);
      return true;
    });
  }

  /** Фото из копии: уже зашифровано ключом этого хранилища, встаёт в очередь на Диск. */
  async putImportedBlob(id: string, kind: PhotoKind, ct: Uint8Array): Promise<void> {
    const at = Date.now();
    await this.db.transaction('rw', this.db.blobs, this.db.photoUp, async () => {
      await this.db.blobs.put({ id, kind, ct, synced: false, at });
      await this.db.photoUp.put({ id, at });
    });
  }

  // ── Фото (SPEC §8): в базе и на Диске — конверт KTS1 с AAD `…|photo|<id>|1`, один и тот же ──

  /** Новые фото этого устройства: зашифровать, сохранить и поставить в очередь на загрузку. */
  async putBlobs(items: { id: string; blob: Blob; kind: PhotoKind }[]): Promise<void> {
    const { dek, vaultId } = this.session();
    const at = Date.now();
    const rows: BlobRow[] = [];
    for (const it of items) {
      const ct = await seal(dek, new Uint8Array(await it.blob.arrayBuffer()), aadFor(vaultId, 'photo', it.id, 1));
      rows.push({ id: it.id, kind: it.kind, ct, synced: false, at });
    }
    await this.db.transaction('rw', this.db.blobs, this.db.photoUp, async () => {
      await this.db.blobs.bulkPut(rows);
      await this.db.photoUp.bulkPut(rows.map((r) => ({ id: r.id, at })));
    });
  }

  async getBlob(id: string): Promise<Blob | null> {
    const row = await this.db.blobs.get(id);
    if (!row) return null;
    const { dek, vaultId } = this.session();
    const pt = await open(dek, row.ct, aadFor(vaultId, 'photo', id, 1));
    return new Blob([pt.slice().buffer as ArrayBuffer], { type: 'image/jpeg' });
  }

  /** Файл, скачанный с Диска: проверить, что он наш и цел (иначе DecryptError), и сохранить. */
  async putDownloaded(id: string, kind: PhotoKind, ct: Uint8Array): Promise<Blob> {
    const { dek, vaultId } = this.session();
    const pt = await open(dek, ct, aadFor(vaultId, 'photo', id, 1));
    await this.db.blobs.put({ id, kind, ct, synced: true, at: Date.now() });
    return new Blob([pt.slice().buffer as ArrayBuffer], { type: 'image/jpeg' });
  }

  /** Убрать фото с устройства; то, что уже было на Диске, — в очередь на удаление оттуда. */
  async deletePhotos(refs: PhotoRef[]): Promise<void> {
    const files = Array.from(photoFiles(refs));
    if (!files.length) return;
    const ids = files.map(([id]) => id);
    await this.db.transaction('rw', this.db.blobs, this.db.photoUp, this.db.photoDel, async () => {
      // Ещё не загруженное на Диск удалять оттуда не нужно
      const notUploaded = new Set(await this.db.photoUp.where('id').anyOf(ids).primaryKeys());
      await this.db.blobs.bulkDelete(ids);
      await this.db.photoUp.bulkDelete(ids);
      await this.db.photoDel.bulkPut(files.filter(([id]) => !notUploaded.has(id)).map(([id, kind]) => ({ id, kind })));
    });
  }

  /** Очередь загрузки: id в порядке появления. */
  async uploadQueue(): Promise<string[]> {
    return (await this.db.photoUp.toArray()).sort((a, b) => a.at - b.at || (a.id < b.id ? -1 : 1)).map((r) => r.id);
  }

  async blobRow(id: string): Promise<BlobRow | undefined> {
    return this.db.blobs.get(id);
  }

  async markUploaded(id: string): Promise<void> {
    await this.db.transaction('rw', this.db.blobs, this.db.photoUp, async () => {
      await this.db.blobs.update(id, { synced: true });
      await this.db.photoUp.delete(id);
    });
  }

  async deleteQueue(): Promise<PhotoDelRow[]> {
    return this.db.photoDel.toArray();
  }

  async markRemoteDeleted(id: string): Promise<void> {
    await this.db.photoDel.delete(id);
  }

  /** Какие из файлов уже есть на устройстве. */
  async presentBlobs(ids: string[]): Promise<Set<string>> {
    return new Set(await this.db.blobs.where('id').anyOf(ids).primaryKeys());
  }

  /** Все файлы на устройстве: id и когда появились (без шифротекста, чтобы не грузить память). */
  async blobAges(): Promise<{ id: string; at: number }[]> {
    const out: { id: string; at: number }[] = [];
    await this.db.blobs.each((b) => {
      out.push({ id: b.id, at: b.at ?? 0 });
    });
    return out;
  }

  /** Стереть файлы только с устройства (на них больше нет ссылок в данных). */
  async dropLocalBlobs(ids: string[]): Promise<void> {
    if (!ids.length) return;
    await this.db.transaction('rw', this.db.blobs, this.db.photoUp, async () => {
      await this.db.blobs.bulkDelete(ids);
      await this.db.photoUp.bulkDelete(ids);
    });
  }

  async clearBlobs(): Promise<void> {
    await this.db.transaction('rw', this.db.blobs, this.db.photoUp, async () => {
      await this.db.blobs.clear();
      await this.db.photoUp.clear();
    });
  }
}
