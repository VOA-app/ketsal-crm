// Индексы поверх данных: быстрый доступ по id и процедуры клиентки от новых к старым.
// Строятся заново после каждого изменения данных; сводки по клиенткам кэшируются внутри.
import type {
  Anesthetic,
  Certificate,
  Client,
  Course,
  Data,
  Entity,
  ID,
  Needle,
  Pigment,
  Procedure,
  Service,
  Zone,
} from './types';
import type { ClientInfo } from './client';
import type { ViewItem } from './reminders';

export interface DomainIndex {
  today: string;
  data: Data;
  client: Map<ID, Entity<Client>>;
  proc: Map<ID, Entity<Procedure>>;
  service: Map<ID, Entity<Service>>;
  pigment: Map<ID, Entity<Pigment>>;
  needle: Map<ID, Entity<Needle>>;
  anest: Map<ID, Entity<Anesthetic>>;
  zone: Map<ID, Entity<Zone>>;
  course: Map<ID, Entity<Course>>;
  cert: Map<ID, Entity<Certificate>>;
  /** Процедуры клиентки, от новых к старым */
  byClient: Map<ID, Entity<Procedure>[]>;
  /** Кэш сводок по клиенткам */
  info: Map<ID, ClientInfo>;
  /** Кэш списков видов (ключ — вид и сортировка) */
  views: Map<string, ViewItem[]>;
}

type Dated = { date: string; createdAt?: string };

/** a позже b: по дате, при равной дате — по времени создания. */
export const isAfter = (a: Dated, b: Dated): boolean =>
  a.date > b.date || (a.date === b.date && (a.createdAt || '') > (b.createdAt || ''));

export const byDateDesc = (a: Dated, b: Dated): number => (isAfter(a, b) ? -1 : isAfter(b, a) ? 1 : 0);

const byId = <T extends { id: ID }>(arr: T[]) => new Map(arr.map((x) => [x.id, x]));

export function buildIndex(data: Data, today: string): DomainIndex {
  const byClient = new Map<ID, Entity<Procedure>[]>();
  for (const p of data.procedures) {
    let arr = byClient.get(p.clientId);
    if (!arr) {
      arr = [];
      byClient.set(p.clientId, arr);
    }
    arr.push(p);
  }
  for (const arr of byClient.values()) arr.sort(byDateDesc);
  return {
    today,
    data,
    client: byId(data.clients),
    proc: byId(data.procedures),
    service: byId(data.services),
    pigment: byId(data.pigments),
    needle: byId(data.needles),
    anest: byId(data.anesthetics),
    zone: byId(data.zones),
    course: byId(data.courses),
    cert: byId(data.certificates),
    byClient,
    info: new Map(),
    views: new Map(),
  };
}

export const procsOf = (idx: DomainIndex, clientId: ID): Entity<Procedure>[] => idx.byClient.get(clientId) ?? [];
