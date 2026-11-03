// Быстрый вход на этом устройстве (SPEC §5.4): Face ID через passkey или код из 6 цифр.
// Настройка — своя у каждого устройства (в IndexedDB), на Диск и на другие устройства не уходит.
// Включить можно только мастер-паролем: обёртке нужен развёрнутый DEK.
import { unwrapForPin, unwrapForPrf, wrapForPin, wrapForPrf, type PinWrap, type PrfWrap } from '../crypto/quick';
import { unlockWithPassword, WrongSecretError, type VaultHeader } from '../crypto/vault';
import { deviceKey, local } from '../db/repo';
import { createPasskey, prfSecret, type PasskeyRef } from './passkey';

export type QuickMode = 'faceid' | 'pin' | 'password';

type Stored = ({ mode: 'faceid'; passkey: PasskeyRef } & PrfWrap) | ({ mode: 'pin'; attempts: number } & PinWrap);

const KEY = 'quick';
/** После стольких неверных кодов обёртка стирается и нужен мастер-пароль. */
export const PIN_ATTEMPTS = 5;

export async function quickMode(): Promise<QuickMode> {
  return (await local().getMeta<Stored>(KEY))?.mode ?? 'password';
}

export async function disableQuick(): Promise<void> {
  await local().deleteMeta(KEY);
}

/** Шаг 1 настройки: проверить мастер-пароль. Возвращает извлекаемый DEK — держать недолго. */
export const confirmPassword = (header: VaultHeader, password: string): Promise<CryptoKey> =>
  unlockWithPassword(header, password, true);

/** Шаг 2 (прямо из нажатия): создать passkey и обернуть DEK его секретом. */
export async function enableFaceId(dek: CryptoKey): Promise<void> {
  const { ref, secret } = await createPasskey();
  const w = await wrapForPrf(dek, secret);
  await local().setMeta(KEY, { mode: 'faceid', passkey: ref, ...w } satisfies Stored);
}

export async function enablePin(dek: CryptoKey, pin: string, vaultId: string): Promise<void> {
  const w = await wrapForPin(dek, pin, await deviceKey(), vaultId);
  await local().setMeta(KEY, { mode: 'pin', attempts: 0, ...w } satisfies Stored);
}

/** Вход по Face ID: неизвлекаемый DEK. Отмена Face ID — исключение от браузера. */
export async function unlockFaceId(header: VaultHeader): Promise<CryptoKey> {
  const q = await local().getMeta<Stored>(KEY);
  if (q?.mode !== 'faceid') throw new Error('faceid off');
  return unwrapForPrf(q, await prfSecret(q.passkey), header);
}

export type PinResult = { dek: CryptoKey } | { wrong: number } | { reset: true };

/** Вход по коду. После PIN_ATTEMPTS ошибок код стирается: { reset: true }. */
export async function unlockPin(header: VaultHeader, pin: string): Promise<PinResult> {
  const q = await local().getMeta<Stored>(KEY);
  if (q?.mode !== 'pin') return { reset: true };
  // Попытку считаем до проверки: закрыв приложение посреди проверки, счётчик не обойти
  const attempts = q.attempts + 1;
  await local().setMeta(KEY, { ...q, attempts });
  try {
    const dek = await unwrapForPin(q, pin, await deviceKey(), header);
    await local().setMeta(KEY, { ...q, attempts: 0 });
    return { dek };
  } catch (e) {
    if (!(e instanceof WrongSecretError)) throw e;
    if (attempts >= PIN_ATTEMPTS) {
      await disableQuick();
      return { reset: true };
    }
    return { wrong: PIN_ATTEMPTS - attempts };
  }
}
