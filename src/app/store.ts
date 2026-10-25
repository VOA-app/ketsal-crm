// Состояние данных приложения. Экраны читают data и idx и меняют данные только через apply().
import { create } from 'zustand';
import { todayISO } from '../domain/dates';
import { emptyData } from '../domain/defaults';
import { buildIndex, type DomainIndex } from '../domain/indexing';
import type { Data, Entity, Lists, Settings } from '../domain/types';
import { COLLS, type Coll, type Item } from '../db/kinds';
import { deleteBlobs, loadData, replaceAll, requestPersist, writeChange, type Change } from '../db/repo';
import { ru } from '../i18n/ru';
import { useUi } from './ui';

/** Демо-набор доступен только в сборке для разработки (SPEC §4.3) и в превью с VITE_DEMO=1. */
export const DEMO_ENABLED = import.meta.env.DEV || import.meta.env.VITE_DEMO === '1';

export interface Tx {
  /** Данные с уже применёнными в этой транзакции изменениями */
  readonly data: Data;
  put<C extends Coll>(coll: C, item: Item<C>): void;
  del(coll: Coll, id: string): void;
  settings(patch: Partial<Settings>): void;
  lists(patch: Partial<Lists>): void;
  /** Фото, которые надо стереть с устройства после сохранения */
  dropBlobs(ids: string[]): void;
}

interface DataState {
  status: 'loading' | 'ready' | 'error';
  data: Data;
  idx: DomainIndex;
  load(): Promise<void>;
  apply(fn: (tx: Tx) => void): void;
  replace(data: Data): Promise<void>;
  refreshToday(): void;
}

function makeTx(base: Data) {
  const data: Data = { ...base };
  const copied = new Set<Coll>();
  const change: Change = { puts: [], dels: [] };
  const blobs: string[] = [];
  const own = <C extends Coll>(coll: C) => {
    if (!copied.has(coll)) {
      (data[coll] as unknown[]) = (data[coll] as unknown[]).slice();
      copied.add(coll);
    }
    return data[coll] as unknown as Entity<object>[];
  };
  const tx: Tx = {
    get data() {
      return data;
    },
    put(coll, item) {
      const arr = own(coll);
      const i = arr.findIndex((x) => x.id === item.id);
      if (i >= 0) arr[i] = item as Entity<object>;
      else arr.push(item as Entity<object>);
      change.puts = change.puts.filter((p) => p.item.id !== item.id);
      change.puts.push({ coll, item: item as Entity<object> });
    },
    del(coll, id) {
      const arr = own(coll);
      const i = arr.findIndex((x) => x.id === id);
      if (i >= 0) arr.splice(i, 1);
      change.puts = change.puts.filter((p) => p.item.id !== id);
      change.dels.push(id);
    },
    settings(patch) {
      data.settings = { ...data.settings, ...patch };
      change.settings = data.settings;
    },
    lists(patch) {
      data.lists = { ...data.lists, ...patch };
      change.lists = data.lists;
    },
    dropBlobs(ids) {
      blobs.push(...ids.filter((id) => id && !id.startsWith('demo:')));
    },
  };
  return { tx, data, change, blobs };
}

const saveFailed = (e: unknown) => {
  console.error(e instanceof Error ? e.name : 'save error');
  useUi.getState().toast(ru.common.saveFailed);
};

export const useData = create<DataState>((set, get) => {
  const T = todayISO();
  const initial = emptyData(T);
  return {
    status: 'loading',
    data: initial,
    idx: buildIndex(initial, T),

    async load() {
      const today = todayISO();
      try {
        void requestPersist();
        let data = await loadData(today);
        if (!data) {
          if (DEMO_ENABLED) {
            const { buildDemo } = await import('../dev/demo');
            data = buildDemo(today);
          } else data = emptyData(today);
          await replaceAll(data);
        }
        set({ status: 'ready', data, idx: buildIndex(data, today) });
      } catch (e) {
        console.error(e instanceof Error ? e.name : 'load error');
        set({ status: 'error' });
      }
    },

    apply(fn) {
      const { tx, data, change, blobs } = makeTx(get().data);
      fn(tx);
      set({ data, idx: buildIndex(data, todayISO()) });
      writeChange(change)
        .then(() => deleteBlobs(blobs))
        .catch(saveFailed);
    },

    async replace(data) {
      set({ data, idx: buildIndex(data, todayISO()) });
      try {
        await replaceAll(data);
      } catch (e) {
        saveFailed(e);
      }
    },

    refreshToday() {
      const today = todayISO();
      if (get().idx.today !== today) set({ idx: buildIndex(get().data, today) });
    },
  };
});

/** Все id фото в данных — чтобы при очистке базы стереть файлы. */
export function allBlobIds(data: Data): string[] {
  const out: string[] = [];
  const add = (r: { blobId: string; thumbId: string } | null | undefined) => {
    if (r) out.push(r.blobId, r.thumbId);
  };
  for (const c of data.clients) {
    add(c.facePhoto);
    c.consents?.pd?.photos?.forEach(add);
    c.consents?.procedure?.photos?.forEach(add);
  }
  for (const p of data.procedures) Object.values(p.photos || {}).forEach((arr) => arr.forEach(add));
  return out;
}

export { COLLS };
