// Телефоны храним как +7XXXXXXXXXX.

const NBSP = ' ';

/** `8 917…`, `+7(917)…`, `917…` → `+7917…` */
export function normPhone(s: string): string {
  let d = String(s || '').replace(/\D/g, '');
  if (d.length === 11 && d[0] === '8') d = `7${d.slice(1)}`;
  if (d.length === 10 && d[0] === '9') d = `7${d}`;
  return d ? `+${d}` : '';
}

/** +7 917 104-45-67 */
export function fmtPhone(p: string): string {
  const d = String(p || '').replace(/\D/g, '');
  if (d.length === 11 && d[0] === '7') {
    return `+7${NBSP}${d.slice(1, 4)}${NBSP}${d.slice(4, 7)}-${d.slice(7, 9)}-${d.slice(9)}`;
  }
  return p || '';
}

/** Цифры запроса для поиска по фрагменту телефона: ведущая 8 → 7. */
export function phoneQueryDigits(q: string): string {
  let d = String(q || '').replace(/\D/g, '');
  if (d.length >= 4 && d[0] === '8') d = `7${d.slice(1)}`;
  return d;
}
