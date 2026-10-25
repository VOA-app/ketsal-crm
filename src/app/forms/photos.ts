// Учёт фото, добавленных в открытой форме: при отмене новые стираются, при сохранении — удалённые.
import { useRef } from 'react';
import { deleteBlobs } from '../../db/repo';
import type { PhotoRef } from '../../domain/types';
import { pickFiles, savePhotos } from '../../media/cache';
import { ru } from '../../i18n/ru';
import { useData } from '../store';
import { ui } from '../ui';

const ids = (r: PhotoRef) => [r.blobId, r.thumbId];

export function usePhotoDraft() {
  const added = useRef<PhotoRef[]>([]);
  const removed = useRef<PhotoRef[]>([]);
  return {
    /** Выбрать и сохранить фото; вернёт новые ссылки */
    async add(multiple = true): Promise<PhotoRef[]> {
      const files = await pickFiles(multiple);
      if (!files.length) return [];
      const { refs, failed } = await savePhotos(files, useData.getState().data.settings.photoMaxSide);
      if (failed) ui().toast(ru.photo.failed);
      added.current.push(...refs);
      return refs;
    },
    remove(r: PhotoRef) {
      if (added.current.some((x) => x.blobId === r.blobId)) {
        added.current = added.current.filter((x) => x.blobId !== r.blobId);
        void deleteBlobs(ids(r));
      } else removed.current.push(r);
    },
    /** id файлов, которые надо стереть после сохранения формы */
    removedIds: () => removed.current.flatMap(ids),
    /** Отмена формы: стереть добавленные */
    discard() {
      void deleteBlobs(added.current.flatMap(ids));
      added.current = [];
    },
  };
}
