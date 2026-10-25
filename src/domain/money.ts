import type { Discount, Procedure } from './types';

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

/** Скидка в рублях: в % — round(price × %/100), не больше 100 %; в ₽ — не больше цены. */
export function discountAmount(price: number, d: Discount | null | undefined): number {
  if (!d || !d.value) return 0;
  const v = Number(d.value) || 0;
  return d.mode === 'pct' ? Math.round((price * clamp(v, 0, 100)) / 100) : clamp(v, 0, price);
}

/** Итог процедуры: цена минус скидка. */
export const totalOf = (p: Pick<Procedure, 'price' | 'discount'>): number =>
  Math.max(0, (Number(p.price) || 0) - discountAmount(Number(p.price) || 0, p.discount));

/** Деньги из поля ввода: только цифры, целые рубли. */
export function parseMoney(v: unknown): number {
  const n = parseInt(String(v ?? '').replace(/[^\d]/g, ''), 10);
  return Number.isFinite(n) ? n : 0;
}

export const sum = <T>(arr: readonly T[], f: (x: T) => number): number =>
  arr.reduce((s, x) => s + (Number(f(x)) || 0), 0);
