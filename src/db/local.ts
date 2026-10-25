// Локальная база в IndexedDB (Dexie).
//
// Версия 1 — временная схема этапа 1: записи лежат ОТКРЫТЫМ ТЕКСТОМ за флагом DEV_PLAINTEXT.
// На этапе 2 появится версия 2 со схемой SPEC §4.5 (meta, shards, catalog, blobs, outbox —
// только шифротекст), а таблицы dev* будут удалены миграцией.
import Dexie, { type Table } from 'dexie';
import type { Kind } from './kinds';

/** Этап 1: хранить данные без шифрования. Удаляется на этапе 2 (SPEC §12). */
export const DEV_PLAINTEXT = true;

export interface DevRecord {
  id: string;
  kind: Kind;
  createdAt: string;
  v: unknown;
}

export interface DevCatalog {
  key: 'settings' | 'lists';
  value: unknown;
}

export interface DevBlob {
  id: string;
  blob: Blob;
}

export class KetsalDB extends Dexie {
  devRecords!: Table<DevRecord, string>;
  devCatalog!: Table<DevCatalog, string>;
  devBlobs!: Table<DevBlob, string>;

  constructor(name = 'ketsal') {
    super(name);
    this.version(1).stores({
      devRecords: 'id, kind',
      devCatalog: 'key',
      devBlobs: 'id',
    });
  }
}

let instance: KetsalDB | null = null;
export const db = (): KetsalDB => (instance ??= new KetsalDB());
