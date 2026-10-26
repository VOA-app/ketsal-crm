// Состояние данных приложения. Экраны читают data и idx и меняют данные только через apply().
// Вход, создание хранилища и блокировка — тоже здесь: экраны не обращаются к crypto напрямую.
import { create } from 'zustand';
import { todayISO } from '../domain/dates';
import { emptyData } from '../domain/defaults';
import { buildIndex, type DomainIndex } from '../domain/indexing';
import type { Data, Entity, Lists, PhotoRef, Settings } from '../domain/types';
import { COLLS, type Coll, type Item } from '../db/kinds';
import { endSession, startSession } from '../crypto/session';
import {
  createVault,
  setPassword,
  type VaultHeader,
  unlockWithPassword,
  unlockWithRecovery,
  WrongSecretError,
  type CreatedVault,
} from '../crypto/vault';
import { ulid } from '../domain/ids';
import {
  clearLegacy,
  currentData,
  deletePhotos,
  forgetDecrypted,
  getVaultHeader,
  hasLegacyData,
  initEmpty,
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
import { completeLogin } from '../auth/yandex-oauth';
import { enableDevRemote, failureOf, isConnected, remoteHeader, saveToken } from '../sync/service';
import { setOnSyncChanged, stopSync, syncNow, syncSoon, useSync } from './sync';
import { ru } from '../i18n/ru';
import { useUi } from './ui';

/** Демо-набор доступен только в сборке для разработки (SPEC §4.3) и в превью с VITE_DEMO=1. */
export const DEMO_ENABLED = import.meta.env.DEV || import.meta.env.VITE_DEMO === '1';

export interface Tx {
  /** Данные с уже применёнными в этой транзакции изменениями */
  readonly data: Data;
  put<C extends Coll>(coll: C, item: Item<C>): void;
  del(coll: Coll, id: string): void;
  /** Полное удаление (§1.3): запись исчезнет и на других устройствах, правки её не вернут */
  purge(coll: Coll, id: string): void;
  settings(patch: Partial<Settings>): void;
  lists(patch: Partial<Lists>): void;
  /** Фото, которые надо стереть с устройства и с Диска после сохранения */
  dropPhotos(refs: PhotoRef[]): void;
}

interface DataState {
  /** onboarding — хранилища ещё нет; locked — есть, но ключа в памяти нет */
  status: 'loading' | 'onboarding' | 'locked' | 'ready' | 'error';
  data: Data;
  idx: DomainIndex;
  unlockedAt: number;
  init(): Promise<void>;
  /** Онбординг после входа в Яндекс: есть ли хранилище на Диске */
  remoteCheck(): Promise<RemoteCheck>;
  /** Второе устройство: открыть хранилище с Диска мастер-паролем */
  joinVault(password: string): Promise<UnlockResult>;
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
  /** Перечитать данные из базы устройства (после восстановления из копии) и отправить на Диск */
  reload(): void;
  refreshToday(): void;
}

function makeTx(base: Data) {
  const data: Data = { ...base };
  const copied = new Set<Coll>();
  const change: Change = { puts: [], dels: [] };
  const photos: PhotoRef[] = [];
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
    purge(coll, id) {
      const arr = own(coll);
      const i = arr.findIndex((x) => x.id === id);
      if (i >= 0) arr.splice(i, 1);
      change.puts = change.puts.filter((p) => p.item.id !== id);
      (change.purges ??= []).push(id);
    },
    settings(patch) {
      data.settings = { ...data.settings, ...patch };
      change.settings = data.settings;
    },
    lists(patch) {
      data.lists = { ...data.lists, ...patch };
      change.lists = data.lists;
    },
    dropPhotos(refs) {
      photos.push(...refs.filter((r) => r.blobId && !r.blobId.startsWith('demo:')));
    },
  };
  return { tx, data, change, photos };
}

const saveFailed = (e: unknown) => {
  console.error(e instanceof Error ? e.name : 'save error');
  useUi.getState().toast(ru.common.saveFailed);
};

/** Результат входа для экранов: экраны не знают о типах ошибок криптографии. */
export type UnlockResult = 'ok' | 'wrong' | 'error';

export type StartChoice = 'empty' | 'demo';

/** create — на Диске пусто, создаём; join — там уже есть хранилище; off — Диск не подключён */
export type RemoteCheck = 'create' | 'join' | 'off' | 'offline' | 'auth' | 'error';

/** Заголовок хранилища с Диска, найденный в онбординге второго устройства. */
let remoteVault: VaultHeader | null = null;

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
    void syncNow();
  }

  // Синхронизация принесла изменения — показать их
  setOnSyncChanged(() => {
    if (get().status !== 'ready') return;
    const today = todayISO();
    const data = currentData(today);
    set({ data, idx: buildIndex(data, today) });
  });

  return {
    status: 'loading',
    data: initial,
    idx: buildIndex(initial, T),
    unlockedAt: 0,

    async init() {
      try {
        void requestPersist();
        if (DEMO_ENABLED && import.meta.env.VITE_DEV_REMOTE === '1') enableDevRemote();
        // Вернулись со страницы входа Яндекса: обменять код на токен
        const login = await completeLogin();
        if (login && 'token' in login) await saveToken(login.token);
        else if (login && 'error' in login) setTimeout(() => useUi.getState().toast(ru.sync.loginFailed), 300);
        const header = await getVaultHeader();
        await useSync.getState().refresh();
        set({ status: header ? 'locked' : 'onboarding' });
      } catch (e) {
        console.error(e instanceof Error ? e.name : 'init error');
        set({ status: 'error' });
      }
    },

    async remoteCheck() {
      if (!(await isConnected())) return 'off';
      try {
        remoteVault = await remoteHeader();
        return remoteVault ? 'join' : 'create';
      } catch (e) {
        const f = failureOf(e);
        return f === 'offline' || f === 'auth' ? f : 'error';
      }
    },

    async joinVault(password) {
      const header = remoteVault;
      if (!header) return 'error';
      try {
        const dek = await unlockWithPassword(header, password);
        startSession({ dek, vaultId: header.vaultId });
        await initEmpty();
        await saveVaultHeader(header);
        const today = todayISO();
        set({
          status: 'ready',
          data: currentData(today),
          idx: buildIndex(currentData(today), today),
          unlockedAt: Date.now(),
        });
        await syncNow();
        return 'ok';
      } catch (e) {
        if (e instanceof WrongSecretError) return 'wrong';
        console.error(e instanceof Error ? e.name : 'join error');
        return 'error';
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
      void syncNow();
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
      stopSync();
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
      const { tx, data, change, photos } = makeTx(get().data);
      fn(tx);
      set({ data, idx: buildIndex(data, todayISO()) });
      writeChange(change)
        .then(() => deletePhotos(photos))
        .then(syncSoon)
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

    reload() {
      if (get().status !== 'ready') return;
      const today = todayISO();
      const data = currentData(today);
      set({ data, idx: buildIndex(data, today) });
      syncSoon();
    },

    refreshToday() {
      const today = todayISO();
      if (get().idx.today !== today) set({ idx: buildIndex(get().data, today) });
    },
  };
});

export { COLLS };
