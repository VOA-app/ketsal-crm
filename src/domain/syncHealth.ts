// Когда синхронизация требует внимания мастера на главном экране, а не только точки на облачке.
// Точку легко не заметить неделями: всё это время данные лежат только на телефоне.

/** Через сколько без удачной синхронизации показываем баннер (кроме случаев, где нужно действие сразу). */
export const STALE_SYNC_MS = 48 * 3600_000;

export type SyncAttention = { kind: 'auth' } | { kind: 'remoteMissing' } | { kind: 'stale'; days: number } | null;

/**
 * state — состояние синхронизации, lastSyncAt — время последней удачной (ISO, '' — не было).
 * Нехватку места показывает свой баннер, здесь её нет.
 */
export function syncAttention(state: string, lastSyncAt: string, now: number): SyncAttention {
  if (state === 'auth') return { kind: 'auth' };
  if (state === 'remoteMissing') return { kind: 'remoteMissing' };
  if (state === 'off' || state === 'ok' || state === 'syncing' || state === 'noSpace') return null;
  const at = Date.parse(lastSyncAt);
  if (!Number.isFinite(at) || now - at < STALE_SYNC_MS) return null;
  return { kind: 'stale', days: Math.floor((now - at) / (24 * 3600_000)) };
}
