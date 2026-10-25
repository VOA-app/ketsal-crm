// Склонение и числа по-русски.

export const NBSP = ' ';

/** Форма слова для числа: 1 день, 2 дня, 5 дней. */
export function plural(n: number, one: string, few: string, many: string): string {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b > 1 && b < 5) return few;
  if (b === 1) return one;
  return many;
}

/** Число со словом: «3 дня». */
export const pl = (n: number, one: string, few: string, many: string): string =>
  `${n}${NBSP}${plural(n, one, few, many)}`;

/** 12 345 (неразрывные пробелы между разрядами, минус — настоящий). */
export function fmtNum(n: number): string {
  const v = Math.round(Math.abs(Number(n) || 0))
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
  return (n < 0 ? '−' : '') + v;
}

export const fmtMoney = (n: number): string => `${fmtNum(n)}${NBSP}₽`;
