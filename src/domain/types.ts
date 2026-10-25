// Предметные типы (SPEC §4.2). Даты — строки YYYY-MM-DD, деньги — целые рубли.

export type ID = string;

/** Запись в памяти приложения: поля `v` конверта (§4.1) плюс id и время создания. */
export type Entity<T> = T & { id: ID; createdAt: string };

export interface PhotoRef {
  blobId: ID;
  thumbId: ID;
  width: number;
  height: number;
  bytes: number;
  takenAt?: string;
}

export type ContactKind = 'vk' | 'max' | 'tg' | 'wa' | 'phone';

export type HealthFlag =
  | 'pregnancy'
  | 'diabetes'
  | 'herpes'
  | 'bloodthin'
  | 'clotting'
  | 'retinoids'
  | 'keloid'
  | 'skin'
  | 'autoimmune'
  | 'epilepsy'
  | 'oncology'
  | 'infection';

export interface Health {
  filledAt: string;
  flags: Partial<Record<HealthFlag, boolean>>;
  /** Нижний регистр: «лидокаин», «никель» */
  allergies: string[];
  meds: string;
  other: string;
}

export interface Client {
  cardNo: number;
  lastName: string;
  firstName: string;
  middleName: string;
  /** +7XXXXXXXXXX */
  phone: string;
  contact: { kind: ContactKind; handle: string };
  birth: string;
  source: string;
  tags: string[];
  facePhoto: PhotoRef | null;
  notes: string;
  consents: {
    pd: { date: string; photos: PhotoRef[] };
    procedure: { date: string; photos: PhotoRef[] };
    health: { date: string };
  };
  /** Чувствительные данные: не показываются в списках и таблицах */
  health: Health | null;
  /** Ключ напоминания → дата «напомнили» */
  reminded: Record<string, string>;
  /** Номер изменён при синхронизации (дубль номера, §7.1) */
  cardNoChanged?: boolean;
}

export type VisitType = 'primary' | 'correction' | 'update' | 'cover' | 'removal';
export type HealingStatus = 'good' | 'uneven' | 'faded' | 'shade' | 'slow' | 'reaction';
export type Payment = 'card' | 'cash' | 'transfer' | 'cert';
export type ProcStatus = 'done' | 'noshow' | 'cancel';
export type PhotoStage = 'before' | 'after' | 'month';

export interface Discount {
  mode: 'pct' | 'rub';
  value: number;
  reason: string;
}

export interface ProcPigment {
  pigmentId: ID;
  lot: string;
  ratio: string;
}

export interface Procedure {
  clientId: ID;
  date: string;
  serviceId: ID;
  type: VisitType;
  zone: ID;
  /** Из Zone.techniques, '' для удаления */
  technique: string;
  anesthesia: { primary: ID | ''; secondary: ID | '' };
  /** Смесь; для удаления — ремувер */
  pigments: ProcPigment[];
  needles: ID[];
  photos: Record<PhotoStage, PhotoRef[]>;
  /** Заполняется на коррекции */
  healing: { status: HealingStatus | ''; note: string };
  note: string;
  price: number;
  discount: Discount;
  payment: Payment;
  certificateId: ID | '';
  status: ProcStatus;
  model: { on: boolean; courseId: ID | '' };
}

export type PigmentKind = 'Органический' | 'Минеральный' | 'Гибридный' | 'Корректор' | 'Ремувер';
export type ZoneGroup = 'pmu' | 'camo' | 'other';

export interface Service {
  name: string;
  zones: ID[];
  type: VisitType;
  technique: string;
  price: number;
  /** Минуты */
  duration: number;
  active: boolean;
}

export interface PigmentLot {
  no: string;
  /** Годен до, YYYY-MM-DD; '' если не указано */
  exp: string;
}

export interface Pigment {
  brand: string;
  name: string;
  kind: PigmentKind;
  zones: ID[];
  hex: string;
  /** Сверху — текущая партия */
  lots: PigmentLot[];
  active: boolean;
}

export interface Needle {
  name: string;
  note: string;
  active: boolean;
}

export interface Anesthetic {
  name: string;
  stage: 'primary' | 'secondary';
  substances: string[];
  active: boolean;
}

export interface Zone {
  name: string;
  group: ZoneGroup;
  techniques: string[];
  update: boolean;
}

export interface Course {
  name: string;
  start: string;
  note: string;
}

export interface Certificate {
  no: string;
  amount: number;
  soldAt: string;
  validTo: string;
  buyer: string;
  recipient: string;
  payment: 'card' | 'cash' | 'transfer';
  note: string;
  usedProcId: ID | '';
  usedAt: string;
}

export interface Expense {
  category: string;
  name: string;
  amount: number;
  date: string;
}

export type TemplateId = 'corr' | 'upd' | 'bday' | 'lost' | 'free';

export interface Settings {
  /** Окно коррекции, дни (28 / 56) */
  corrFrom: number;
  corrTo: number;
  /** Обновление, месяцы (12 / 18) */
  updFrom: number;
  updTo: number;
  /** «Давно не были», месяцы (24) */
  lostAfter: number;
  /** 0 — не блокировать */
  autoLockMinutes: number;
  quickUnlock: 'faceid' | 'pin' | 'password';
  theme: 'auto' | 'light' | 'dark';
  nextCardNo: number;
  nextCertNo: number;
  lastBackup: string;
  backupReminderDays: number;
  /** Подстановки {имя} {зона} {дата} {дней} */
  templates: Record<TemplateId, string>;
  stripExif: true;
  keepTakenAt: boolean;
  photoMaxSide: number;
}

export interface Lists {
  sources: string[];
  tags: string[];
  discountReasons: string[];
  expenseCategories: string[];
}

/** Всё, с чем работают предметные правила: записи и каталог. */
export interface Data {
  clients: Entity<Client>[];
  procedures: Entity<Procedure>[];
  services: Entity<Service>[];
  pigments: Entity<Pigment>[];
  needles: Entity<Needle>[];
  anesthetics: Entity<Anesthetic>[];
  zones: Entity<Zone>[];
  courses: Entity<Course>[];
  certificates: Entity<Certificate>[];
  expenses: Entity<Expense>[];
  settings: Settings;
  lists: Lists;
}
