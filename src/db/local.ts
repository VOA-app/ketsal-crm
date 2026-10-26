// Локальная база в IndexedDB (Dexie), SPEC §4.5. В ней только шифротекст и служебные поля.
//
// Версия 1 (этап 1) хранила записи открытым текстом в таблицах dev*. Версия 2 добавила
// шифрованные таблицы; dev* остаются только чтобы при создании хранилища перенести старые
// данные и сразу их стереть. Следующая версия схемы удалит dev* совсем.
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
  synced: boolean;
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
  }
}

let instance: KetsalDB | null = null;
export const db = (): KetsalDB => (instance ??= new KetsalDB());

/** Для тестов: другая база (fake-indexeddb). */
export function setDb(d: KetsalDB) {
  instance = d;
}
