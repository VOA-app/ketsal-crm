// Фото на Диске (SPEC §6.2, §7.2 шаги 5 и 8, §8). Идут отдельно от записей, после синхронизации:
// записи маленькие и нужны сразу, а фото может быть много и сеть на телефоне медленная.
//
// - Загрузка: очередь фото этого устройства. Загружается только то, на что уже есть ссылка в данных,
//   поэтому на Диск не уходят фото из незакрытой формы. В файле тот же конверт, что в IndexedDB.
// - Скачивание: превью — сразу после синхронизации, оригиналы — когда их открывают.
// - Удаление: фото убрали из карты или процедуры (или удалили карту полностью) — файл удаляется с Диска.
// - Уборка: файлы без ссылок стираются с устройства, а с Диска — если им больше 7 дней
//   (столько ждём, пока другое устройство пришлёт записи, которые на них ссылаются).
import { DecryptError } from '../crypto/aead';
import type { LocalStore } from '../db/localStore';
import { photoFiles, photoRefs, type PhotoKind } from '../domain/photos';
import type { PhotoRef } from '../domain/types';
import { RemoteError, type StorageAdapter } from './adapter';

export const PHOTO_DIR: Record<PhotoKind, string> = { photo: 'blobs', thumb: 'thumbs' };
export const photoPath = (kind: PhotoKind, id: string) => `${PHOTO_DIR[kind]}/${id}.enc`;

/** Сколько ждём записей с другого устройства, прежде чем стереть файл без ссылок с Диска. */
export const REMOTE_GRACE_MS = 7 * 24 * 3600_000;
/** Фото только что сняли, а форма ещё открыта: ссылки пока нет, но стирать нельзя. */
export const LOCAL_GRACE_MS = 10 * 60_000;

export interface PhotoDeps {
  local: LocalStore;
  remote: StorageAdapter;
  /** Все фото в данных этого устройства (после слияния) */
  refs: () => PhotoRef[];
  now?: () => number;
}

/** Файл на Диске повреждён или чужой: показываем как отсутствующий, на Диске не трогаем. */
export class PhotoCorruptError extends Error {
  constructor() {
    super('photo corrupt');
    this.name = 'PhotoCorruptError';
  }
}

/** Отправить фото из очереди. Возвращает, сколько ещё ждут загрузки. */
export async function uploadPhotos(d: PhotoDeps, onProgress?: (left: number) => void): Promise<number> {
  const wanted = photoFiles(d.refs());
  const queue = await d.local.uploadQueue();
  let left = queue.filter((id) => wanted.has(id)).length;
  onProgress?.(left);
  for (const id of queue) {
    const kind = wanted.get(id);
    // Нет ссылки: фото из открытой формы или уже убранное — подождёт или уйдёт при уборке
    if (!kind) continue;
    const row = await d.local.blobRow(id);
    if (row) await d.remote.write(photoPath(kind, id), row.ct);
    await d.local.markUploaded(id);
    left -= 1;
    onProgress?.(left);
  }
  return left;
}

/** Удалить с Диска убранные фото. */
export async function deleteRemotePhotos(d: PhotoDeps): Promise<void> {
  const still = photoFiles(d.refs());
  for (const r of await d.local.deleteQueue()) {
    // Фото снова в данных (например, правка с другого устройства его вернула) — не трогаем
    if (!still.has(r.id)) await d.remote.remove(photoPath(r.kind, r.id));
    await d.local.markRemoteDeleted(r.id);
  }
}

/** Скачать файл с Диска и сохранить на устройстве. null — файла там нет (ещё не загружен или удалён). */
export async function fetchPhoto(d: Pick<PhotoDeps, 'local' | 'remote'>, id: string, kind: PhotoKind) {
  const ct = await d.remote.read(photoPath(kind, id));
  if (!ct) return null;
  try {
    return await d.local.putDownloaded(id, kind, ct);
  } catch (e) {
    if (e instanceof DecryptError) throw new PhotoCorruptError();
    throw e;
  }
}

/** Скачать недостающие превью: в списках и в карте они нужны сразу. Возвращает, сколько скачано. */
export async function prefetchThumbs(d: PhotoDeps, isStopped: () => boolean = () => false): Promise<number> {
  const ids = d.refs().map((r) => r.thumbId);
  const have = await d.local.presentBlobs(ids);
  let n = 0;
  for (const id of ids) {
    if (have.has(id) || isStopped()) continue;
    try {
      if (await fetchPhoto(d, id, 'thumb')) n += 1;
    } catch (e) {
      // Повреждённый файл не мешает остальным
      if (!(e instanceof PhotoCorruptError)) throw e;
    }
  }
  return n;
}

/**
 * Докачать все файлы фото, которых нет на устройстве (перед копией и выгрузкой).
 * Возвращает, сколько так и не удалось получить.
 */
export async function downloadMissing(
  d: Pick<PhotoDeps, 'local' | 'remote' | 'refs'>,
  onProgress?: (done: number, total: number) => void,
): Promise<number> {
  const files = Array.from(photoFiles(d.refs()));
  const have = await d.local.presentBlobs(files.map(([id]) => id));
  const todo = files.filter(([id]) => !have.has(id));
  let failed = 0;
  let done = 0;
  for (const [id, kind] of todo) {
    try {
      if (!(await fetchPhoto(d, id, kind))) failed += 1;
    } catch (e) {
      if (!(e instanceof PhotoCorruptError)) throw e;
      failed += 1;
    }
    done += 1;
    onProgress?.(done, todo.length);
  }
  return failed;
}

/** Стереть с устройства файлы, на которые в данных больше нет ссылок (удалены здесь или на другом устройстве). */
export async function localPhotoGc(d: PhotoDeps, keep: ReadonlySet<string> = new Set()): Promise<number> {
  const wanted = photoFiles(d.refs());
  const now = (d.now ?? Date.now)();
  const drop = (await d.local.blobAges())
    .filter((b) => !wanted.has(b.id) && !keep.has(b.id) && now - b.at > LOCAL_GRACE_MS)
    .map((b) => b.id);
  await d.local.dropLocalBlobs(drop);
  return drop.length;
}

/** Стереть с Диска файлы без ссылок старше 7 дней. Запускается не чаще раза в сутки. */
export async function remotePhotoGc(d: PhotoDeps): Promise<number> {
  const wanted = photoFiles(d.refs());
  const now = (d.now ?? Date.now)();
  let n = 0;
  for (const kind of ['photo', 'thumb'] as const) {
    let list: { name: string; modified: string }[];
    try {
      list = await d.remote.list(PHOTO_DIR[kind]);
    } catch (e) {
      if (e instanceof RemoteError && e.status === 404) continue;
      throw e;
    }
    for (const f of list) {
      const m = /^([0-9A-Za-z]+)\.enc$/.exec(f.name);
      if (!m || wanted.has(m[1])) continue;
      const modified = Date.parse(f.modified);
      if (!Number.isFinite(modified) || now - modified < REMOTE_GRACE_MS) continue;
      await d.remote.remove(`${PHOTO_DIR[kind]}/${f.name}`);
      n += 1;
    }
  }
  return n;
}

export const refsOf = (local: LocalStore, today: string) => () => photoRefs(local.data(today));
