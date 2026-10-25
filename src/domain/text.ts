/** Для сравнения и поиска: нижний регистр, ё = е, без крайних пробелов. */
export const norm = (s: unknown): string =>
  String(s || '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .trim();

export const uniq = <T>(arr: readonly T[]): T[] => Array.from(new Set(arr));

export const cap = (s: string): string => (s ? s[0].toUpperCase() + s.slice(1) : s);
export const lc = (s: string): string => (s ? s[0].toLowerCase() + s.slice(1) : s);
