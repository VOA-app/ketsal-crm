// Состояние синхронизации для экранов и её запуск (SPEC §7.2): при входе, при возврате в приложение,
// через 3 секунды после изменения, по кнопке и при появлении сети. Одновременно идёт один цикл.
import { create } from 'zustand';
import { startLogin } from '../auth/yandex-oauth';
import { getVaultHeader } from '../db/repo';
import { draftPhotoIds } from '../media/cache';
import { failureOf, isConnected, lastSyncAt, runPhotos, runSync, type SyncFailure } from '../sync/service';

export type SyncState = 'off' | 'syncing' | 'ok' | SyncFailure;

interface SyncStore {
  state: SyncState;
  /** Время последней удачной синхронизации, ISO */
  at: string;
  /** Фото этого устройства, которые ещё не загружены на Диск */
  photosLeft: number;
  refresh(): Promise<void>;
}

export const useSync = create<SyncStore>((set) => ({
  state: 'off',
  at: '',
  photosLeft: 0,
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
    useSync.setState({ state: 'ok', at: await lastSyncAt() });
    if (r.changed) onChanged();
    void syncPhotos();
  } catch (e) {
    const f = failureOf(e);
    if (f !== 'offline' && f !== 'auth') console.error(e instanceof Error ? e.name : 'sync error');
    useSync.setState({ state: f });
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
  } catch (e) {
    const f = stopped ? 'offline' : failureOf(e);
    if (f === 'auth') useSync.setState({ state: 'auth' });
    else if (!stopped) {
      if (f !== 'offline') console.error(e instanceof Error ? e.name : 'photo sync error');
      // 10 с, 20 с, 40 с … до 5 минут
      backoff = Math.min(backoff + 1, 5);
      photoTimer = setTimeout(() => void syncPhotos(), 5000 * 2 ** backoff);
    }
  } finally {
    photosRunning = false;
  }
}

export const connectYandex = () => startLogin();
