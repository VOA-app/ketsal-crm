// Учёт фото, добавленных в открытой форме: при отмене новые стираются, при сохранении — удалённые.
// Пока форма открыта, новые фото не загружаются на Диск и не попадают под уборку.
import { useRef } from 'react';
import { deletePhotos } from '../../db/repo';
import type { PhotoRef } from '../../domain/types';
import { holdDraft, pickFiles, savePhotos } from '../../media/cache';
import { ru } from '../../i18n/ru';
import { useData } from '../store';
import { ui } from '../ui';

export function usePhotoDraft() {
  const added = useRef<PhotoRef[]>([]);
  const removed = useRef<PhotoRef[]>([]);
  return {
    /** Выбрать и сохранить фото; вернёт новые ссылки */
    async add(multiple = true): Promise<PhotoRef[]> {
      const files = await pickFiles(multiple);
      if (!files.length) return [];
      const { refs, failed } = await savePhotos(files, useData.getState().data.settings);
      if (failed) ui().toast(ru.photo.failed);
      holdDraft(refs, true);
      added.current.push(...refs);
      return refs;
    },
    remove(r: PhotoRef) {
      if (added.current.some((x) => x.blobId === r.blobId)) {
        added.current = added.current.filter((x) => x.blobId !== r.blobId);
        holdDraft([r], false);
        void deletePhotos([r]);
      } else removed.current.push(r);
    },
    /** Фото, которые надо стереть после сохранения формы */
    removedRefs: () => removed.current,
    /** Форма сохранена: новые фото стали обычными */
    commit() {
      holdDraft(added.current, false);
      added.current = [];
    },
    /** Отмена формы: стереть добавленные */
    discard() {
      holdDraft(added.current, false);
      void deletePhotos(added.current);
      added.current = [];
    },
  };
}
