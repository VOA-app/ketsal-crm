// Состояние данных приложения. Экраны читают data и idx и меняют данные только через apply().
// Вход, создание хранилища и блокировка — тоже здесь: экраны не обращаются к crypto напрямую.
import { create } from 'zustand';
import { todayISO } from '../domain/dates';
import { emptyData } from '../domain/defaults';
import { buildIndex, type DomainIndex } from '../domain/indexing';
import type { Data, Entity, Lists, Settings } from '../domain/types';
import { COLLS, type Coll, type Item } from '../db/kinds';
import { endSession, startSession } from '../crypto/session';
import {
  createVault,
  setPassword,
  unlockWithPassword,
  unlockWithRecovery,
  WrongSecretError,
  type CreatedVault,
} from '../crypto/vault';
import { ulid } from '../domain/ids';
import {
  clearLegacy,
  deleteBlobs,
  forgetDecrypted,
  getVaultHeader,
  hasLegacyData,
  loadData,
  loadLegacyData,
  putBlobs,
  replaceAll,
  requestPersist,
  saveVaultHeader,
  writeChange,
  type Change,
} from '../db/repo';
import { revokeAll } from '../media/cache';
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
  /** onboarding — хранилища ещё нет; locked — есть, но ключа в памяти нет */
  status: 'loading' | 'onboarding' | 'locked' | 'ready' | 'error';
  data: Data;
  idx: DomainIndex;
  unlockedAt: number;
  init(): Promise<void>;
  /** Онбординг: создать хранилище в памяти и вернуть ключ восстановления (на устройство пишет finishVault) */
  prepareVault(password: string): Promise<string>;
  finishVault(choice: StartChoice): Promise<void>;
  cancelVault(): void;
  /** На устройстве остались открытые данные пробной версии этапа 1 */
  legacyExists(): Promise<boolean>;
  unlock(password: string): Promise<UnlockResult>;
  checkRecovery(code: string): Promise<UnlockResult>;
  /** Забытый пароль: ключ восстановления и новый пароль */
  resetPassword(code: string, newPassword: string): Promise<UnlockResult>;
  lock(): void;
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

/** Результат входа для экранов: экраны не знают о типах ошибок криптографии. */
export type UnlockResult = 'ok' | 'wrong' | 'error';

export type StartChoice = 'empty' | 'demo';

/** Хранилище, созданное в онбординге, но ещё не записанное: ждёт проверки ключа восстановления. */
let pending: CreatedVault | null = null;

export const useData = create<DataState>((set, get) => {
  const T = todayISO();
  const initial = emptyData(T);
  const cleared = () => {
    const d = emptyData(todayISO());
    return { data: d, idx: buildIndex(d, todayISO()) };
  };

  async function openSession(dek: CryptoKey, vaultId: string) {
    startSession({ dek, vaultId });
    const today = todayISO();
    const data = await loadData(today);
    set({ status: 'ready', data, idx: buildIndex(data, today), unlockedAt: Date.now() });
  }

  return {
    status: 'loading',
    data: initial,
    idx: buildIndex(initial, T),
    unlockedAt: 0,

    async init() {
      try {
        void requestPersist();
        const header = await getVaultHeader();
        set({ status: header ? 'locked' : 'onboarding' });
      } catch (e) {
        console.error(e instanceof Error ? e.name : 'init error');
        set({ status: 'error' });
      }
    },

    async prepareVault(password) {
      pending = await createVault(password, ulid(), new Date().toISOString());
      return pending.recovery;
    },

    async finishVault(choice) {
      if (!pending) throw new Error('no pending vault');
      const v = pending;
      pending = null;
      const today = todayISO();
      startSession({ dek: v.dek, vaultId: v.header.vaultId });
      // Открытые данные этапа 1, если они есть на устройстве, переносим и сразу стираем
      const legacy = await loadLegacyData(today);
      let data: Data;
      if (legacy) data = legacy.data;
      else if (choice === 'demo' && DEMO_ENABLED) data = (await import('../dev/demo')).buildDemo(today);
      else data = emptyData(today);
      await replaceAll(data);
      if (legacy?.blobs.length) await putBlobs(legacy.blobs.map((b) => ({ ...b, kind: 'photo' as const })));
      await saveVaultHeader(v.header);
      if (legacy) await clearLegacy();
      set({ status: 'ready', data, idx: buildIndex(data, today), unlockedAt: Date.now() });
    },

    cancelVault() {
      pending = null;
    },

    legacyExists: () => hasLegacyData().catch(() => false),

    async unlock(password) {
      try {
        const header = await getVaultHeader();
        if (!header) return 'error';
        const dek = await unlockWithPassword(header, password);
        await openSession(dek, header.vaultId);
        return 'ok';
      } catch (e) {
        endSession();
        if (e instanceof WrongSecretError) return 'wrong';
        console.error(e instanceof Error ? e.name : 'unlock error');
        return 'error';
      }
    },

    async checkRecovery(code) {
      try {
        const header = await getVaultHeader();
        if (!header) return 'error';
        await unlockWithRecovery(header, code);
        return 'ok';
      } catch (e) {
        return e instanceof WrongSecretError ? 'wrong' : 'error';
      }
    },

    async resetPassword(code, newPassword) {
      try {
        const header = await getVaultHeader();
        if (!header) return 'error';
        const next = await setPassword(header, { recovery: code }, newPassword);
        await saveVaultHeader(next);
        const dek = await unlockWithPassword(next, newPassword);
        await openSession(dek, next.vaultId);
        return 'ok';
      } catch (e) {
        endSession();
        if (e instanceof WrongSecretError) return 'wrong';
        console.error(e instanceof Error ? e.name : 'reset error');
        return 'error';
      }
    },

    lock() {
      if (get().status !== 'ready') return;
      // Ключ и расшифрованные данные — из памяти; несохранённые формы не восстанавливаются
      endSession();
      forgetDecrypted();
      revokeAll();
      const ui = useUi.getState();
      ui.closeAllSheets();
      ui.closeViewer();
      ui.closePrint();
      ui.hideToast();
      set({ status: 'locked', ...cleared(), unlockedAt: 0 });
    },

    apply(fn) {
      if (get().status !== 'ready') return;
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
