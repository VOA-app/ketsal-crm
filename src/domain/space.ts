// Место на Яндекс Диске: когда предупреждать мастера и как показывать объём.
// Диск общий: кроме файлов приложения там бывают личные фото, поэтому смотрим на весь объём.
import { ru } from '../i18n/ru';

export interface SpaceInfo {
  total: number;
  /** Занято всего, вместе с корзиной */
  used: number;
  trash: number;
}

/** Предупреждаем, когда свободно меньше: при фото ~1 МБ это примерно 500 снимков, 2–3 месяца работы. */
export const LOW_SPACE_BYTES = 500 * 1024 * 1024;

export type SpaceLevel = 'ok' | 'low' | 'full';

export function spaceLevel(s: SpaceInfo): SpaceLevel {
  const free = s.total - s.used;
  // Меньше 5 МБ — не влезет даже одно фото с превью
  if (free < 5 * 1024 * 1024) return 'full';
  return free < LOW_SPACE_BYTES ? 'low' : 'ok';
}

export const freeBytes = (s: SpaceInfo): number => Math.max(0, s.total - s.used);

const GB = 1024 ** 3;
const MB = 1024 ** 2;

/** «4,2 ГБ», «240 МБ», «меньше 1 МБ» — как показывает сам Диск. */
export function formatBytes(n: number): string {
  const U = ru.sync.units;
  if (n >= GB) {
    const v = n / GB;
    const s = v >= 100 ? Math.round(v).toString() : (Math.round(v * 10) / 10).toString();
    return `${s.replace('.', ',')} ${U.gb}`;
  }
  if (n >= MB) return `${Math.round(n / MB)} ${U.mb}`;
  return U.lessMb;
}
