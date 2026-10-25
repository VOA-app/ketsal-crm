// Перечни идентификаторов в порядке показа. Подписи — в i18n/ru.ts.
import type {
  ContactKind,
  HealingStatus,
  HealthFlag,
  Payment,
  PhotoStage,
  PigmentKind,
  ProcStatus,
  TemplateId,
  VisitType,
  ZoneGroup,
} from './types';

export const VISIT_TYPES: VisitType[] = ['primary', 'correction', 'update', 'cover', 'removal'];
export const PAYMENTS: Payment[] = ['card', 'cash', 'transfer', 'cert'];
export const STATUSES: ProcStatus[] = ['done', 'noshow', 'cancel'];
export const HEALING: HealingStatus[] = ['good', 'uneven', 'faded', 'shade', 'slow', 'reaction'];
export const PHOTO_STAGES: PhotoStage[] = ['before', 'after', 'month'];
export const CONTACT_KINDS: ContactKind[] = ['vk', 'max', 'tg', 'wa', 'phone'];
export const ZONE_GROUPS: ZoneGroup[] = ['pmu', 'camo', 'other'];
export const PIGMENT_KINDS: PigmentKind[] = ['Органический', 'Минеральный', 'Гибридный', 'Корректор', 'Ремувер'];
export const TEMPLATE_IDS: TemplateId[] = ['corr', 'upd', 'bday', 'lost', 'free'];

/** Отметки анкеты здоровья. `zones` — зоны, для которых отметка становится важным предупреждением. */
export const HEALTH_FLAGS: { id: HealthFlag; zones?: string[] }[] = [
  { id: 'pregnancy' },
  { id: 'diabetes' },
  { id: 'herpes', zones: ['lips'] },
  { id: 'bloodthin' },
  { id: 'clotting' },
  { id: 'retinoids' },
  { id: 'keloid' },
  { id: 'skin' },
  { id: 'autoimmune' },
  { id: 'epilepsy' },
  { id: 'oncology' },
  { id: 'infection' },
];

export const ALLERGY_SUGGEST = ['лидокаин', 'прилокаин', 'бензокаин', 'тетракаин', 'латекс', 'никель'];

export type ClientView = 'all' | 'corr' | 'upd' | 'bday' | 'models' | 'lost' | 'noconsent';
export const CLIENT_VIEWS: ClientView[] = ['all', 'corr', 'upd', 'bday', 'models', 'lost', 'noconsent'];

/** Метка, по которой клиентка считается моделью (из стартового списка меток). */
export const MODEL_TAG = 'Модель';
