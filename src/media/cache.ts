// Адреса картинок для показа: objectURL сохранённых фото с LRU-кэшем (~200 штук) и демо-рисунки.
// Фото, которого нет на устройстве (снято на другом), скачивается с Диска при первом показе.
import { getBlob, putBlobs } from '../db/repo';
import type { PhotoKind } from '../domain/photos';
import type { PhotoRef } from '../domain/types';
import { loadRemotePhoto } from '../sync/service';
import { processPhoto } from './process';

const LIMIT = 200;
const urls = new Map<string, string>();
const pending = new Map<string, Promise<string>>();

function remember(id: string, url: string) {
  urls.set(id, url);
  while (urls.size > LIMIT) {
    const [oldId, oldUrl] = urls.entries().next().value!;
    urls.delete(oldId);
    if (oldUrl.startsWith('blob:')) URL.revokeObjectURL(oldUrl);
  }
}

/** Уже известный адрес (без ожидания) — чтобы не мигать при повторном показе. */
export function cachedUrl(id: string): string | null {
  const u = urls.get(id);
  if (u) {
    urls.delete(id);
    urls.set(id, u);
  }
  return u ?? null;
}

/** Адрес фото для <img>; '' — фото пока нет (не скачано, нет сети). */
export function photoUrl(id: string, kind: PhotoKind): Promise<string> {
  const hit = cachedUrl(id);
  if (hit) return Promise.resolve(hit);
  let p = pending.get(id);
  if (!p) {
    p = (async () => {
      let url: string;
      if (id.startsWith('demo:')) {
        const { demoPhotoUri } = await import('../dev/demoPhotos');
        url = demoPhotoUri(id);
      } else {
        let blob: Blob | null = null;
        try {
          blob = (await getBlob(id)) ?? (await loadRemotePhoto(id, kind));
        } catch {
          // Файл на устройстве не расшифровался — показываем как отсутствующий
        }
        url = blob ? URL.createObjectURL(blob) : '';
      }
      if (url) remember(id, url);
      return url;
    })().finally(() => pending.delete(id));
    pending.set(id, p);
  }
  return p;
}

/** Освободить все адреса (при блокировке на этапе 2). */
export function revokeAll() {
  for (const u of urls.values()) if (u.startsWith('blob:')) URL.revokeObjectURL(u);
  urls.clear();
}

// Фото открытых форм: ссылок на них в данных ещё нет, но уборка их трогать не должна
const drafts = new Set<string>();
export const draftPhotoIds = (): ReadonlySet<string> => drafts;
export function holdDraft(refs: PhotoRef[], on: boolean) {
  for (const r of refs) {
    for (const id of [r.blobId, r.thumbId]) {
      if (on) drafts.add(id);
      else drafts.delete(id);
    }
  }
}

/** Выбор фото с камеры или из галереи. */
export function pickFiles(multiple = true): Promise<File[]> {
  return new Promise((resolve) => {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = 'image/*';
    inp.multiple = multiple;
    inp.onchange = () => resolve(Array.from(inp.files || []));
    inp.click();
  });
}

/** Обработать и сохранить выбранные фото; возвращает ссылки на сохранённые. */
export async function savePhotos(
  files: File[],
  opts: { photoMaxSide: number; keepTakenAt: boolean },
): Promise<{ refs: PhotoRef[]; failed: number }> {
  const refs: PhotoRef[] = [];
  let failed = 0;
  for (const f of files) {
    try {
      const p = await processPhoto(f, opts.photoMaxSide, opts.keepTakenAt);
      await putBlobs([
        { id: p.ref.blobId, blob: p.full, kind: 'photo' },
        { id: p.ref.thumbId, blob: p.thumb, kind: 'thumb' },
      ]);
      refs.push(p.ref);
    } catch {
      failed += 1;
    }
  }
  return { refs, failed };
}
