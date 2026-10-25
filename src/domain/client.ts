// Сводка по клиентке: визиты, траты, напоминания о коррекции и обновлении (SPEC §4.4).
import { addDays, ageOn, daysBetween, isISO, monthsBetween, nextBirthday } from './dates';
import { discountAmount, sum, totalOf } from './money';
import { MODEL_TAG } from './constants';
import { isAfter, procsOf, type DomainIndex } from './indexing';
import { uniq } from './text';
import type { Client, Entity, ID, Procedure } from './types';

export interface CorrItem {
  kind: 'corr';
  zone: ID;
  /** Первичная или перекрытие, после которой ждём коррекцию */
  proc: Entity<Procedure>;
  days: number;
  state: 'soon' | 'now' | 'late';
  winFrom: string;
  winTo: string;
  key: string;
}

export interface UpdItem {
  kind: 'upd';
  zone: ID;
  /** Последняя процедура в зоне */
  proc: Entity<Procedure>;
  months: number;
  state: 'now' | 'late';
  key: string;
}

export interface BdayInfo {
  date: string;
  inDays: number;
  age: number;
  key: string;
}

export interface ClientInfo {
  procs: Entity<Procedure>[];
  done: Entity<Procedure>[];
  last: Entity<Procedure> | null;
  first: Entity<Procedure> | null;
  zones: ID[];
  corr: CorrItem[];
  upd: UpdItem[];
  bday: BdayInfo | null;
  spent: number;
  discounts: number;
  visits: number;
  lost: boolean;
  isModel: boolean;
  consentMissing: boolean;
  healthConsentMissing: boolean;
  procConsentMissing: boolean;
  healthMissing: boolean;
}

export function hasHealthData(c: Client): boolean {
  const h = c.health;
  if (!h) return false;
  return (
    Object.values(h.flags || {}).some(Boolean) ||
    (h.allergies || []).length > 0 ||
    !!(h.meds || '').trim() ||
    !!(h.other || '').trim()
  );
}

export function clientInfo(idx: DomainIndex, c: Entity<Client>): ClientInfo {
  const cached = idx.info.get(c.id);
  if (cached) return cached;
  const T = idx.today;
  const st = idx.data.settings;
  const procs = procsOf(idx, c.id);
  const done = procs.filter((p) => p.status === 'done');
  const last = done[0] ?? null;
  const first = done.length ? done[done.length - 1] : null;
  const zones = uniq(done.map((p) => p.zone));
  const corr: CorrItem[] = [];
  const upd: UpdItem[] = [];
  for (const z of zones) {
    const inZone = done.filter((p) => p.zone === z);
    const latest = inZone[0];
    // После удаления в зоне не напоминаем
    if (latest.type === 'removal') continue;
    const lastPrimary = inZone.find((p) => p.type === 'primary' || p.type === 'cover');
    if (lastPrimary) {
      const satisfied = inZone.some((p) => (p.type === 'correction' || p.type === 'update') && isAfter(p, lastPrimary));
      if (!satisfied) {
        const days = daysBetween(lastPrimary.date, T);
        if (days < st.corrFrom - 7) continue;
        if (days <= st.corrTo + 60) {
          corr.push({
            kind: 'corr',
            zone: z,
            proc: lastPrimary,
            days,
            state: days < st.corrFrom ? 'soon' : days <= st.corrTo ? 'now' : 'late',
            winFrom: addDays(lastPrimary.date, st.corrFrom),
            winTo: addDays(lastPrimary.date, st.corrTo),
            key: `corr:${lastPrimary.id}`,
          });
          continue;
        }
      }
    }
    const zd = idx.zone.get(z);
    if (!zd || !zd.update) continue;
    const months = monthsBetween(latest.date, T);
    if (months >= st.updFrom && months < st.lostAfter) {
      upd.push({
        kind: 'upd',
        zone: z,
        proc: latest,
        months,
        state: months < st.updTo ? 'now' : 'late',
        key: `upd:${latest.id}`,
      });
    }
  }
  let bday: BdayInfo | null = null;
  if (isISO(c.birth)) {
    const next = nextBirthday(c.birth, T);
    bday = { date: next, inDays: daysBetween(T, next), age: ageOn(c.birth, next), key: `bday:${next}` };
  }
  const inf: ClientInfo = {
    procs,
    done,
    last,
    first,
    zones,
    corr,
    upd,
    bday,
    spent: sum(done, totalOf),
    discounts: sum(done, (p) => discountAmount(p.price, p.discount)),
    visits: done.length,
    lost: !!last && monthsBetween(last.date, T) >= st.lostAfter,
    isModel: (c.tags || []).includes(MODEL_TAG) || done.some((p) => p.model && p.model.on),
    consentMissing: !c.consents?.pd?.date,
    healthConsentMissing: hasHealthData(c) && !c.consents?.health?.date,
    procConsentMissing: !c.consents?.procedure?.date,
    healthMissing: !c.health?.filledAt,
  };
  idx.info.set(c.id, inf);
  return inf;
}
