// Адреса картинок для показа: objectURL сохранённых фото с LRU-кэшем (~200 штук) и демо-рисунки.
import { getBlob, putBlobs } from '../db/repo';
import type { PhotoRef } from '../domain/types';
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

export function photoUrl(id: string): Promise<string> {
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
        const blob = await getBlob(id);
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
export async function savePhotos(files: File[], maxSide: number): Promise<{ refs: PhotoRef[]; failed: number }> {
  const refs: PhotoRef[] = [];
  let failed = 0;
  for (const f of files) {
    try {
      const p = await processPhoto(f, maxSide);
      await putBlobs([
        { id: p.ref.blobId, blob: p.full },
        { id: p.ref.thumbId, blob: p.thumb },
      ]);
      refs.push(p.ref);
    } catch {
      failed += 1;
    }
  }
  return { refs, failed };
}
