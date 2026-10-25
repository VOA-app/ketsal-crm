// Небольшие выдуманные данные для тестов предметных правил.
import { addDays } from '../../src/domain/dates';
import { emptyData } from '../../src/domain/defaults';
import { demoAnesthetics, demoNeedles, demoPigments, demoServices } from '../../src/dev/demo';
import { buildIndex } from '../../src/domain/indexing';
import type { Client, Data, Entity, Procedure } from '../../src/domain/types';

export const TODAY = '2026-10-25';
export const ago = (n: number) => addDays(TODAY, -n);

export function baseData(): Data {
  const D = emptyData(TODAY);
  D.services = demoServices(TODAY);
  D.pigments = demoPigments(TODAY);
  D.needles = demoNeedles(TODAY);
  D.anesthetics = demoAnesthetics(TODAY);
  return D;
}

let seq = 0;

export function client(D: Data, o: Partial<Client> & { id?: string } = {}): Entity<Client> {
  seq += 1;
  const c: Entity<Client> = {
    id: o.id ?? `c${seq}`,
    createdAt: ago(400),
    cardNo: seq,
    lastName: 'Тестова',
    firstName: 'Анна',
    middleName: '',
    phone: '+79170000000',
    contact: { kind: 'phone', handle: '' },
    birth: '',
    source: '',
    tags: [],
    facePhoto: null,
    notes: '',
    consents: {
      pd: { date: ago(400), photos: [] },
      procedure: { date: ago(400), photos: [] },
      health: { date: ago(400) },
    },
    health: { filledAt: ago(30), flags: {}, allergies: [], meds: '', other: '' },
    reminded: {},
    ...o,
  };
  D.clients.push(c);
  return c;
}

export function proc(
  D: Data,
  c: Entity<Client>,
  daysAgo: number,
  o: Partial<Procedure> & { id?: string } = {},
): Entity<Procedure> {
  seq += 1;
  const svc = D.services.find((s) => s.id === (o.serviceId ?? 's_brows_powder'))!;
  const p: Entity<Procedure> = {
    id: o.id ?? `p${seq}`,
    createdAt: `${ago(daysAgo)}T12:00:${String(seq % 60).padStart(2, '0')}`,
    clientId: c.id,
    date: ago(daysAgo),
    serviceId: svc.id,
    type: svc.type,
    zone: svc.zones[0],
    technique: svc.technique,
    anesthesia: { primary: '', secondary: '' },
    pigments: [],
    needles: [],
    photos: { before: [], after: [], month: [] },
    healing: { status: '', note: '' },
    note: '',
    price: svc.price,
    discount: { mode: 'pct', value: 0, reason: '' },
    payment: 'card',
    certificateId: '',
    status: 'done',
    model: { on: false, courseId: '' },
    ...o,
  };
  D.procedures.push(p);
  return p;
}

export const index = (D: Data, today = TODAY) => buildIndex(D, today);
