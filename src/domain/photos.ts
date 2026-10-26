// Какие фото упоминаются в данных (SPEC §8): по этому списку загружаются, скачиваются и убираются файлы.
import type { Data, PhotoRef } from './types';

/** Все фото карт и процедур. Демо-рисунки (`demo:`) — не файлы, их нет в списке. */
export function photoRefs(data: Pick<Data, 'clients' | 'procedures'>): PhotoRef[] {
  const out: PhotoRef[] = [];
  const add = (r: PhotoRef | null | undefined) => {
    if (r && r.blobId && !r.blobId.startsWith('demo:')) out.push(r);
  };
  for (const c of data.clients) {
    add(c.facePhoto);
    c.consents?.pd?.photos?.forEach(add);
    c.consents?.procedure?.photos?.forEach(add);
  }
  for (const p of data.procedures) Object.values(p.photos || {}).forEach((arr) => arr?.forEach(add));
  return out;
}

export type PhotoKind = 'photo' | 'thumb';

/** id файла → вид (оригинал или превью) для всех фото в данных. */
export function photoFiles(refs: PhotoRef[]): Map<string, PhotoKind> {
  const m = new Map<string, PhotoKind>();
  for (const r of refs) {
    m.set(r.blobId, 'photo');
    m.set(r.thumbId, 'thumb');
  }
  return m;
}
