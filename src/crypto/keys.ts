// DEK (ключ данных), его обёртки и ключ восстановления (SPEC §5.1).
import { buf, fromB64, randomBytes, toB64 } from './bytes';

export interface Wrapped {
  /** base64, 12 байт */
  iv: string;
  /** base64: обёрнутый ключ + тег GCM */
  ct: string;
}

const DEK_USAGES: KeyUsage[] = ['encrypt', 'decrypt'];

/**
 * Новый DEK. Извлекаемый только в момент создания хранилища или смены обёртки: его надо обернуть.
 * Для работы ключ всегда разворачивается заново как неизвлекаемый.
 */
export const generateDek = (): Promise<CryptoKey> =>
  crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, DEK_USAGES) as Promise<CryptoKey>;

export async function wrapDek(dek: CryptoKey, kek: CryptoKey): Promise<Wrapped> {
  const iv = randomBytes(12);
  const ct = await crypto.subtle.wrapKey('raw', dek, kek, { name: 'AES-GCM', iv: buf(iv) });
  return { iv: toB64(iv), ct: toB64(new Uint8Array(ct)) };
}

/** Развернуть DEK; неверный KEK — исключение. */
export const unwrapDek = (w: Wrapped, kek: CryptoKey, extractable = false): Promise<CryptoKey> =>
  crypto.subtle.unwrapKey(
    'raw',
    buf(fromB64(w.ct)),
    kek,
    { name: 'AES-GCM', iv: buf(fromB64(w.iv)) },
    { name: 'AES-GCM', length: 256 },
    extractable,
    DEK_USAGES,
  );

// ── Ключ восстановления: 32 случайных байта, 52 символа без путающихся (0/O, 1/I) ──

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const RECOVERY_BYTES = 32;
export const RECOVERY_CHARS = Math.ceil((RECOVERY_BYTES * 8) / 5);

export const generateRecovery = (): Uint8Array => randomBytes(RECOVERY_BYTES);

/** 32 байта → 52 символа. */
export function encodeRecovery(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

/** Группы по 4 символа для показа и копирования. */
export const groupRecovery = (code: string): string[] => code.match(/.{1,4}/g) ?? [];

/** Ввод пользователя → 32 байта; null, если символов не хватает или есть лишние. */
export function decodeRecovery(input: string): Uint8Array | null {
  const clean = input.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (clean.length !== RECOVERY_CHARS) return null;
  const out = new Uint8Array(RECOVERY_BYTES);
  let bits = 0;
  let value = 0;
  let o = 0;
  for (const ch of clean) {
    const v = ALPHABET.indexOf(ch);
    if (v < 0) return null;
    value = ((value << 5) | v) & 0xffff;
    bits += 5;
    if (bits >= 8) {
      if (o < RECOVERY_BYTES) out[o] = (value >>> (bits - 8)) & 0xff;
      o += 1;
      bits -= 8;
    }
  }
  return out;
}
