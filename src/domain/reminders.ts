// Виды списка клиенток (коррекция, обновление, именинники…) и отметка «напомнили» (SPEC §4.4).
import { clientInfo, type ClientInfo, type CorrItem, type UpdItem } from './client';
import type { ClientView } from './constants';
import { daysBetween } from './dates';
import type { DomainIndex } from './indexing';
import type { Client, Entity } from './types';

export type ClientSort = 'name' | 'card' | 'recent';

export type ViewReminder = CorrItem | UpdItem | { kind: 'bday'; key: string } | { kind: 'lost'; key: string };

export interface ViewItem {
  c: Entity<Client>;
  inf: ClientInfo;
  it?: ViewReminder;
}

/** Сколько дней клиентка остаётся внизу списка после «напомнили». */
export const REMINDED_DAYS = 14;

export const remindedAt = (c: Client, key: string): string => c.reminded?.[key] || '';

export function recentlyReminded(c: Client, key: string, today: string): boolean {
  const d = remindedAt(c, key);
  return !!d && daysBetween(d, today) < REMINDED_DAYS;
}

/** Новая карта отметок с «напомнили сегодня» по ключу. */
export const withReminded = (c: Client, key: string, today: string): Record<string, string> => ({
  ...(c.reminded || {}),
  [key]: today,
});

const collator = new Intl.Collator('ru');

export function sortClientItems<T extends { c: Entity<Client>; inf: ClientInfo }>(items: T[], mode: ClientSort): T[] {
  if (mode === 'card') items.sort((a, b) => b.c.cardNo - a.c.cardNo);
  else if (mode === 'recent') {
    const k = (x: T) => (x.inf.last ? x.inf.last.date : x.c.createdAt);
    items.sort((a, b) => (k(a) < k(b) ? 1 : k(a) > k(b) ? -1 : 0));
  } else {
    items.sort((a, b) => collator.compare(`${a.c.lastName} ${a.c.firstName}`, `${b.c.lastName} ${b.c.firstName}`));
  }
  return items;
}

export function viewItems(idx: DomainIndex, view: ClientView, sort: ClientSort = 'name'): ViewItem[] {
  const cacheKey = `${view}:${sort}`;
  const cached = idx.views.get(cacheKey);
  if (cached) return cached;
  const out: ViewItem[] = [];
  for (const c of idx.data.clients) {
    const inf = clientInfo(idx, c);
    if (view === 'all') out.push({ c, inf });
    else if (view === 'corr') inf.corr.forEach((it) => out.push({ c, inf, it }));
    else if (view === 'upd') inf.upd.forEach((it) => out.push({ c, inf, it }));
    else if (view === 'bday') {
      if (inf.bday && inf.bday.inDays <= 30) out.push({ c, inf, it: { kind: 'bday', key: inf.bday.key } });
    } else if (view === 'models') {
      if (inf.isModel) out.push({ c, inf });
    } else if (view === 'lost') {
      if (inf.lost && inf.last) out.push({ c, inf, it: { kind: 'lost', key: `lost:${inf.last.id}` } });
    } else if (view === 'noconsent') {
      if (inf.consentMissing || inf.healthConsentMissing) out.push({ c, inf });
    }
  }
  const T = idx.today;
  const rr = (x: ViewItem) => (x.it && recentlyReminded(x.c, x.it.key, T) ? 1 : 0);
  if (view === 'corr') {
    const rank = { late: 0, now: 1, soon: 2 };
    out.sort((a, b) => {
      const ai = a.it as CorrItem;
      const bi = b.it as CorrItem;
      return rr(a) - rr(b) || rank[ai.state] - rank[bi.state] || bi.days - ai.days;
    });
  } else if (view === 'upd') {
    out.sort((a, b) => rr(a) - rr(b) || (b.it as UpdItem).months - (a.it as UpdItem).months);
  } else if (view === 'bday') {
    out.sort((a, b) => a.inf.bday!.inDays - b.inf.bday!.inDays);
  } else if (view === 'lost') {
    out.sort((a, b) => (a.inf.last!.date < b.inf.last!.date ? 1 : -1));
  } else sortClientItems(out, sort);
  idx.views.set(cacheKey, out);
  return out;
}

/** Значок на вкладке «Клиенты»: коррекции в окне или просроченные, о которых не напомнили. */
export function urgentCount(idx: DomainIndex): number {
  return viewItems(idx, 'corr').filter((x) => {
    const it = x.it as CorrItem;
    return it.state !== 'soon' && !recentlyReminded(x.c, it.key, idx.today);
  }).length;
}
