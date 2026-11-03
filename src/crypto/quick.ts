// Быстрая разблокировка на этом устройстве (SPEC §5.4): ещё одна обёртка DEK, которая хранится
// только в IndexedDB этого устройства и на Диск не уходит.
//
// - Face ID: секрет PRF из passkey (32 байта) → HKDF → KEK. Без Face ID секрет не получить.
// - Код из 6 цифр: PBKDF2(код) → KEK, а сама обёртка ещё раз зашифрована неизвлекаемым ключом
//   устройства: копия базы без этого браузера код не подберёт. Код слабее пароля — после 5 ошибок
//   обёртка стирается (это делает вызывающий код).
import { aadFor, open, seal } from './aead';
import { buf, fromUtf8, randomBytes, toB64, utf8 } from './bytes';
import { KDF_ITERATIONS } from './kdf';
import { unwrapDek, wrapDek, type Wrapped } from './keys';
import { checkVerifier, WrongSecretError, type VaultHeader } from './vault';

const KEK_ALG = { name: 'AES-GCM', length: 256 } as const;
const KEK_USAGES: KeyUsage[] = ['wrapKey', 'unwrapKey'];

export interface PrfWrap {
  /** base64: соль HKDF */
  hkdfSalt: string;
  wrapped: Wrapped;
}

async function prfKek(secret: Uint8Array, hkdfSalt: Uint8Array): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', buf(secret), 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: buf(hkdfSalt), info: buf(utf8('ketsal-quick-prf-v1')) },
    base,
    KEK_ALG,
    false,
    KEK_USAGES,
  );
}

/** Случайная соль для PRF (передаётся в passkey при каждом входе). */
export const newPrfSalt = (): Uint8Array => randomBytes(32);

/** dek — извлекаемый (только что развёрнутый мастер-паролем). */
export async function wrapForPrf(dek: CryptoKey, secret: Uint8Array): Promise<PrfWrap> {
  if (secret.length < 32) throw new Error('prf secret too short');
  const salt = randomBytes(16);
  return { hkdfSalt: toB64(salt), wrapped: await wrapDek(dek, await prfKek(secret, salt)) };
}

export async function unwrapForPrf(w: PrfWrap, secret: Uint8Array, header: VaultHeader): Promise<CryptoKey> {
  let dek: CryptoKey;
  try {
    const salt = Uint8Array.from(atob(w.hkdfSalt), (c) => c.charCodeAt(0));
    dek = await unwrapDek(w.wrapped, await prfKek(secret, salt));
  } catch {
    throw new WrongSecretError();
  }
  await checkVerifier(dek, header);
  return dek;
}

// ── Код из 6 цифр ──

export interface PinWrap {
  /** Конверт KTS1 под ключом устройства: внутри JSON {salt, iterations, wrapped} */
  env: Uint8Array;
}

interface PinInner {
  salt: string;
  iterations: number;
  wrapped: Wrapped;
}

const pinAad = (vaultId: string) => aadFor(vaultId, 'quick', 'pin', 1);

async function pinKek(pin: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', buf(utf8(pin)), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt: buf(salt), iterations },
    base,
    KEK_ALG,
    false,
    KEK_USAGES,
  );
}

export const isPin = (pin: string): boolean => /^\d{6}$/.test(pin);

export async function wrapForPin(
  dek: CryptoKey,
  pin: string,
  deviceKey: CryptoKey,
  vaultId: string,
  iterations = KDF_ITERATIONS,
): Promise<PinWrap> {
  if (!isPin(pin)) throw new Error('pin format');
  const salt = randomBytes(16);
  const inner: PinInner = {
    salt: toB64(salt),
    iterations,
    wrapped: await wrapDek(dek, await pinKek(pin, salt, iterations)),
  };
  return { env: await seal(deviceKey, utf8(JSON.stringify(inner)), pinAad(vaultId)) };
}

/** Неверный код — WrongSecretError. */
export async function unwrapForPin(
  w: PinWrap,
  pin: string,
  deviceKey: CryptoKey,
  header: VaultHeader,
): Promise<CryptoKey> {
  const inner = JSON.parse(fromUtf8(await open(deviceKey, w.env, pinAad(header.vaultId)))) as PinInner;
  let dek: CryptoKey;
  try {
    const salt = Uint8Array.from(atob(inner.salt), (c) => c.charCodeAt(0));
    dek = await unwrapDek(inner.wrapped, await pinKek(pin, salt, inner.iterations));
  } catch {
    throw new WrongSecretError();
  }
  await checkVerifier(dek, header);
  return dek;
}
