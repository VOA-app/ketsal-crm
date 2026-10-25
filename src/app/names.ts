// Подписи по идентификаторам для экранов: названия зон, услуг, пигментов; тексты предупреждений.
import { HEALTH_FLAGS } from '../domain/constants';
import type { DomainIndex } from '../domain/indexing';
import { discountAmount, totalOf } from '../domain/money';
import { lc } from '../domain/text';
import type { Certificate, Client, ID, Procedure } from '../domain/types';
import type { ProcWarning } from '../domain/warnings';
import { fmtDate, fmtMoney, fmtMonthNum, NBSP } from '../i18n/format';
import { HEALTH_FLAG, ru } from '../i18n/ru';

export const zoneName = (idx: DomainIndex, id: ID) => idx.zone.get(id)?.name ?? ru.common.none;
export const serviceName = (idx: DomainIndex, id: ID) => idx.service.get(id)?.name ?? ru.proc.serviceDeleted;
export const pigmentLabel = (idx: DomainIndex, id: ID) => idx.pigment.get(id)?.name ?? ru.proc.pigmentDeleted;
export const pigmentFull = (idx: DomainIndex, id: ID) => {
  const p = idx.pigment.get(id);
  return p ? `${p.brand} · ${p.name}` : ru.proc.pigmentDeleted;
};
export const needleName = (idx: DomainIndex, id: ID) => idx.needle.get(id)?.name ?? ru.common.none;
export const anestName = (idx: DomainIndex, id: ID) => idx.anest.get(id)?.name ?? ru.common.none;
export const courseName = (idx: DomainIndex, id: ID) => idx.course.get(id)?.name ?? ru.proc.courseNone;

export function discountText(p: Pick<Procedure, 'discount'>): string {
  if (!p.discount || !p.discount.value) return '';
  return p.discount.mode === 'pct' ? `${p.discount.value}${NBSP}%` : fmtMoney(p.discount.value);
}

/** Отметки анкеты здоровья строками (для карты и печати). */
export function healthMarks(c: Client): string[] {
  const h = c.health;
  if (!h) return [];
  const out = HEALTH_FLAGS.filter((f) => h.flags?.[f.id]).map((f) => HEALTH_FLAG[f.id]);
  if ((h.allergies || []).length) out.push(ru.card.allergy(h.allergies.join(', ')));
  if ((h.meds || '').trim()) out.push(ru.card.meds(h.meds.trim()));
  if ((h.other || '').trim()) out.push(h.other.trim());
  return out;
}

export function warningText(idx: DomainIndex, w: ProcWarning): string {
  const W = ru.warnings;
  switch (w.code) {
    case 'healthMissing':
      return W.healthMissing;
    case 'healthOld':
      return W.healthOld(w.months);
    case 'allergyHit':
      return W.allergyHit(w.substances.join(', '));
    case 'allergyInfo':
      return W.allergyInfo(w.allergies.join(', '));
    case 'zoneFlag':
      return W.zoneFlag(lc(HEALTH_FLAG[w.flag]));
    case 'healthFlags':
      return W.healthFlags(w.flags.map((f) => lc(HEALTH_FLAG[f])).join('; '));
    case 'meds':
      return W.meds(w.meds);
    case 'noProcConsent':
      return W.noProcConsent;
    case 'noPdConsent':
      return W.noPdConsent;
    case 'noHealthConsent':
      return W.noHealthConsent;
    case 'lotExpired':
      return W.lotExpired(w.lot, pigmentLabel(idx, w.pigmentId), fmtMonthNum(w.exp));
    case 'pigmentReaction':
      return W.pigmentReaction(pigmentLabel(idx, w.pigmentId), fmtDate(w.procDate));
  }
}

/** Подпись под сертификатом при оплате: номинал и доплата. */
export function certPayText(cert: Certificate, total: number): string {
  const diff = total - cert.amount;
  if (diff > 0) return ru.procForm.certExtra(fmtMoney(cert.amount), fmtMoney(diff));
  if (diff < 0) return ru.procForm.certOver(fmtMoney(cert.amount), fmtMoney(-diff));
  return ru.procForm.certFace(fmtMoney(cert.amount));
}

export const procTotal = (p: Pick<Procedure, 'price' | 'discount'>) => totalOf(p);
export const procDiscount = (p: Pick<Procedure, 'price' | 'discount'>) => discountAmount(p.price, p.discount);
