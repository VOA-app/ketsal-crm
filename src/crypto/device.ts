// Ключ устройства и PKCE.
// Ключ устройства — неизвлекаемый AES-GCM в IndexedDB. Им шифруется OAuth-токен: токен нужен до ввода
// пароля, чтобы скачать vault.json (SPEC §6.1). Скопировать ключ с устройства нельзя.
import { aadFor, open, seal } from './aead';
import { buf, fromUtf8, randomBytes, utf8 } from './bytes';

export const generateDeviceKey = (): Promise<CryptoKey> =>
  crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']) as Promise<CryptoKey>;

export const sealToken = (key: CryptoKey, token: string): Promise<Uint8Array> =>
  seal(key, utf8(token), aadFor('device', 'token', 'yandex', 1));

export const openToken = async (key: CryptoKey, env: Uint8Array): Promise<string> =>
  fromUtf8(await open(key, env, aadFor('device', 'token', 'yandex', 1)));

const b64url = (b: Uint8Array) =>
  btoa(String.fromCharCode(...b))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

/** PKCE (RFC 7636): случайный verifier и его SHA-256 для запроса кода. */
export async function pkcePair(): Promise<{ verifier: string; challenge: string }> {
  const verifier = b64url(randomBytes(48));
  const challenge = b64url(new Uint8Array(await crypto.subtle.digest('SHA-256', buf(utf8(verifier)))));
  return { verifier, challenge };
}

export const randomState = (): string => b64url(randomBytes(16));
