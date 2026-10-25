// Даты и суммы прописью для интерфейса.
import { daysBetween, isISO, parseISO } from '../domain/dates';
import { cap } from '../domain/text';
import { NBSP, fmtNum, pl } from './plural';
import { MONTHS_GEN, MONTHS_NOM, MONTHS_SHORT, WEEKDAYS, ru } from './ru';

export { fmtMoney, fmtNum, pl, plural, NBSP } from './plural';

const thisYear = () => new Date().getFullYear();

/** «14 марта», с годом — если год не текущий (или year === true). */
export function fmtDate(iso: string, year: boolean | 'auto' = 'auto'): string {
  if (!isISO(iso)) return '';
  const d = parseISO(iso);
  const show = year === true || (year === 'auto' && d.getFullYear() !== thisYear());
  return `${d.getDate()} ${MONTHS_GEN[d.getMonth()]}${show ? ` ${d.getFullYear()}` : ''}`;
}

/** «14 мар», год — если не текущий. */
export function fmtDateShort(iso: string): string {
  if (!isISO(iso)) return '';
  const d = parseISO(iso);
  const y = d.getFullYear() !== thisYear() ? ` ${d.getFullYear()}` : '';
  return `${d.getDate()}${NBSP}${MONTHS_SHORT[d.getMonth()]}${y}`;
}

/** 14.03.2026 */
export function fmtDateNum(iso: string): string {
  if (!isISO(iso)) return '';
  const d = parseISO(iso);
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
}

/** 03.2026 — срок годности партии */
export function fmtMonthNum(iso: string): string {
  if (!isISO(iso)) return '';
  const d = parseISO(iso);
  return `${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
}

/** «Март 2026» */
export const fmtMonthYear = (iso: string): string =>
  `${cap(MONTHS_NOM[parseISO(iso).getMonth()])} ${parseISO(iso).getFullYear()}`;

/** «сегодня», «вчера», «через 3 дня», «5 дней назад» */
export function relDay(iso: string, today: string): string {
  const n = daysBetween(today, iso);
  if (n === 0) return 'сегодня';
  if (n === 1) return 'завтра';
  if (n === -1) return 'вчера';
  if (n > 1) return `через ${pl(n, 'день', 'дня', 'дней')}`;
  return `${pl(-n, 'день', 'дня', 'дней')} назад`;
}

/** Заголовок дня в журнале. */
export function dayHeader(iso: string, today: string): string {
  const n = daysBetween(iso, today);
  const base = fmtDate(iso);
  if (n === 0) return ru.journal.today(base);
  if (n === 1) return ru.journal.yesterday(base);
  return `${cap(base)}, ${WEEKDAYS[parseISO(iso).getDay()]}`;
}

/** 12 тыс, 1,2 млн — подписи осей. */
export function fmtMoneyShort(n: number): string {
  if (Math.abs(n) >= 1e6) return `${(n / 1e6).toFixed(1).replace('.', ',').replace(',0', '')}${NBSP}${ru.reports.million}`;
  if (Math.abs(n) >= 1e3) return `${Math.round(n / 1e3)}${NBSP}${ru.reports.thousand}`;
  return fmtNum(n);
}
