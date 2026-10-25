// Отчёты за месяц или год (SPEC §4.4).
import { clientInfo } from './client';
import { addMonths, endOfMonth, parseISO, startOfMonth } from './dates';
import type { DomainIndex } from './indexing';
import { discountAmount, sum, totalOf } from './money';
import { uniq } from './text';
import type { Entity, Procedure } from './types';

export type ReportMode = 'month' | 'year';

export interface Group {
  key: string;
  count: number;
  value: number;
}

export function periodRange(mode: ReportMode, cursor: string): [string, string] {
  if (mode === 'year') {
    const y = cursor.slice(0, 4);
    return [`${y}-01-01`, `${y}-12-31`];
  }
  return [startOfMonth(cursor), endOfMonth(cursor)];
}

/** Тот же период год или месяц назад — для сравнения выручки. */
export const prevCursor = (mode: ReportMode, cursor: string): string => addMonths(cursor, mode === 'year' ? -12 : -1);

export function groupBy<T>(arr: readonly T[], keyFn: (x: T) => string | string[], valFn?: (x: T) => number): Group[] {
  const m = new Map<string, Group>();
  for (const x of arr) {
    for (const k of ([] as string[]).concat(keyFn(x))) {
      if (!k) continue;
      const g = m.get(k) || { key: k, count: 0, value: 0 };
      g.count += 1;
      g.value += valFn ? valFn(x) : 0;
      m.set(k, g);
    }
  }
  return Array.from(m.values());
}

const byValue = (x: Group, y: Group) => y.value - x.value;
const byCount = (x: Group, y: Group) => y.count - x.count;

export interface Report {
  a: string;
  b: string;
  count: number;
  revenue: number;
  avg: number;
  discounts: number;
  noshow: number;
  newClients: number;
  expenses: number;
  byExpense: Group[];
  byService: Group[];
  byZone: Group[];
  byType: Group[];
  byPigment: Group[];
  byReason: Group[];
  bySource: Group[];
  byCourse: Group[];
  byPayment: Group[];
  certsSold: number;
  certsSum: number;
}

/** Ключ «без курса» в разрезе моделей по курсам. */
export const NO_COURSE = 'none';

export function reportData(idx: DomainIndex, mode: ReportMode, cursor: string): Report {
  const { data } = idx;
  const [a, b] = periodRange(mode, cursor);
  const inR = (d: string) => d >= a && d <= b;
  const ps = data.procedures.filter((p) => inR(p.date));
  const done = ps.filter((p) => p.status === 'done');
  const revenue = sum(done, totalOf);
  const disc = (p: Entity<Procedure>) => discountAmount(p.price, p.discount);
  const newClients = data.clients.filter((c) => {
    const f = clientInfo(idx, c).first;
    return !!f && inR(f.date);
  });
  const certsSold = data.certificates.filter((c) => inR(c.soldAt));
  const exps = data.expenses.filter((e) => inR(e.date));
  return {
    a,
    b,
    count: done.length,
    revenue,
    avg: done.length ? Math.round(revenue / done.length) : 0,
    discounts: sum(done, disc),
    noshow: ps.filter((p) => p.status !== 'done').length,
    newClients: newClients.length,
    expenses: sum(exps, (e) => e.amount),
    byExpense: groupBy(
      exps,
      (e) => e.category || 'Другое',
      (e) => e.amount,
    ).sort(byValue),
    byService: groupBy(done, (p) => p.serviceId, totalOf).sort(byValue),
    byZone: groupBy(done, (p) => p.zone, totalOf).sort(byCount),
    byType: groupBy(done, (p) => p.type, totalOf).sort(byCount),
    byPigment: groupBy(done, (p) => uniq(p.pigments.map((g) => g.pigmentId))).sort(byCount),
    byReason: groupBy(
      done.filter((p) => disc(p) > 0),
      (p) => p.discount.reason || '',
      disc,
    ).sort(byValue),
    bySource: groupBy(newClients, (c) => c.source || '').sort(byCount),
    byCourse: groupBy(
      done.filter((p) => p.model?.on),
      (p) => p.model.courseId || NO_COURSE,
      disc,
    ).sort(byCount),
    byPayment: groupBy(done, (p) => p.payment, totalOf).sort(byValue),
    certsSold: certsSold.length,
    certsSum: sum(certsSold, (c) => c.amount),
  };
}

export interface MonthPoint {
  ym: string;
  iso: string;
  month: number;
  year: string;
  revenue: number;
  count: number;
  expenses: number;
}

/** Выручка по месяцам: n столбцов, последний — месяц endISO. */
export function monthlySeries(idx: DomainIndex, endISO: string, n = 12): MonthPoint[] {
  const out: MonthPoint[] = [];
  for (let i = n - 1; i >= 0; i -= 1) {
    const m = addMonths(startOfMonth(endISO), -i);
    const ym = m.slice(0, 7);
    const done = idx.data.procedures.filter((p) => p.status === 'done' && p.date.startsWith(ym));
    const expenses = sum(
      idx.data.expenses.filter((e) => e.date.startsWith(ym)),
      (e) => e.amount,
    );
    out.push({
      ym,
      iso: m,
      month: parseISO(m).getMonth(),
      year: m.slice(0, 4),
      revenue: sum(done, totalOf),
      count: done.length,
      expenses,
    });
  }
  return out;
}
