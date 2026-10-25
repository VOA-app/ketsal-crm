// Виды записей (SPEC §4.1) и соответствующие коллекции в Data.
import type { Data } from '../domain/types';

export type Kind =
  | 'client'
  | 'procedure'
  | 'service'
  | 'pigment'
  | 'needle'
  | 'anesthetic'
  | 'zone'
  | 'course'
  | 'certificate'
  | 'expense';

export type Coll = Exclude<keyof Data, 'settings' | 'lists'>;

export const COLL_KIND: Record<Coll, Kind> = {
  clients: 'client',
  procedures: 'procedure',
  services: 'service',
  pigments: 'pigment',
  needles: 'needle',
  anesthetics: 'anesthetic',
  zones: 'zone',
  courses: 'course',
  certificates: 'certificate',
  expenses: 'expense',
};

export const KIND_COLL = Object.fromEntries(Object.entries(COLL_KIND).map(([c, k]) => [k, c])) as Record<Kind, Coll>;

export const COLLS = Object.keys(COLL_KIND) as Coll[];

export type Item<C extends Coll> = Data[C][number];
