// Подключение к Яндекс Диску на этом устройстве: токен (зашифрован ключом устройства), адаптер,
// запуск цикла синхронизации и перевод ошибок в понятные экрану состояния.
import type { Token } from '../auth/yandex-oauth';
import { openToken, sealToken } from '../crypto/device';
import { requireSession } from '../crypto/session';
import type { VaultHeader } from '../crypto/vault';
import { deviceKey, local } from '../db/repo';
import { todayISO } from '../domain/dates';
import { photoFiles, type PhotoKind } from '../domain/photos';
import {
  AuthError,
  NoSpaceError,
  NoSpaceInfoAccessError,
  OfflineError,
  RemoteError,
  UnavailableError,
  type DiskSpace,
  type StorageAdapter,
} from './adapter';
import { fetchRemoteHeader, OtherVaultError, RemoteCorruptError, RollbackError, sync, type SyncResult } from './engine';
import { MockAdapter } from './mockAdapter';
import {
  deleteRemotePhotos,
  downloadMissing,
  fetchPhoto,
  localPhotoGc,
  PhotoCorruptError,
  prefetchThumbs,
  refsOf,
  remotePhotoGc,
  uploadPhotos,
  type PhotoDeps,
} from './photos';
import { YandexDiskAdapter } from './yandexDiskAdapter';

interface StoredToken {
  env: Uint8Array;
  expiresAt: string;
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

export type SyncFailure =
  'offline' | 'auth' | 'rollback' | 'otherVault' | 'corrupt' | 'unavailable' | 'noSpace' | 'error';

export function failureOf(e: unknown): SyncFailure {
  if (e instanceof OfflineError) return 'offline';
  if (e instanceof AuthError) return 'auth';
  if (e instanceof RollbackError) return 'rollback';
  if (e instanceof OtherVaultError) return 'otherVault';
  if (e instanceof RemoteCorruptError) return 'corrupt';
  if (e instanceof UnavailableError) return 'unavailable';
  if (e instanceof NoSpaceError) return 'noSpace';
  return 'error';
}

/** Подробность для окна синхронизации: какой адрес не ответил или что ответил сервер. Без данных и токенов. */
export function failureDetail(e: unknown): string {
  if (e instanceof OfflineError || e instanceof UnavailableError) return [e.host, e.cause].filter(Boolean).join(' · ');
  if (e instanceof RemoteError) return `HTTP ${e.status}`;
  if (e instanceof RemoteCorruptError) return e.path;
  return e instanceof Error ? e.name : '';
}

/** vault.json с Диска (для второго устройства) или null, если хранилища там ещё нет. */
export const remoteHeader = (): Promise<VaultHeader | null> => fetchRemoteHeader(remote());

export const runSync = (header: VaultHeader): Promise<SyncResult> =>
  sync({
    local: local(),
    remote: remote(),
    session: requireSession,
    header,
    saveHeader: (h) => local().setMeta('vault', h),
  });

export async function lastSyncAt(): Promise<string> {
  return (await local().getSyncMeta()).lastSyncAt;
}

// ── Фото ──

const photoDeps = (): PhotoDeps => ({ local: local(), remote: remote(), refs: refsOf(local(), todayISO()) });

const GC_EVERY_MS = 24 * 3600_000;

/**
 * Обмен фото после синхронизации записей: удалить убранные, загрузить новые, скачать превью, убрать лишнее.
 * `keep` — фото открытых форм, `onProgress` — сколько ещё ждут загрузки.
 */
export async function runPhotos(opts: {
  keep: ReadonlySet<string>;
  onProgress: (left: number) => void;
  isStopped: () => boolean;
}): Promise<void> {
  const d = photoDeps();
  await deleteRemotePhotos(d);
  // Нет места на Диске: фото подождут, а превью и уборка (она освобождает место) идут как обычно
  let noSpace: NoSpaceError | null = null;
  try {
    await uploadPhotos(d, opts.onProgress);
  } catch (e) {
    if (!(e instanceof NoSpaceError)) throw e;
    noSpace = e;
  }
  if (opts.isStopped()) return;
  await prefetchThumbs(d, opts.isStopped);
  await localPhotoGc(d, opts.keep);
  const last = (await local().getMeta<number>('photoGcAt')) ?? 0;
  if (Date.now() - last > GC_EVERY_MS && !opts.isStopped()) {
    await remotePhotoGc(d);
    await local().setMeta('photoGcAt', Date.now());
  }
  if (noSpace) throw noSpace;
}

/**
 * Сколько места на Диске занято и всего. null — не подключён, нет связи или Диск не сообщает;
 * 'noAccess' — у входа нет права на сведения о Диске, нужно войти в Яндекс заново.
 */
export async function diskSpace(): Promise<DiskSpace | 'noAccess' | null> {
  if (!(await isConnected())) return null;
  try {
    return await remote().space();
  } catch (e) {
    return e instanceof NoSpaceInfoAccessError ? 'noAccess' : null;
  }
}

/** Сколько фото этого устройства ещё не загружено на Диск (без фото незакрытых форм). */
export async function photosWaiting(): Promise<number> {
  const wanted = photoFiles(refsOf(local(), todayISO())());
  return (await local().uploadQueue()).filter((id) => wanted.has(id)).length;
}

/** Фото, которого нет на устройстве: скачать с Диска (null — его там нет или нет связи). */
export async function loadRemotePhoto(id: string, kind: PhotoKind): Promise<Blob | null> {
  if (!(await isConnected())) return null;
  try {
    return await fetchPhoto({ local: local(), remote: remote() }, id, kind);
  } catch (e) {
    // Подменённый или повреждённый файл — пусть экран это покажет; сбой связи — просто «пока нет»
    if (e instanceof PhotoCorruptError) throw e;
    return null;
  }
}

/**
 * Перед копией и выгрузкой: скачать с Диска фото, которых нет на устройстве.
 * Возвращает, сколько фото не удалось получить (нет сети, Диск не подключён, файла нет).
 */
export async function fetchMissingPhotos(onProgress?: (done: number, total: number) => void): Promise<number> {
  const refs = refsOf(local(), todayISO());
  if (!(await isConnected())) {
    const files = Array.from(photoFiles(refs()));
    const have = await local().presentBlobs(files.map(([id]) => id));
    return files.filter(([id]) => !have.has(id)).length;
  }
  try {
    return await downloadMissing({ local: local(), remote: remote(), refs }, onProgress);
  } catch {
    const files = Array.from(photoFiles(refs()));
    const have = await local().presentBlobs(files.map(([id]) => id));
    return files.filter(([id]) => !have.has(id)).length;
  }
}
