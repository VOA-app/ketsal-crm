// Ключи-обёртки из мастер-пароля (PBKDF2-SHA256) и из ключа восстановления (HKDF-SHA256), SPEC §5.1.
// Параметры хранятся в vault.json с версией: число итераций можно поднять миграцией.
import { buf, fromB64, randomBytes, toB64, utf8 } from './bytes';

export const KDF_ITERATIONS = 600_000;

export interface KdfParams {
  alg: 'PBKDF2-SHA256';
  iterations: number;
  /** base64, 16 байт */
  salt: string;
}

export const newKdfParams = (iterations = KDF_ITERATIONS): KdfParams => ({
  alg: 'PBKDF2-SHA256',
  iterations,
  salt: toB64(randomBytes(16)),
});

const KEK_ALG = { name: 'AES-GCM', length: 256 } as const;
const KEK_USAGES: KeyUsage[] = ['wrapKey', 'unwrapKey'];

/** KEK из пароля. Пароль нормализуется (NFC), чтобы одинаково вводился на iPhone и ПК. */
export async function passwordKek(password: string, params: KdfParams): Promise<CryptoKey> {
  if (params.alg !== 'PBKDF2-SHA256') throw new Error(`unsupported kdf ${params.alg}`);
  const base = await crypto.subtle.importKey('raw', buf(utf8(password.normalize('NFC'))), 'PBKDF2', false, [
    'deriveKey',
  ]);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt: buf(fromB64(params.salt)), iterations: params.iterations },
    base,
    KEK_ALG,
    false,
    KEK_USAGES,
  );
}

/** KEK из 32 случайных байт ключа восстановления. */
export async function recoveryKek(raw: Uint8Array, hkdfSalt: string): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', buf(raw), 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: buf(fromB64(hkdfSalt)), info: buf(utf8('ketsal-recovery-v1')) },
    base,
    KEK_ALG,
    false,
    KEK_USAGES,
  );
}
