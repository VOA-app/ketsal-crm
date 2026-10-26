// Подключение к Яндекс Диску на этом устройстве: токен (зашифрован ключом устройства), адаптер,
// запуск цикла синхронизации и перевод ошибок в понятные экрану состояния.
import type { Token } from '../auth/yandex-oauth';
import { generateDeviceKey, openToken, sealToken } from '../crypto/device';
import { requireSession } from '../crypto/session';
import type { VaultHeader } from '../crypto/vault';
import { local } from '../db/repo';
import { AuthError, OfflineError, type StorageAdapter } from './adapter';
import { fetchRemoteHeader, OtherVaultError, RemoteCorruptError, RollbackError, sync, type SyncResult } from './engine';
import { MockAdapter } from './mockAdapter';
import { YandexDiskAdapter } from './yandexDiskAdapter';

interface StoredToken {
  env: Uint8Array;
  expiresAt: string;
}

async function deviceKey(): Promise<CryptoKey> {
  let key = await local().getMeta<CryptoKey>('deviceKey');
  if (!key) {
    key = await generateDeviceKey();
    await local().setMeta('deviceKey', key);
  }
  return key;
}

export async function saveToken(t: Token): Promise<void> {
  const env = await sealToken(await deviceKey(), t.accessToken);
  await local().setMeta('token', { env, expiresAt: t.expiresAt } satisfies StoredToken);
}

export async function hasToken(): Promise<boolean> {
  return !!(await local().getMeta<StoredToken>('token'));
}

async function readToken(): Promise<string> {
  const t = await local().getMeta<StoredToken>('token');
  if (!t) throw new AuthError();
  try {
    return await openToken(await deviceKey(), t.env);
  } catch {
    throw new AuthError();
  }
}

/** Для разработки без Яндекса: облако в памяти вкладки (только в dev-сборке). */
let devRemote: MockAdapter | null = null;
export function enableDevRemote() {
  devRemote ??= new MockAdapter();
}

let adapter: StorageAdapter | null = null;
function remote(): StorageAdapter {
  if (devRemote) return devRemote;
  adapter ??= new YandexDiskAdapter(readToken);
  return adapter;
}

export async function isConnected(): Promise<boolean> {
  return !!devRemote || (await hasToken());
}

export type SyncFailure = 'offline' | 'auth' | 'rollback' | 'otherVault' | 'corrupt' | 'error';

export function failureOf(e: unknown): SyncFailure {
  if (e instanceof OfflineError) return 'offline';
  if (e instanceof AuthError) return 'auth';
  if (e instanceof RollbackError) return 'rollback';
  if (e instanceof OtherVaultError) return 'otherVault';
  if (e instanceof RemoteCorruptError) return 'corrupt';
  return 'error';
}

/** vault.json с Диска (для второго устройства) или null, если хранилища там ещё нет. */
export const remoteHeader = (): Promise<VaultHeader | null> => fetchRemoteHeader(remote());

export const runSync = (header: VaultHeader): Promise<SyncResult> =>
  sync({ local: local(), remote: remote(), session: requireSession, header });

export async function lastSyncAt(): Promise<string> {
  return (await local().getSyncMeta()).lastSyncAt;
}
