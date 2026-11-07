// Состояние синхронизации для экранов и её запуск (SPEC §7.2): при входе, при возврате в приложение,
// через 3 секунды после изменения, по кнопке и при появлении сети. Одновременно идёт один цикл.
import { create } from 'zustand';
import { ru } from '../i18n/ru';
import { startLogin } from '../auth/yandex-oauth';
import { getVaultHeader } from '../db/repo';
import { draftPhotoIds } from '../media/cache';
import type { SpaceInfo } from '../domain/space';
import {
  diskSpace,
  failureDetail,
  failureOf,
  isConnected,
  lastSyncAt,
  runPhotos,
  runSync,
  type SyncFailure,
} from '../sync/service';

export type SyncState = 'off' | 'syncing' | 'ok' | SyncFailure;

interface SyncStore {
  state: SyncState;
  /** Время последней удачной синхронизации, ISO */
  at: string;
  /** Фото этого устройства, которые ещё не загружены на Диск */
  photosLeft: number;
  /** Подробность последней ошибки (адрес сервера, ответ браузера) */
  detail: string;
  /** Фото не загружаются: на Диске закончилось место (записи при этом могут идти) */
  photosNoSpace: boolean;
  /** Место на Диске по последней проверке; null — неизвестно */
  space: SpaceInfo | null;
  /** Вход в Яндекс выдан без права на сведения о Диске: место не видно до повторного входа */
  spaceNoAccess: boolean;
  refresh(): Promise<void>;
}

export const useSync = create<SyncStore>((set) => ({
  state: 'off',
  at: '',
  photosLeft: 0,
  detail: '',
  photosNoSpace: false,
  space: null,
  spaceNoAccess: false,
  async refresh() {
    const connected = await isConnected();
    set({ state: connected ? 'ok' : 'off', at: connected ? await lastSyncAt() : '' });
  },
}));

let running = false;
let again = false;
let timer: ReturnType<typeof setTimeout> | undefined;
/** Что сделать, если синхронизация принесла изменения: обновить данные на экранах. */
let onChanged: () => void = () => undefined;

export function setOnSyncChanged(fn: () => void) {
  onChanged = fn;
}

/** Запустить синхронизацию сейчас (если уже идёт — повторить по окончании). */
export async function syncNow(): Promise<void> {
  if (running) {
    again = true;
    return;
  }
  clearTimeout(timer);
  if (!(await isConnected())) {
    useSync.setState({ state: 'off' });
    return;
  }
  const header = await getVaultHeader();
  if (!header) return;
  running = true;
  stopped = false;
  useSync.setState({ state: 'syncing' });
  try {
    const r = await runSync(header);
    useSync.setState({ state: 'ok', at: await lastSyncAt(), detail: r.recovered ? ru.sync.recovered : '' });
    if (r.changed) onChanged();
    void syncPhotos();
    void checkSpace();
  } catch (e) {
    const f = failureOf(e);
    if (f !== 'offline' && f !== 'auth' && f !== 'noSpace') console.error(e instanceof Error ? e.name : 'sync error');
    useSync.setState({ state: f, detail: f === 'noSpace' ? '' : failureDetail(e) });
    if (f === 'noSpace') void checkSpace(true);
  } finally {
    running = false;
  }
  if (again) {
    again = false;
    void syncNow();
  }
}

/** Синхронизация через 3 секунды после последнего изменения. */
export function syncSoon() {
  clearTimeout(timer);
  timer = setTimeout(() => void syncNow(), 3000);
}

export function stopSync() {
  clearTimeout(timer);
  clearTimeout(photoTimer);
  stopped = true;
}

// ── Фото: отдельная очередь с повторами и растущей паузой (SPEC §7.2) ──

let stopped = false;
let photosRunning = false;
let photoTimer: ReturnType<typeof setTimeout> | undefined;
let backoff = 0;

async function syncPhotos(): Promise<void> {
  if (photosRunning || stopped) return;
  photosRunning = true;
  clearTimeout(photoTimer);
  try {
    await runPhotos({
      keep: draftPhotoIds(),
      onProgress: (left) => useSync.setState({ photosLeft: left }),
      isStopped: () => stopped,
    });
    backoff = 0;
    if (useSync.getState().photosNoSpace) {
      useSync.setState({ photosNoSpace: false });
      void checkSpace(true);
    }
  } catch (e) {
    const f = stopped ? 'offline' : failureOf(e);
    if (f === 'auth') useSync.setState({ state: 'auth' });
    else if (!stopped) {
      if (f === 'noSpace') {
        useSync.setState({ photosNoSpace: true });
        void checkSpace(true);
        // Место само не появится: проверяем реже
        backoff = 5;
      } else if (f !== 'offline') console.error(e instanceof Error ? e.name : 'photo sync error');
      // 10 с, 20 с, 40 с … до 5 минут
      backoff = Math.min(backoff + 1, 5);
      photoTimer = setTimeout(() => void syncPhotos(), 5000 * 2 ** backoff);
    }
  } finally {
    photosRunning = false;
  }
}

// ── Место на Диске: проверяем после синхронизации, не чаще раза в 6 часов (и сразу, если места не хватило) ──

const SPACE_EVERY_MS = 6 * 3600_000;
let spaceAt = 0;

async function checkSpace(force = false): Promise<void> {
  if (!force && Date.now() - spaceAt < SPACE_EVERY_MS) return;
  spaceAt = Date.now();
  const s = await diskSpace();
  if (s === 'noAccess') useSync.setState({ spaceNoAccess: true });
  else if (s) useSync.setState({ space: s, spaceNoAccess: false });
}

export const connectYandex = () => startLogin();
