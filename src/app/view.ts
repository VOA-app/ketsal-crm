// Состояние экранов, которое должно пережить переход назад: выбранные вкладки, фильтры, поиск.
// Не сохраняется на устройстве.
import { create } from 'zustand';
import type { ClientView } from '../domain/constants';
import type { ClientSort } from '../domain/reminders';
import type { ReportMode } from '../domain/reports';
import { todayISO } from '../domain/dates';

export type ProcPeriod = 'today' | 'week' | 'month' | 'prev' | 'all';
export type ExpPeriod = 'month' | 'prev' | 'year' | 'all';
export type CertFilter = 'active' | 'used' | 'expired' | 'all';
export type ClientTab = 'history' | 'photos' | 'data';
export type RefKind = 'services' | 'pigments' | 'needles' | 'anesthetics' | 'zones' | 'courses';

interface ViewState {
  clientView: ClientView;
  clientSearch: string;
  clientSort: ClientSort;
  clientTab: Record<string, ClientTab>;
  photoZone: Record<string, string>;
  healthShown: Record<string, boolean>;
  backupBannerHidden: boolean;
  procPeriod: ProcPeriod;
  procSearch: string;
  refsKind: RefKind;
  reportMode: ReportMode;
  reportCursor: string;
  reportTable: boolean;
  certFilter: CertFilter;
  expPeriod: ExpPeriod;
  set(patch: Partial<ViewState>): void;
}

export const useView = create<ViewState>((set) => ({
  clientView: 'all',
  clientSearch: '',
  clientSort: 'name',
  clientTab: {},
  photoZone: {},
  healthShown: {},
  backupBannerHidden: false,
  procPeriod: 'week',
  procSearch: '',
  refsKind: 'services',
  reportMode: 'month',
  reportCursor: todayISO(),
  reportTable: false,
  certFilter: 'active',
  expPeriod: 'month',
  set: (patch) => set(patch),
}));
