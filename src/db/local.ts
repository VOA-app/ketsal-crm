// Локальная база в IndexedDB (Dexie), SPEC §4.5. В ней только шифротекст и служебные поля.
//
// Версия 1 (этап 1) хранила записи открытым текстом в таблицах dev*. Версия 2 добавила
// шифрованные таблицы; dev* остаются только чтобы при создании хранилища перенести старые
// данные и сразу их стереть. Следующая версия схемы удалит dev* совсем.
// Версия 3 (этап 4) добавила очереди фото: загрузка на Диск и удаление с Диска.
import Dexie, { type Table } from 'dexie';
import type { Kind } from './kinds';

/** Устаревшие таблицы этапа 1 — читаются один раз для переноса. */
export interface LegacyRecord {
  id: string;
  kind: Kind;
  createdAt: string;
  v: unknown;
}
export interface LegacyCatalog {
  key: 'settings' | 'lists';
  value: unknown;
}
export interface LegacyBlob {
  id: string;
  blob: Blob;
}

export interface MetaRow {
  key: string;
  value: unknown;
}

/** Шард записей: id '00'…'0f', ревизия и конверт KTS1. */
export interface ShardRow {
  id: string;
  rev: number;
  ct: Uint8Array;
}

export interface CatalogRow {
  id: 'catalog';
  rev: number;
  ct: Uint8Array;
}

export interface BlobRow {
  id: string;
  kind: 'photo' | 'thumb';
  ct: Uint8Array;
  /** Файл есть на Диске (загружен этим устройством или скачан оттуда) */
  synced: boolean;
  /** Когда файл появился на устройстве, мс. У строк до этапа 4 нет */
  at?: number;
}

/** Фото этого устройства, которое ещё не загружено на Диск. */
export interface PhotoUpRow {
  id: string;
  at: number;
}

/** Файл, который надо удалить с Диска (фото убрали из карты или процедуры). */
export interface PhotoDelRow {
  id: string;
  kind: 'photo' | 'thumb';
}

export interface OutboxRow {
  seq?: number;
  shardId: string;
}

export class KetsalDB extends Dexie {
  devRecords!: Table<LegacyRecord, string>;
  devCatalog!: Table<LegacyCatalog, string>;
  devBlobs!: Table<LegacyBlob, string>;
  meta!: Table<MetaRow, string>;
  shards!: Table<ShardRow, string>;
  catalog!: Table<CatalogRow, string>;
  blobs!: Table<BlobRow, string>;
  outbox!: Table<OutboxRow, number>;
  photoUp!: Table<PhotoUpRow, string>;
  photoDel!: Table<PhotoDelRow, string>;

  constructor(name = 'ketsal') {
    super(name);
    this.version(1).stores({
      devRecords: 'id, kind',
      devCatalog: 'key',
      devBlobs: 'id',
    });
    this.version(2).stores({
      meta: 'key',
      shards: 'id',
      catalog: 'id',
      blobs: 'id, synced',
      outbox: '++seq',
    });
    // Индекс по synced не работал: в IndexedDB булевы значения не индексируются. Очередь — отдельная таблица
    this.version(3)
      .stores({ blobs: 'id', photoUp: 'id', photoDel: 'id' })
      .upgrade(async (tx) => {
        const up: PhotoUpRow[] = [];
        await tx.table<BlobRow, string>('blobs').each((b) => {
          if (!b.synced) up.push({ id: b.id, at: b.at ?? 0 });
        });
        await tx.table<PhotoUpRow, string>('photoUp').bulkPut(up);
      });
  }
}

let instance: KetsalDB | null = null;
export const db = (): KetsalDB => (instance ??= new KetsalDB());

/** Для тестов: другая база (fake-indexeddb). */
export function setDb(d: KetsalDB) {
  instance = d;
}
