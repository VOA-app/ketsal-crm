// Предупреждения в форме процедуры (SPEC §4.4). Важные (danger) требуют подтверждения при сохранении.
// Возвращаются коды с параметрами; текст собирает интерфейс из i18n.
import { hasHealthData } from './client';
import { HEALTH_FLAGS } from './constants';
import { monthsBetween } from './dates';
import { procsOf, type DomainIndex } from './indexing';
import { lotInfo, type ProcDraft } from './procedures';
import { norm } from './text';
import type { HealthFlag, ID } from './types';

export type WarningLevel = 'danger' | 'warn' | 'info';

export type ProcWarning =
  | { level: 'warn'; code: 'healthMissing'; act: 'health' }
  | { level: 'info'; code: 'healthOld'; months: number; act: 'health' }
  | { level: 'danger'; code: 'allergyHit'; substances: string[] }
  | { level: 'warn'; code: 'allergyInfo'; allergies: string[] }
  | { level: 'danger'; code: 'zoneFlag'; flag: HealthFlag }
  | { level: 'warn'; code: 'healthFlags'; flags: HealthFlag[] }
  | { level: 'info'; code: 'meds'; meds: string }
  | { level: 'warn'; code: 'noProcConsent'; act: 'consents' }
  | { level: 'warn'; code: 'noPdConsent'; act: 'consents' }
  | { level: 'warn'; code: 'noHealthConsent'; act: 'consents' }
  | { level: 'danger'; code: 'lotExpired'; pigmentId: ID; lot: string; exp: string }
  | { level: 'danger'; code: 'pigmentReaction'; pigmentId: ID; procDate: string };

export function procWarnings(idx: DomainIndex, d: ProcDraft): ProcWarning[] {
  const c = idx.client.get(d.clientId);
  if (!c) return [];
  const w: ProcWarning[] = [];
  const h = c.health;
  const when = d.date || idx.today;
  if (!h || !h.filledAt) w.push({ level: 'warn', code: 'healthMissing', act: 'health' });
  else {
    const m = monthsBetween(h.filledAt, when);
    if (m >= 12) w.push({ level: 'info', code: 'healthOld', months: m, act: 'health' });
    const subs = [d.anesthesia.primary, d.anesthesia.secondary]
      .filter(Boolean)
      .flatMap((id) => idx.anest.get(id)?.substances ?? []);
    const allergies = (h.allergies || []).map(norm).filter(Boolean);
    const hits = allergies.filter((a) => subs.some((s) => norm(s).includes(a) || a.includes(norm(s))));
    if (hits.length) w.push({ level: 'danger', code: 'allergyHit', substances: hits });
    else if (allergies.length) w.push({ level: 'warn', code: 'allergyInfo', allergies });
    const flags = HEALTH_FLAGS.filter((f) => h.flags?.[f.id]);
    for (const f of flags) if (f.zones?.includes(d.zone)) w.push({ level: 'danger', code: 'zoneFlag', flag: f.id });
    const general = flags.filter((f) => !f.zones).map((f) => f.id);
    if (general.length) w.push({ level: 'warn', code: 'healthFlags', flags: general });
    if ((h.meds || '').trim()) w.push({ level: 'info', code: 'meds', meds: h.meds.trim() });
  }
  if (!c.consents?.procedure?.date) w.push({ level: 'warn', code: 'noProcConsent', act: 'consents' });
  if (!c.consents?.pd?.date) w.push({ level: 'warn', code: 'noPdConsent', act: 'consents' });
  else if (hasHealthData(c) && !c.consents.health?.date)
    w.push({ level: 'warn', code: 'noHealthConsent', act: 'consents' });
  for (const pg of d.pigments) {
    if (!pg.pigmentId) continue;
    const lot = lotInfo(idx, pg.pigmentId, pg.lot);
    if (lot && lot.exp && lot.exp < when) {
      w.push({ level: 'danger', code: 'lotExpired', pigmentId: pg.pigmentId, lot: pg.lot, exp: lot.exp });
    }
    const reaction = procsOf(idx, c.id).find(
      (p) => p.id !== d.id && p.healing?.status === 'reaction' && p.pigments.some((x) => x.pigmentId === pg.pigmentId),
    );
    if (reaction)
      w.push({ level: 'danger', code: 'pigmentReaction', pigmentId: pg.pigmentId, procDate: reaction.date });
  }
  return w;
}

export const hasDanger = (w: ProcWarning[]): boolean => w.some((x) => x.level === 'danger');
