// Чтение и запись данных на устройстве. Пока — открытым текстом за флагом DEV_PLAINTEXT (этап 1);
// на этапе 2 здесь появится шифрование конвертов (SPEC §5.2) и шарды (§4.5).
import { DEV_PLAINTEXT, db } from './local';
import { COLL_KIND, COLLS, KIND_COLL, type Coll } from './kinds';
import { defaultLists, defaultSettings, emptyData } from '../domain/defaults';
import type { Data, Entity, Lists, Settings } from '../domain/types';

function assertDev() {
  if (!DEV_PLAINTEXT) throw new Error('Plaintext storage is disabled');
}

/** Данные с устройства или null, если база пустая. */
export async function loadData(today: string): Promise<Data | null> {
  assertDev();
  const [records, catalog] = await Promise.all([db().devRecords.toArray(), db().devCatalog.toArray()]);
  if (!records.length && !catalog.length) return null;
  const data = emptyData(today);
  for (const c of COLLS) (data[c] as unknown[]) = [];
  for (const r of records) {
    const coll = KIND_COLL[r.kind];
    if (!coll) continue;
    (data[coll] as unknown[]).push({ ...(r.v as object), id: r.id, createdAt: r.createdAt });
  }
  const settings = catalog.find((x) => x.key === 'settings')?.value as Partial<Settings> | undefined;
  const lists = catalog.find((x) => x.key === 'lists')?.value as Partial<Lists> | undefined;
  // Недостающие поля берём из значений по умолчанию: так переживаем добавление новых настроек
  data.settings = {
    ...defaultSettings(),
    ...settings,
    templates: { ...defaultSettings().templates, ...settings?.templates },
  };
  data.lists = { ...defaultLists(), ...lists };
  return data;
}

const toRecord = (coll: Coll, e: Entity<object>) => {
  const { id, createdAt, ...v } = e;
  return { id, kind: COLL_KIND[coll], createdAt, v };
};

export interface Change {
  puts: { coll: Coll; item: Entity<object> }[];
  dels: string[];
  settings?: Settings;
  lists?: Lists;
}

export async function writeChange(ch: Change): Promise<void> {
  assertDev();
  const d = db();
  await d.transaction('rw', d.devRecords, d.devCatalog, async () => {
    if (ch.puts.length) await d.devRecords.bulkPut(ch.puts.map((p) => toRecord(p.coll, p.item)));
    if (ch.dels.length) await d.devRecords.bulkDelete(ch.dels);
    if (ch.settings) await d.devCatalog.put({ key: 'settings', value: ch.settings });
    if (ch.lists) await d.devCatalog.put({ key: 'lists', value: ch.lists });
  });
}

/** Заменить всю базу (демо-данные, очистка). */
export async function replaceAll(data: Data): Promise<void> {
  assertDev();
  const d = db();
  await d.transaction('rw', d.devRecords, d.devCatalog, async () => {
    await d.devRecords.clear();
    await d.devCatalog.clear();
    const all = COLLS.flatMap((c) => (data[c] as Entity<object>[]).map((e) => toRecord(c, e)));
    await d.devRecords.bulkPut(all);
    await d.devCatalog.bulkPut([
      { key: 'settings', value: data.settings },
      { key: 'lists', value: data.lists },
    ]);
  });
}

// ── Фото ──

export async function putBlobs(items: { id: string; blob: Blob }[]): Promise<void> {
  assertDev();
  await db().devBlobs.bulkPut(items);
}

export async function getBlob(id: string): Promise<Blob | null> {
  assertDev();
  return (await db().devBlobs.get(id))?.blob ?? null;
}

export async function deleteBlobs(ids: string[]): Promise<void> {
  assertDev();
  if (ids.length) await db().devBlobs.bulkDelete(ids);
}

export async function clearBlobs(): Promise<void> {
  assertDev();
  await db().devBlobs.clear();
}

/** Просим браузер не стирать базу при нехватке места (SPEC: на старте вызывать persist). */
export async function requestPersist(): Promise<void> {
  try {
    if (navigator.storage?.persist && !(await navigator.storage.persisted())) await navigator.storage.persist();
  } catch {
    // не критично
  }
}
