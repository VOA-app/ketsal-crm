// Черновики формы процедуры, «повторить как в прошлый раз», партии пигментов (SPEC §4.4).
import { clientInfo } from './client';
import { procsOf, type DomainIndex } from './indexing';
import type { Entity, ID, PigmentLot, Procedure, Service, VisitType } from './types';

export interface PrevHealing {
  procId: ID;
  status: Procedure['healing']['status'];
  note: string;
}

/** Состояние формы процедуры: id === null — новая. */
export interface ProcDraft extends Procedure {
  id: ID | null;
  createdAt?: string;
  /** Заживление прошлой процедуры (на коррекции): «Как зажила процедура …» */
  prevHealing: PrevHealing | null;
  repeatedFrom?: ID;
}

export function newProcDraft(clientId: ID, date: string): ProcDraft {
  return {
    id: null,
    clientId,
    date,
    serviceId: '',
    type: 'primary',
    zone: '',
    technique: '',
    anesthesia: { primary: '', secondary: '' },
    pigments: [],
    needles: [],
    photos: { before: [], after: [], month: [] },
    healing: { status: '', note: '' },
    prevHealing: null,
    note: '',
    price: 0,
    discount: { mode: 'pct', value: 0, reason: '' },
    payment: 'card',
    certificateId: '',
    status: 'done',
    model: { on: false, courseId: '' },
  };
}

/** Действующая партия на дату: первая сверху, у которой не истёк срок; иначе — самая верхняя. */
export function defaultLot(idx: DomainIndex, pigmentId: ID, onDate: string): string {
  const p = idx.pigment.get(pigmentId);
  if (!p || !p.lots.length) return '';
  const valid = p.lots.find((l) => !l.exp || l.exp >= onDate);
  return (valid || p.lots[0]).no;
}

export const lotInfo = (idx: DomainIndex, pigmentId: ID, no: string): PigmentLot | null =>
  idx.pigment.get(pigmentId)?.lots.find((l) => l.no === no) ?? null;

/** Последняя состоявшаяся процедура в зоне (не удаление). */
export const lastInZone = (idx: DomainIndex, clientId: ID, zone: ID, exceptId?: ID | null): Entity<Procedure> | null =>
  procsOf(idx, clientId).find(
    (p) => p.status === 'done' && p.zone === zone && p.type !== 'removal' && p.id !== exceptId,
  ) ?? null;

/** Первая активная услуга этого типа для зоны. */
export const findService = (idx: DomainIndex, zone: ID, type: VisitType): Entity<Service> | null =>
  idx.data.services.find((s) => s.active && s.type === type && s.zones.includes(zone)) ?? null;

/** Процедура, заживление которой записывается при коррекции. */
export function healingTarget(idx: DomainIndex, d: ProcDraft): Entity<Procedure> | null {
  if (d.type !== 'correction' || !d.zone) return null;
  return (
    procsOf(idx, d.clientId).find(
      (p) =>
        p.status === 'done' &&
        p.zone === d.zone &&
        p.id !== d.id &&
        (p.type === 'primary' || p.type === 'cover') &&
        p.date <= d.date,
    ) ?? null
  );
}

/** Подтягивает в черновик «как зажила» нужной процедуры, сохраняя уже введённое. */
export function withPrevHealing(idx: DomainIndex, d: ProcDraft): ProcDraft {
  const t = healingTarget(idx, d);
  if (!t) return d.prevHealing ? { ...d, prevHealing: null } : d;
  if (d.prevHealing && d.prevHealing.procId === t.id) return d;
  return { ...d, prevHealing: { procId: t.id, status: t.healing?.status || '', note: t.healing?.note || '' } };
}

/** «Повторить как в прошлый раз»: материалы из последней процедуры в зоне, партии — действующие. */
export function repeatDraft(idx: DomainIndex, clientId: ID, zone: ID, today: string, baseId?: ID): ProcDraft {
  const base = baseId ? (idx.proc.get(baseId) ?? null) : lastInZone(idx, clientId, zone);
  const d = newProcDraft(clientId, today);
  if (!base) return { ...d, zone: zone || '' };
  const c = idx.client.get(clientId);
  const pendingCorr = c ? clientInfo(idx, c).corr.find((x) => x.zone === base.zone) : undefined;
  const type: VisitType = base.type === 'removal' ? 'removal' : pendingCorr ? 'correction' : 'update';
  const svc = (type === 'removal' && idx.service.get(base.serviceId)) || findService(idx, base.zone, type);
  const draft: ProcDraft = {
    ...d,
    zone: base.zone,
    technique: base.technique || '',
    anesthesia: { ...base.anesthesia },
    needles: base.needles.slice(),
    pigments: base.pigments.map((pg) => ({
      pigmentId: pg.pigmentId,
      lot: defaultLot(idx, pg.pigmentId, today) || pg.lot,
      ratio: pg.ratio || '',
    })),
    type,
    serviceId: svc ? svc.id : '',
    price: svc ? svc.price : 0,
    repeatedFrom: base.id,
  };
  return withPrevHealing(idx, draft);
}

export function draftFromProc(idx: DomainIndex, p: Entity<Procedure>): ProcDraft {
  const d: ProcDraft = {
    ...structuredClone(p),
    photos: p.photos ? structuredClone(p.photos) : { before: [], after: [], month: [] },
    healing: p.healing ? { ...p.healing } : { status: '', note: '' },
    model: p.model ? { ...p.model } : { on: false, courseId: '' },
    prevHealing: null,
  };
  return withPrevHealing(idx, d);
}
