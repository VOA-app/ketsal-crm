// Данные на этом устройстве (SPEC §4.5): тонкая обёртка над LocalStore для приложения.
// В IndexedDB попадает только шифротекст. Исключение — заголовок vault.json (SPEC §5.3) и служебные
// поля без данных клиентов (id устройства, ревизии синхронизации).
import { requireSession } from '../crypto/session';
import type { VaultHeader } from '../crypto/vault';
import { defaultLists, defaultSettings, emptyData } from '../domain/defaults';
import type { Data, Lists, Settings } from '../domain/types';
import { COLLS, KIND_COLL } from './kinds';
import { db } from './local';
import { LocalStore, type Change } from './localStore';

export type { Change };

let store: LocalStore | null = null;

/** Хранилище этого устройства (пересоздаётся, если в тестах подменили базу). */
export function local(): LocalStore {
  const d = db();
  if (!store || store.db !== d) store = new LocalStore(d, requireSession);
  return store;
}

// ── Заголовок хранилища ──

export async function getVaultHeader(): Promise<VaultHeader | null> {
  return (await local().getMeta<VaultHeader>('vault')) ?? null;
}

export async function saveVaultHeader(h: VaultHeader): Promise<void> {
  await local().setMeta('vault', h);
}

// ── Записи ──

export const loadData = (today: string): Promise<Data> => local().load(today);
export const writeChange = (ch: Change): Promise<void> => local().writeChange(ch);
export const replaceAll = (data: Data): Promise<void> => local().replaceAll(data);
export const initEmpty = (): Promise<void> => local().initEmpty();
export const currentData = (today: string): Data => local().data(today);

/** Блокировка: расшифрованные шарды больше не нужны в памяти. */
export function forgetDecrypted() {
  store?.forget();
}

// ── Фото ──

export const putBlobs = (items: { id: string; blob: Blob; kind: 'photo' | 'thumb' }[]) => local().putBlobs(items);
export const getBlob = (id: string) => local().getBlob(id);

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
  const data = emptyData(today);
  for (const c of COLLS) (data[c] as unknown[]) = [];
  for (const r of records) {
    const coll = KIND_COLL[r.kind];
    if (coll) (data[coll] as unknown[]).push({ ...(r.v as object), id: r.id, createdAt: r.createdAt });
  }
  const settings = cat.find((x) => x.key === 'settings')?.value as Partial<Settings> | undefined;
  const lists = cat.find((x) => x.key === 'lists')?.value as Partial<Lists> | undefined;
  data.settings = {
    ...defaultSettings(),
    ...settings,
    templates: { ...defaultSettings().templates, ...settings?.templates },
  };
  data.lists = { ...defaultLists(), ...lists };
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
