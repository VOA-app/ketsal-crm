// Даты хранятся строками YYYY-MM-DD и считаются в местном времени устройства.

export function toISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export const todayISO = (): string => toISO(new Date());

export function parseISO(s: string): Date {
  const [y, m, d] = String(s).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export const isISO = (s: unknown): s is string => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));

export function addDays(iso: string, n: number): string {
  const d = parseISO(iso);
  d.setDate(d.getDate() + n);
  return toISO(d);
}

/** Прибавляет месяцы; 31-е число становится последним днём короткого месяца. */
export function addMonths(iso: string, n: number): string {
  const d = parseISO(iso);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + n);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, last));
  return toISO(d);
}

export const daysBetween = (a: string, b: string): number =>
  Math.round((parseISO(b).getTime() - parseISO(a).getTime()) / 86400000);

/** Полных месяцев от a до b. */
export function monthsBetween(a: string, b: string): number {
  const A = parseISO(a);
  const B = parseISO(b);
  let m = (B.getFullYear() - A.getFullYear()) * 12 + (B.getMonth() - A.getMonth());
  if (B.getDate() < A.getDate()) m -= 1;
  return m;
}

export const startOfMonth = (iso: string): string => `${iso.slice(0, 7)}-01`;

export function endOfMonth(iso: string): string {
  const d = parseISO(iso);
  return toISO(new Date(d.getFullYear(), d.getMonth() + 1, 0));
}

export const ageOn = (birthISO: string, onISO: string): number => Math.floor(monthsBetween(birthISO, onISO) / 12);

/** Ближайший день рождения не раньше `today`; 29 февраля → 28-е в невисокосный год. */
export function nextBirthday(birth: string, today: string): string {
  const b = parseISO(birth);
  const t = parseISO(today);
  const mk = (y: number) => {
    const d = new Date(y, b.getMonth(), b.getDate());
    if (d.getMonth() !== b.getMonth()) d.setDate(0);
    return d;
  };
  let n = mk(t.getFullYear());
  if (n < t) n = mk(t.getFullYear() + 1);
  return toISO(n);
}
