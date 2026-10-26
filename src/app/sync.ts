// Состояние синхронизации для экранов и её запуск (SPEC §7.2): при входе, при возврате в приложение,
// через 3 секунды после изменения, по кнопке и при появлении сети. Одновременно идёт один цикл.
import { create } from 'zustand';
import { startLogin } from '../auth/yandex-oauth';
import { getVaultHeader } from '../db/repo';
import { failureOf, isConnected, lastSyncAt, runSync, type SyncFailure } from '../sync/service';

export type SyncState = 'off' | 'syncing' | 'ok' | SyncFailure;

interface SyncStore {
  state: SyncState;
  /** Время последней удачной синхронизации, ISO */
  at: string;
  refresh(): Promise<void>;
}

export const useSync = create<SyncStore>((set) => ({
  state: 'off',
  at: '',
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
  useSync.setState({ state: 'syncing' });
  try {
    const r = await runSync(header);
    useSync.setState({ state: 'ok', at: await lastSyncAt() });
    if (r.changed) onChanged();
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
}

export const connectYandex = () => startLogin();
