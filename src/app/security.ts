// Вход и безопасность на этом устройстве (SPEC §5.4, этап 6): быстрый вход, смена мастер-пароля,
// «выйти и стереть данные». Экраны вызывают только эти функции и не видят ключей.
import { forgetPendingLogin } from '../auth/yandex-oauth';
import {
  confirmPassword,
  disableQuick,
  enableFaceId,
  enablePin,
  quickMode,
  unlockFaceId,
  unlockPin,
  type QuickMode,
} from '../auth/quick';
import { NoPrfError, passkeyAvailable } from '../auth/passkey';
import { endSession } from '../crypto/session';
import { setPassword, WrongSecretError } from '../crypto/vault';
import { forgetDecrypted, getVaultHeader, saveVaultHeader, unsentCounts, wipeLocal } from '../db/repo';
import { revokeAll } from '../media/cache';
import { isConnected } from '../sync/service';
import { useData, type UnlockResult } from './store';
import { stopSync, syncSoon } from './sync';

export type { QuickMode };
export { quickMode, passkeyAvailable };

// ── Вход ──

/** Вход по Face ID. cancel — Face ID отменили или не узнали. */
export async function unlockByFaceId(): Promise<UnlockResult | 'cancel'> {
  const header = await getVaultHeader();
  if (!header) return 'error';
  let dek: CryptoKey;
  try {
    dek = await unlockFaceId(header);
  } catch (e) {
    if (e instanceof WrongSecretError || e instanceof NoPrfError) return 'error';
    return 'cancel';
  }
  return useData.getState().openWith(dek, header.vaultId);
}

export type PinUnlock = 'ok' | 'error' | 'reset' | { left: number };

export async function unlockByPin(pin: string): Promise<PinUnlock> {
  const header = await getVaultHeader();
  if (!header) return 'error';
  try {
    const r = await unlockPin(header, pin);
    if ('dek' in r) return (await useData.getState().openWith(r.dek, header.vaultId)) === 'ok' ? 'ok' : 'error';
    return 'reset' in r ? 'reset' : { left: r.wrong };
  } catch {
    return 'error';
  }
}

// ── Настройка быстрого входа: сначала мастер-пароль, потом Face ID или код ──

let setup: { dek: CryptoKey; vaultId: string; until: number } | null = null;
const SETUP_MS = 3 * 60_000;

// Заблокировали приложение — развёрнутый для настройки ключ больше не нужен
useData.subscribe((s) => {
  if (s.status !== 'ready') setup = null;
});

export async function quickConfirm(password: string): Promise<UnlockResult> {
  try {
    const header = await getVaultHeader();
    if (!header) return 'error';
    setup = { dek: await confirmPassword(header, password), vaultId: header.vaultId, until: Date.now() + SETUP_MS };
    return 'ok';
  } catch (e) {
    return e instanceof WrongSecretError ? 'wrong' : 'error';
  }
}

export type QuickEnableResult = 'ok' | 'noPrf' | 'cancel' | 'expired' | 'error';

/** Включить Face ID или код. Для Face ID — вызывать прямо из нажатия. */
export async function quickEnable(mode: 'faceid' | 'pin', pin = ''): Promise<QuickEnableResult> {
  const s = setup;
  if (!s || Date.now() > s.until) {
    setup = null;
    return 'expired';
  }
  try {
    if (mode === 'faceid') await enableFaceId(s.dek);
    else await enablePin(s.dek, pin, s.vaultId);
    setup = null;
    return 'ok';
  } catch (e) {
    if (e instanceof NoPrfError) return 'noPrf';
    // Face ID отменили (NotAllowedError) — можно попробовать ещё раз
    if (e instanceof Error && e.name === 'NotAllowedError') return 'cancel';
    console.error(e instanceof Error ? e.name : 'quick setup error');
    return 'error';
  }
}

export function quickCancel() {
  setup = null;
}

export async function quickOff(): Promise<void> {
  setup = null;
  await disableQuick();
}

// ── Смена мастер-пароля ──

/** Новый пароль: обёртка DEK меняется, данные — нет. На другие устройства придёт через Диск. */
export async function changePassword(oldPassword: string, newPassword: string): Promise<UnlockResult> {
  try {
    const header = await getVaultHeader();
    if (!header) return 'error';
    await saveVaultHeader(await setPassword(header, { password: oldPassword }, newPassword));
    syncSoon();
    return 'ok';
  } catch (e) {
    if (e instanceof WrongSecretError) return 'wrong';
    console.error(e instanceof Error ? e.name : 'password change error');
    return 'error';
  }
}

// ── Выйти и стереть ──

export interface WipeInfo {
  connected: boolean;
  changes: number;
  photos: number;
}

export async function wipeInfo(): Promise<WipeInfo> {
  return { connected: await isConnected(), ...(await unsentCounts()) };
}

/** Стереть всё с этого устройства и начать заново. На Диске ничего не удаляется. */
export async function wipeDevice(): Promise<void> {
  stopSync();
  endSession();
  forgetDecrypted();
  revokeAll();
  forgetPendingLogin();
  await wipeLocal();
  window.location.reload();
}
