// Демо-набор из прототипа: выдуманные клиентки, истории процедур, справочники (SPEC §4.3).
// Только для разработки и e2e: в прод-сборку не попадает. Даты считаются от «сегодня»,
// чтобы напоминания о коррекции и обновлении срабатывали при любом запуске.
import { addDays, addMonths, daysBetween } from '../domain/dates';
import { emptyData } from '../domain/defaults';
import { uniq } from '../domain/text';
import type {
  Anesthetic,
  Certificate,
  Client,
  Data,
  Discount,
  Entity,
  Expense,
  HealingStatus,
  Health,
  Needle,
  Payment,
  PhotoRef,
  PhotoStage,
  Pigment,
  Procedure,
  Service,
  VisitType,
} from '../domain/types';

/** Детерминированный генератор, чтобы демо-база была одинаковой при каждом запуске. */
export function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Ссылка на нарисованное демо-фото (см. dev/demoPhotos.ts). */
export const demoRef = (id: string): PhotoRef => ({ blobId: id, thumbId: id, width: 400, height: 300, bytes: 0 });

export const CAMO_ZONES = ['undereye', 'scars', 'areola', 'striae', 'scalp', 'vitiligo'];

/** Какой рисунок демо-фото подходит зоне. */
const ZONE_PHOTO: Record<string, string> = {
  brows: 'brows',
  lips: 'lips',
  lash: 'lash',
  undereye: 'camo',
  scars: 'camo',
  areola: 'areola',
  striae: 'camo',
  scalp: 'scalp',
  vitiligo: 'camo',
};

export function demoServices(createdAt: string): Entity<Service>[] {
  const s = (
    id: string,
    name: string,
    zones: string[],
    type: VisitType,
    price: number,
    duration: number,
    technique = '',
  ) => ({
    id,
    createdAt,
    name,
    zones,
    type,
    price,
    duration,
    technique,
    active: true,
  });
  return [
    s('s_brows_powder', 'Пудровые брови', ['brows'], 'primary', 7000, 150, 'Пудровое напыление'),
    s('s_brows_hair', 'Волосковые брови', ['brows'], 'primary', 7500, 180, 'Волосковая'),
    s('s_brows_corr', 'Коррекция бровей', ['brows'], 'correction', 3000, 90),
    s('s_brows_upd', 'Обновление бровей', ['brows'], 'update', 5000, 120),
    s('s_brows_cover', 'Перекрытие старого татуажа бровей', ['brows'], 'cover', 8500, 180),
    s('s_lips_lipstick', 'Губы: помадный эффект', ['lips'], 'primary', 8000, 150, 'Помадный эффект'),
    s('s_lips_aqua', 'Губы: акварельный прокрас', ['lips'], 'primary', 7500, 150, 'Акварельный прокрас'),
    s('s_lips_corr', 'Коррекция губ', ['lips'], 'correction', 3500, 90),
    s('s_lips_upd', 'Обновление губ', ['lips'], 'update', 5500, 120),
    s('s_lash', 'Межресничное пространство', ['lash'], 'primary', 5500, 90, 'Межресничка'),
    s('s_lash_corr', 'Коррекция межреснички', ['lash'], 'correction', 2500, 60),
    s('s_lash_upd', 'Обновление межреснички', ['lash'], 'update', 4000, 90),
    s('s_camo_undereye', 'Камуфляж тёмных кругов', ['undereye'], 'primary', 9000, 150, 'Камуфляж тёмных кругов'),
    s('s_camo_scar', 'Камуфляж шрамов, до 5 см', ['scars'], 'primary', 6000, 120, 'Камуфляж шрама'),
    s('s_camo_areola', 'Коррекция ареол', ['areola'], 'primary', 12000, 180, 'Коррекция ареолы'),
    s('s_camo_striae', 'Камуфляж стрий, участок', ['striae'], 'primary', 7000, 150, 'Камуфляж стрий'),
    s('s_camo_scalp', 'Трихопигментация, сеанс', ['scalp'], 'primary', 10000, 180, 'Трихопигментация'),
    s('s_camo_vitiligo', 'Камуфляж пятен и витилиго, участок', ['vitiligo'], 'primary', 6500, 120, 'Камуфляж пятен'),
    s('s_camo_repeat', 'Повторный сеанс камуфляжа', CAMO_ZONES.slice(), 'correction', 4000, 120),
    s('s_camo_upd', 'Обновление камуфляжа', ['areola', 'scalp'], 'update', 6000, 120),
    s('s_removal', 'Удаление ремувером, сеанс', ['brows', 'lips', 'lash'], 'removal', 3000, 60),
  ];
}

export function demoPigments(T: string): Entity<Pigment>[] {
  const p = (
    id: string,
    brand: string,
    name: string,
    kind: Pigment['kind'],
    zones: string[],
    hex: string,
    lots: Pigment['lots'],
  ) => ({
    id,
    createdAt: T,
    brand,
    name,
    kind,
    zones,
    hex,
    lots,
    active: true,
  });
  const m = (n: number) => addMonths(T, n);
  return [
    p('pg_a_choc', 'Марка А', 'Тёплый шоколад', 'Органический', ['brows'], '#6B4A3A', [
      { no: 'A-2407', exp: m(16) },
      { no: 'A-2311', exp: m(-1) },
    ]),
    p('pg_a_taupe', 'Марка А', 'Холодный тауп', 'Органический', ['brows'], '#6E6259', [
      { no: 'A-2405', exp: m(12) },
      { no: 'A-2302', exp: m(-7) },
    ]),
    p('pg_a_graphite', 'Марка А', 'Графит', 'Органический', ['brows', 'lash'], '#4A4543', [
      { no: 'A-2402', exp: m(8) },
    ]),
    p('pg_b_caramel', 'Марка Б', 'Карамель', 'Гибридный', ['brows'], '#9A6B4B', [
      { no: 'B-118', exp: m(20) },
      { no: 'B-097', exp: m(2) },
    ]),
    p('pg_b_ash', 'Марка Б', 'Пепельный блонд', 'Гибридный', ['brows'], '#8C7E72', [{ no: 'B-121', exp: m(18) }]),
    p('pg_b_orange', 'Марка Б', 'Корректор оранжевый', 'Корректор', ['brows'], '#D0803C', [
      { no: 'B-090', exp: m(10) },
    ]),
    p('pg_b_black', 'Марка Б', 'Чёрный', 'Минеральный', ['lash'], '#1F1B1B', [
      { no: 'B-131', exp: m(22) },
      { no: 'B-102', exp: m(1) },
    ]),
    p('pg_c_nude', 'Марка В', 'Нюд розовый', 'Органический', ['lips'], '#C98B85', [
      { no: 'C-5521', exp: m(14) },
      { no: 'C-5402', exp: m(-3) },
    ]),
    p('pg_c_coral', 'Марка В', 'Коралл', 'Органический', ['lips'], '#D46A5E', [{ no: 'C-5530', exp: m(15) }]),
    p('pg_c_cherry', 'Марка В', 'Вишня', 'Органический', ['lips'], '#A33A45', [{ no: 'C-5512', exp: m(9) }]),
    p('pg_c_warm', 'Марка В', 'Корректор тёплый', 'Корректор', ['lips'], '#D9895B', [{ no: 'C-5490', exp: m(6) }]),
    p(
      'pg_d_beige_l',
      'Марка Г',
      'Камуфляж, светлый беж',
      'Минеральный',
      ['undereye', 'scars', 'striae', 'vitiligo'],
      '#E3C3A8',
      [{ no: 'D-77', exp: m(12) }],
    ),
    p(
      'pg_d_beige_d',
      'Марка Г',
      'Камуфляж, тёмный беж',
      'Минеральный',
      ['undereye', 'scars', 'striae', 'vitiligo'],
      '#C9A184',
      [{ no: 'D-79', exp: m(12) }],
    ),
    p('pg_d_areola', 'Марка Г', 'Ареола, розово-бежевый', 'Органический', ['areola'], '#C98E82', [
      { no: 'D-81', exp: m(13) },
    ]),
    p('pg_d_scalp', 'Марка Г', 'Трихо, графит', 'Минеральный', ['scalp'], '#3E3A3A', [{ no: 'D-85', exp: m(20) }]),
    p('pg_r_saline', 'Ремувер', 'Солевой ремувер', 'Ремувер', ['brows', 'lips', 'lash'], '#EEEEEE', [
      { no: 'R-12', exp: m(8) },
    ]),
  ];
}

export function demoNeedles(createdAt: string): Entity<Needle>[] {
  const n = (id: string, name: string, note = '') => ({ id, createdAt, name, note, active: true });
  return [
    n('nd_1r18', '1R 0,18 мм', 'нано, волоски'),
    n('nd_1rl25', '1RL 0,25 мм'),
    n('nd_1rl30', '1RL 0,30 мм'),
    n('nd_1rlt25', '1RLT 0,25 мм', 'длинная заточка'),
    n('nd_3rl30', '3RL 0,30 мм'),
    n('nd_3rs35', '3RS 0,35 мм', 'растушёвка'),
    n('nd_5m1', '5M1 0,30 мм', 'магнум'),
  ];
}

export function demoAnesthetics(createdAt: string): Entity<Anesthetic>[] {
  const a = (id: string, name: string, stage: Anesthetic['stage'], substances: string[]) => ({
    id,
    createdAt,
    name,
    stage,
    substances,
    active: true,
  });
  return [
    a('an_lido5', 'Крем с лидокаином 5 %', 'primary', ['лидокаин']),
    a('an_lidopril', 'Крем лидокаин + прилокаин', 'primary', ['лидокаин', 'прилокаин']),
    a('an_benzo', 'Крем без лидокаина (бензокаин)', 'primary', ['бензокаин']),
    a('an_gel_lido', 'Вторичный гель с лидокаином', 'secondary', ['лидокаин']),
    a('an_gel_tetra', 'Вторичный гель (тетракаин)', 'secondary', ['тетракаин']),
  ];
}

/** Демо-покупки расходников за последний год. */
export function demoExpenses(T: string): Entity<Expense>[] {
  const rnd = mulberry32(7700);
  const ri = (a: number, b: number) => a + Math.floor(rnd() * (b - a + 1));
  const out: Entity<Expense>[] = [];
  const add = (daysAgo: number, category: string, name: string, amount: number) => {
    const date = addDays(T, -daysAgo);
    out.push({ id: `ex_${out.length + 1}`, createdAt: date, category, name, amount, date });
  };
  const pigments = [
    'Марка А · Тёплый шоколад',
    'Марка В · Нюд розовый',
    'Марка Б · Карамель',
    'Марка Г · Камуфляж, светлый беж',
  ];
  for (let m = 0; m < 12; m += 1) {
    const base = m * 30;
    add(base + ri(0, 9), 'Иглы', 'Картриджи 1RL 0,30 мм, 20 шт', ri(18, 26) * 100);
    add(base + ri(4, 20), 'Одноразовые материалы', 'Перчатки, салфетки, плёнка', ri(9, 16) * 100);
    if (m % 2 === 0) add(base + ri(3, 25), 'Анестезия', 'Крем лидокаин + прилокаин', ri(14, 22) * 100);
    if (m % 3 === 0) add(base + ri(2, 28), 'Пигменты', pigments[(m / 3) % pigments.length], ri(35, 60) * 100);
  }
  return out;
}

interface ClientOpts {
  fn: string;
  ln: string;
  mn?: string;
  phone: string;
  birth?: string;
  source?: string;
  tags?: string[];
  contact?: Client['contact'];
  pd?: string;
  pc?: string;
  hc?: string;
  health?: Health | null;
  docV?: number;
  notes?: string;
  created?: string;
}

interface ProcOpts {
  zone?: string;
  recipe?: number;
  photos?: PhotoStage[];
  pv?: number;
  an?: [string, string];
  tech?: string;
  healing?: HealingStatus;
  healingNote?: string;
  note?: string;
  price?: number;
  discount?: Discount;
  payment?: Payment;
  cert?: string;
  status?: Procedure['status'];
  model?: string;
}

type Recipe = { pig: [string, string][]; nd: string[]; an: [string, string] };

const RECIPE: Record<string, Recipe[]> = {
  brows: [
    { pig: [['pg_a_choc', '']], nd: ['nd_1rl30'], an: ['an_lidopril', 'an_gel_lido'] },
    { pig: [['pg_a_taupe', '']], nd: ['nd_3rs35'], an: ['an_lido5', 'an_gel_lido'] },
    {
      pig: [
        ['pg_b_caramel', '3 части'],
        ['pg_b_orange', '1 часть'],
      ],
      nd: ['nd_1rl30', 'nd_3rs35'],
      an: ['an_lidopril', 'an_gel_lido'],
    },
    { pig: [['pg_a_graphite', '']], nd: ['nd_1r18'], an: ['an_lido5', 'an_gel_tetra'] },
  ],
  lips: [
    { pig: [['pg_c_nude', '']], nd: ['nd_3rl30'], an: ['an_lidopril', 'an_gel_lido'] },
    { pig: [['pg_c_coral', '']], nd: ['nd_5m1'], an: ['an_lidopril', 'an_gel_lido'] },
    {
      pig: [
        ['pg_c_cherry', '2 части'],
        ['pg_c_nude', '1 часть'],
      ],
      nd: ['nd_3rl30'],
      an: ['an_lido5', 'an_gel_lido'],
    },
    {
      pig: [
        ['pg_c_nude', '2 части'],
        ['pg_c_warm', '1 часть'],
      ],
      nd: ['nd_3rl30'],
      an: ['an_lidopril', 'an_gel_tetra'],
    },
  ],
  lash: [
    { pig: [['pg_b_black', '']], nd: ['nd_1rl25'], an: ['an_lido5', 'an_gel_lido'] },
    { pig: [['pg_a_graphite', '']], nd: ['nd_1rlt25'], an: ['an_lido5', 'an_gel_tetra'] },
  ],
  undereye: [{ pig: [['pg_d_beige_l', '']], nd: ['nd_5m1'], an: ['an_lidopril', 'an_gel_lido'] }],
  scars: [
    {
      pig: [
        ['pg_d_beige_l', '2 части'],
        ['pg_d_beige_d', '1 часть'],
      ],
      nd: ['nd_3rs35'],
      an: ['an_lidopril', 'an_gel_lido'],
    },
  ],
  areola: [{ pig: [['pg_d_areola', '']], nd: ['nd_5m1'], an: ['an_lidopril', 'an_gel_lido'] }],
  striae: [{ pig: [['pg_d_beige_l', '']], nd: ['nd_3rs35'], an: ['an_lidopril', 'an_gel_lido'] }],
  scalp: [{ pig: [['pg_d_scalp', '']], nd: ['nd_1rl25'], an: ['an_lido5', ''] }],
  vitiligo: [{ pig: [['pg_d_beige_d', '']], nd: ['nd_3rs35'], an: ['an_lidopril', 'an_gel_lido'] }],
};

/** Демо-база на дату T. */
export function buildDemo(T: string): Data {
  const D = emptyData(T);
  D.services = demoServices(T);
  D.pigments = demoPigments(T);
  D.needles = demoNeedles(T);
  D.anesthetics = demoAnesthetics(T);
  const rnd = mulberry32(240924);
  const pick = <V>(arr: V[]): V => arr[Math.floor(rnd() * arr.length)];
  const ri = (a: number, b: number) => a + Math.floor(rnd() * (b - a + 1));
  const ago = (n: number) => addDays(T, -n);
  const bday = (offset: number, year: number) => `${year}-${addDays(T, offset).slice(5)}`.replace(/-02-29$/, '-02-28');
  const SVC = Object.fromEntries(D.services.map((s) => [s.id, s]));
  const PG = Object.fromEntries(D.pigments.map((p) => [p.id, p]));

  D.courses = [
    {
      id: 'co_camo',
      createdAt: ago(48),
      name: 'Камуфляж шрамов и рубцов · практика',
      start: ago(48),
      note: 'Отработка на моделях, группа из четырёх человек',
    },
    { id: 'co_brows', createdAt: ago(20), name: 'Пудровые брови · практика', start: ago(20), note: '' },
  ];

  const lotFor = (pgId: string, date: string) => {
    const lots = PG[pgId].lots;
    return lots.length > 1 && daysBetween(date, T) > 240 ? lots[1].no : lots[0].no;
  };

  const C: Record<string, Entity<Client>> = {};
  const addClient = (key: string, o: ClientOpts) => {
    const c: Entity<Client> = {
      id: `c_${key}`,
      createdAt: o.created || T,
      cardNo: 0,
      lastName: o.ln,
      firstName: o.fn,
      middleName: o.mn || '',
      phone: o.phone,
      contact: o.contact || { kind: 'phone', handle: '' },
      birth: o.birth || '',
      source: o.source || '',
      tags: o.tags || [],
      facePhoto: null,
      notes: o.notes || '',
      consents: {
        pd: { date: o.pd || '', photos: o.pd ? [demoRef(`demo:doc:doc:${o.docV || 0}`)] : [] },
        health: { date: o.hc || '' },
        procedure: { date: o.pc || '', photos: o.pc ? [demoRef(`demo:doc:doc:${(o.docV || 0) + 1}`)] : [] },
      },
      health: o.health || null,
      reminded: {},
    };
    D.clients.push(c);
    C[key] = c;
    return c;
  };
  const health = (daysAgo: number, extra: Partial<Health> = {}): Health => ({
    filledAt: ago(daysAgo),
    flags: extra.flags || {},
    allergies: extra.allergies || [],
    meds: extra.meds || '',
    other: extra.other || '',
  });

  let pn = 0;
  const addProc = (key: string, daysAgo: number, svcId: string, o: ProcOpts = {}) => {
    const c = C[key];
    const svc = SVC[svcId];
    const date = ago(daysAgo);
    const zone = o.zone || svc.zones[0];
    const recipes = RECIPE[zone];
    const r = recipes[Math.min(o.recipe || 0, recipes.length - 1)];
    const photos: Procedure['photos'] = { before: [], after: [], month: [] };
    // Фото «через месяц» — снимок, сделанный уже при коррекции, поэтому оно есть только у давних процедур
    for (const st of o.photos || []) photos[st].push(demoRef(`demo:${ZONE_PHOTO[zone]}:${st}:${o.pv || 0}`));
    const pig: [string, string][] = svc.type === 'removal' ? [['pg_r_saline', '']] : r.pig;
    const an = o.an || r.an;
    const prevSame = D.procedures.filter((q) => q.clientId === c.id && q.zone === zone && q.technique).pop();
    const zoneDef = D.zones.find((z) => z.id === zone)!;
    const fallbackTech =
      zone === 'brows' ? (o.recipe === 3 ? 'Волосковая' : 'Пудровое напыление') : zoneDef.techniques[0];
    pn += 1;
    const p: Entity<Procedure> = {
      id: `p_${key}_${pn - 1}`,
      createdAt: `${date}T12:${String(pn % 60).padStart(2, '0')}:00`,
      clientId: c.id,
      date,
      serviceId: svcId,
      type: svc.type,
      zone,
      technique: svc.type === 'removal' ? '' : o.tech || svc.technique || prevSame?.technique || fallbackTech,
      anesthesia: { primary: an[0] || '', secondary: an[1] || '' },
      pigments: pig.map(([id, ratio]) => ({ pigmentId: id, lot: lotFor(id, date), ratio })),
      needles: svc.type === 'removal' ? ['nd_3rl30'] : r.nd.slice(),
      photos,
      healing: { status: o.healing || '', note: o.healingNote || '' },
      note: o.note || '',
      price: o.price ?? svc.price,
      discount: o.discount || { mode: 'pct', value: 0, reason: '' },
      payment: o.payment || 'card',
      certificateId: o.cert || '',
      status: o.status || 'done',
      model: o.model ? { on: true, courseId: o.model } : { on: false, courseId: '' },
    };
    D.procedures.push(p);
    return p;
  };
  const pct = (value: number, reason: string): Discount => ({ mode: 'pct', value, reason });
  const rub = (value: number, reason: string): Discount => ({ mode: 'rub', value, reason });

  // ── Сценарные клиентки ──
  addClient('S1', {
    fn: 'Анна',
    ln: 'Смирнова',
    mn: 'Сергеевна',
    phone: '+79171044567',
    birth: '1991-03-14',
    source: 'ВК',
    contact: { kind: 'vk', handle: 'anna.smirnova' },
    pd: ago(35),
    pc: ago(35),
    health: health(35),
    created: ago(35),
  });
  addProc('S1', 35, 's_brows_powder', { recipe: 0, photos: ['before', 'after'], pv: 0 });

  addClient('S2', {
    fn: 'Екатерина',
    ln: 'Волкова',
    phone: '+79272318890',
    birth: bday(4, 1994),
    source: 'Рекомендация',
    contact: { kind: 'tg', handle: 'katya_volk' },
    pd: ago(21),
    pc: ago(21),
    hc: ago(21),
    health: health(21, { flags: { herpes: true } }),
    docV: 1,
  });
  addProc('S2', 21, 's_lips_aqua', {
    recipe: 3,
    photos: ['before', 'after'],
    pv: 1,
    discount: rub(500, 'Акция'),
    payment: 'transfer',
    note: 'За два дня до процедуры принимала противовирусное по назначению врача',
  });

  addClient('S3', {
    fn: 'Мария',
    ln: 'Кузнецова',
    phone: '+79063379012',
    birth: '1988-11-02',
    source: '2ГИС',
    contact: { kind: 'vk', handle: 'm.kuznetsova' },
    pd: ago(68),
    pc: ago(68),
    health: health(68),
  });
  const p3 = addProc('S3', 68, 's_brows_hair', { recipe: 3, photos: ['before', 'after'], pv: 2 });
  C.S3.reminded[`corr:${p3.id}`] = ago(5);

  addClient('S4', {
    fn: 'Ольга',
    ln: 'Попова',
    mn: 'Викторовна',
    phone: '+79179023311',
    birth: '1979-06-21',
    source: 'Рекомендация',
    tags: ['Постоянная'],
    contact: { kind: 'max', handle: 'olga.popova' },
    pd: ago(430),
    pc: ago(430),
    health: health(430),
  });
  addProc('S4', 430, 's_brows_powder', {
    recipe: 1,
    photos: ['before', 'after', 'month'],
    pv: 3,
    healing: 'uneven',
    healingNote: 'Левая бровь зажила светлее',
  });
  addProc('S4', 392, 's_brows_corr', {
    recipe: 1,
    photos: ['after'],
    pv: 3,
    healing: 'good',
    discount: pct(10, 'Постоянная клиентка'),
  });

  addClient('S5', {
    fn: 'Татьяна',
    ln: 'Лебедева',
    phone: '+79374410075',
    birth: '1985-01-30',
    source: 'ВК',
    contact: { kind: 'vk', handle: 'tanya.lebedeva' },
    pd: ago(560),
    pc: ago(560),
    health: health(560),
  });
  addProc('S5', 560, 's_lips_lipstick', { recipe: 1, photos: ['before', 'after', 'month'], pv: 1, healing: 'good' });
  addProc('S5', 522, 's_lips_corr', { recipe: 1 });

  addClient('S6', {
    fn: 'Наталья',
    ln: 'Козлова',
    phone: '+79603128844',
    birth: '1990-09-09',
    source: 'ВК',
    contact: { kind: 'vk', handle: 'natalia.k' },
    pd: ago(600),
    pc: ago(600),
    health: health(600),
  });
  addProc('S6', 600, 's_lash', { recipe: 0, photos: ['before', 'after'], pv: 0, healing: 'good' });
  addProc('S6', 562, 's_lash_corr', { recipe: 0 });

  addClient('S7', {
    fn: 'Юлия',
    ln: 'Новикова',
    phone: '+79272045566',
    birth: bday(12, 1996),
    source: 'ВК',
    contact: { kind: 'vk', handle: 'yulia.novikova' },
    pd: ago(100),
    pc: ago(100),
    health: health(100),
  });
  addProc('S7', 100, 's_brows_powder', {
    recipe: 2,
    photos: ['before', 'after', 'month'],
    pv: 1,
    discount: rub(500, 'Акция'),
    healing: 'good',
  });
  addProc('S7', 62, 's_brows_corr', { recipe: 2, photos: ['after'], pv: 1 });

  addClient('S8', {
    fn: 'Ирина',
    ln: 'Морозова',
    phone: '+79177770312',
    birth: '1983-04-17',
    source: 'Модель с обучения',
    tags: ['Модель'],
    contact: { kind: 'vk', handle: 'irina.moroz' },
    pd: ago(40),
    pc: ago(40),
    health: health(40),
  });
  addProc('S8', 40, 's_camo_scar', {
    photos: ['before', 'after'],
    pv: 1,
    model: 'co_camo',
    discount: pct(50, 'Модель'),
    note: 'Шрам на предплечье, 4 см. Работа на практике курса',
  });

  addClient('S9', {
    fn: 'Светлана',
    ln: 'Павлова',
    phone: '+79063012288',
    birth: '1993-07-07',
    source: '2ГИС',
    contact: { kind: 'vk', handle: 'sveta.pavlova' },
    created: ago(9),
    notes: 'Консультация: перекрытие старого татуажа бровей. Думает, перезвонит после отпуска.',
  });

  addClient('S10', {
    fn: 'Елена',
    ln: 'Соколова',
    mn: 'Андреевна',
    phone: '+79171239876',
    birth: '1982-12-05',
    source: 'Рекомендация',
    tags: ['VIP', 'Постоянная'],
    contact: { kind: 'max', handle: 'elena.sokolova' },
    pd: ago(800),
    pc: ago(800),
    hc: ago(150),
    health: health(150, { allergies: ['никель'] }),
    notes: 'Любит тёплые оттенки. Удобнее записывать на утро.',
  });
  addProc('S10', 800, 's_brows_powder', { recipe: 0, photos: ['before', 'after', 'month'], pv: 0, healing: 'good' });
  addProc('S10', 762, 's_brows_corr', { recipe: 0 });
  addProc('S10', 150, 's_lips_aqua', { recipe: 0, photos: ['before', 'after', 'month'], pv: 3, healing: 'good' });
  addProc('S10', 150, 's_lash', {
    recipe: 1,
    photos: ['before', 'after'],
    pv: 1,
    healing: 'good',
    discount: pct(10, 'Постоянная клиентка'),
  });
  addProc('S10', 112, 's_lips_corr', { recipe: 0, photos: ['after'], pv: 3 });
  addProc('S10', 112, 's_lash_corr', { recipe: 1, discount: pct(10, 'Постоянная клиентка') });
  addProc('S10', 90, 's_brows_upd', {
    recipe: 0,
    photos: ['before', 'after'],
    pv: 0,
    discount: pct(10, 'Постоянная клиентка'),
  });

  addClient('S11', {
    fn: 'Дарья',
    ln: 'Михайлова',
    phone: '+79530914455',
    birth: '1997-02-11',
    source: 'ВК',
    contact: { kind: 'vk', handle: 'dasha.mikh' },
    pd: ago(50),
    pc: ago(50),
    health: health(50),
  });
  addProc('S11', 50, 's_brows_powder', { recipe: 1, photos: ['before', 'after'], pv: 2 });
  addProc('S11', 5, 's_brows_corr', { recipe: 1, status: 'noshow', note: 'Не пришла и не предупредила' });

  addClient('S12', {
    fn: 'Алина',
    ln: 'Фёдорова',
    phone: '+79271190077',
    birth: bday(1, 1999),
    source: 'ВК',
    contact: { kind: 'vk', handle: 'alina.fedorova' },
    pd: ago(200),
    pc: ago(200),
    health: health(200),
  });
  addProc('S12', 200, 's_lips_lipstick', { recipe: 2, photos: ['before', 'after'], pv: 2, healing: 'good' });
  addProc('S12', 164, 's_lips_corr', { recipe: 2 });

  addClient('S13', {
    fn: 'Ксения',
    ln: 'Васильева',
    phone: '+79374456120',
    birth: '1987-08-19',
    source: '2ГИС',
    contact: { kind: 'tg', handle: 'ksenia_v' },
    pd: ago(130),
    pc: ago(130),
    health: health(130),
  });
  addProc('S13', 130, 's_removal', { zone: 'brows', note: 'Старый татуаж с синевой, первый сеанс' });
  addProc('S13', 72, 's_removal', { zone: 'brows', note: 'Второй сеанс' });
  addProc('S13', 12, 's_brows_cover', {
    recipe: 2,
    photos: ['before', 'after'],
    pv: 3,
    note: 'Перекрытие после удаления, корректор против синевы',
  });

  addClient('S14', {
    fn: 'Виктория',
    ln: 'Николаева',
    phone: '+79176663421',
    birth: '1995-05-23',
    source: 'Яндекс Карты',
    contact: { kind: 'tg', handle: 'vika_nik' },
    pd: ago(30),
    pc: ago(30),
    hc: ago(30),
    health: health(30, { allergies: ['лидокаин'] }),
  });
  addProc('S14', 30, 's_brows_powder', {
    recipe: 0,
    an: ['an_benzo', 'an_gel_tetra'],
    photos: ['before', 'after'],
    pv: 2,
    note: 'Аллергия на лидокаин: только бензокаин и тетракаин',
  });

  addClient('S15', {
    fn: 'Полина',
    ln: 'Алексеева',
    phone: '+79603349090',
    birth: '1980-10-28',
    source: 'Рекомендация',
    contact: { kind: 'max', handle: 'polina.a' },
    pd: ago(420),
    pc: ago(420),
    health: health(420),
  });
  addProc('S15', 420, 's_camo_areola', { photos: ['before', 'after'], pv: 0, healing: 'good' });
  addProc('S15', 380, 's_camo_repeat', { zone: 'areola' });

  addClient('S16', {
    fn: 'Дмитрий',
    ln: 'Орлов',
    phone: '+79272307711',
    birth: '1986-01-15',
    source: 'Рекомендация',
    contact: { kind: 'tg', handle: 'd_orlov' },
    pd: ago(75),
    pc: ago(75),
    health: health(75),
  });
  addProc('S16', 75, 's_camo_scalp', { photos: ['before', 'after'], pv: 0, healing: 'good', payment: 'transfer' });
  addProc('S16', 35, 's_camo_repeat', { zone: 'scalp', photos: ['after'], pv: 0, payment: 'transfer' });

  addClient('S17', {
    fn: 'Игорь',
    ln: 'Белов',
    phone: '+79063342200',
    birth: '1978-03-03',
    source: '2ГИС',
    pd: ago(300),
    pc: ago(300),
    health: health(300),
  });
  addProc('S17', 300, 's_camo_scar', {
    photos: ['before', 'after'],
    pv: 2,
    note: 'Шрам на подбородке, 3 см',
    healing: 'good',
  });
  addProc('S17', 256, 's_camo_repeat', { zone: 'scars', photos: ['after'], pv: 2 });

  addClient('S18', {
    fn: 'Людмила',
    ln: 'Григорьева',
    mn: 'Петровна',
    phone: '+79170904433',
    birth: '1968-06-30',
    source: 'Проходила мимо',
    pd: ago(1000),
    pc: ago(1000),
    health: health(1000),
  });
  addProc('S18', 1000, 's_brows_hair', { recipe: 3, payment: 'cash' });
  addProc('S18', 962, 's_brows_corr', { recipe: 3, payment: 'cash' });

  addClient('S19', {
    fn: 'Вероника',
    ln: 'Тарасова',
    phone: '+79271117766',
    birth: bday(25, 1992),
    source: 'ВК',
    contact: { kind: 'vk', handle: 'nika.tarasova' },
    pd: ago(820),
    pc: ago(820),
    health: health(820),
  });
  addProc('S19', 820, 's_lips_aqua', { recipe: 0 });
  addProc('S19', 781, 's_lips_corr', { recipe: 0 });

  addClient('S20', {
    fn: 'Марина',
    ln: 'Зайцева',
    phone: '+79377001199',
    birth: '1991-12-19',
    source: 'Другое',
    contact: { kind: 'max', handle: 'marina.z' },
    pd: ago(45),
    pc: ago(45),
    health: health(45),
  });
  const p20 = addProc('S20', 45, 's_brows_powder', {
    recipe: 1,
    payment: 'cert',
    cert: 'cert_2',
    photos: ['before', 'after'],
    pv: 1,
    note: 'Сертификат в подарок от мужа, доплата картой',
  });

  addClient('S21', {
    fn: 'Анастасия',
    ln: 'Белова',
    phone: '+79176541230',
    birth: '2000-04-04',
    source: 'Модель с обучения',
    tags: ['Модель'],
    contact: { kind: 'vk', handle: 'nastya.belova' },
    pd: ago(14),
    pc: ago(14),
    health: health(14),
  });
  addProc('S21', 14, 's_brows_powder', {
    recipe: 0,
    photos: ['before', 'after'],
    pv: 3,
    model: 'co_brows',
    discount: pct(70, 'Модель'),
  });

  addClient('S22', {
    fn: 'Валерия',
    ln: 'Комарова',
    phone: '+79603402299',
    birth: '1994-02-26',
    source: 'ВК',
    contact: { kind: 'vk', handle: 'lera.komarova' },
    pd: ago(18),
    hc: ago(18),
    health: health(18, { flags: { pregnancy: true } }),
    created: ago(18),
    notes: 'Хочет пудровые брови после окончания грудного вскармливания, примерно весной.',
  });

  addClient('S23', {
    fn: 'Кристина',
    ln: 'Медведева',
    phone: '+79279903344',
    birth: '1998-10-13',
    source: 'ВК',
    contact: { kind: 'vk', handle: 'kris.medvedeva' },
    pd: T,
    pc: T,
    health: health(0),
  });
  addProc('S23', 0, 's_lips_lipstick', { recipe: 1, photos: ['before'], pv: 2, payment: 'transfer' });

  addClient('S24', {
    fn: 'Галина',
    ln: 'Сорокина',
    phone: '+79063218800',
    birth: '1975-07-27',
    source: 'Рекомендация',
    tags: ['Постоянная'],
    pd: ago(40),
    pc: ago(40),
    health: health(40),
  });
  addProc('S24', 40, 's_brows_powder', {
    recipe: 1,
    photos: ['before', 'after', 'month'],
    pv: 2,
    healing: 'good',
    payment: 'cash',
  });
  addProc('S24', 0, 's_brows_corr', { recipe: 1, payment: 'cash' });

  addClient('S25', {
    fn: 'Евгения',
    ln: 'Андреева',
    phone: '+79172209988',
    birth: '1989-09-30',
    source: 'Яндекс Карты',
    contact: { kind: 'wa', handle: '' },
    pd: ago(20),
    pc: ago(20),
    health: health(20),
  });
  addProc('S25', 20, 's_camo_striae', { photos: ['before', 'after'], pv: 0 });

  addClient('S26', {
    fn: 'Олеся',
    ln: 'Никитина',
    phone: '+79370412345',
    birth: '1993-11-11',
    source: 'ВК',
    contact: { kind: 'vk', handle: 'olesya.nikitina' },
    pd: ago(150),
    pc: ago(150),
    health: health(150),
  });
  addProc('S26', 150, 's_camo_vitiligo', { photos: ['before', 'after'], pv: 3, healing: 'good' });
  addProc('S26', 105, 's_camo_repeat', { zone: 'vitiligo', photos: ['after'], pv: 3 });

  addClient('S27', {
    fn: 'Софья',
    ln: 'Егорова',
    phone: '+79276014477',
    birth: '1990-05-05',
    source: 'Яндекс Карты',
    contact: { kind: 'tg', handle: 'sofia_egorova' },
    pd: ago(60),
    pc: ago(60),
    health: health(60),
  });
  addProc('S27', 60, 's_camo_undereye', { photos: ['before', 'after'], pv: 1 });

  // ── Остальная база: обычные истории «первичная → коррекция → обновление» ──
  const FIRST = [
    'Алёна',
    'Вера',
    'Галина',
    'Диана',
    'Жанна',
    'Зарина',
    'Инна',
    'Карина',
    'Кира',
    'Лариса',
    'Лилия',
    'Любовь',
    'Маргарита',
    'Милана',
    'Надежда',
    'Нина',
    'Регина',
    'Римма',
    'Снежана',
    'Таисия',
    'Ульяна',
    'Эльвира',
    'Яна',
    'Альбина',
    'Ангелина',
    'Василиса',
    'Злата',
    'Елизавета',
    'Арина',
    'Полина',
    'Дарья',
    'Ольга',
    'Мария',
    'Анна',
    'Екатерина',
    'Ирина',
    'Юлия',
    'Татьяна',
    'Наталья',
    'Софья',
  ];
  const LAST = [
    'Абрамова',
    'Баранова',
    'Белоусова',
    'Виноградова',
    'Гусева',
    'Давыдова',
    'Ершова',
    'Жукова',
    'Зуева',
    'Ильина',
    'Калинина',
    'Киселёва',
    'Королёва',
    'Кудрявцева',
    'Лаптева',
    'Макарова',
    'Максимова',
    'Мельникова',
    'Назарова',
    'Осипова',
    'Панова',
    'Полякова',
    'Романова',
    'Савельева',
    'Сафонова',
    'Семёнова',
    'Степанова',
    'Титова',
    'Устинова',
    'Филиппова',
    'Фролова',
    'Хохлова',
    'Чернова',
    'Шарова',
    'Щербакова',
    'Яковлева',
    'Горбунова',
    'Тихонова',
    'Воробьёва',
    'Комиссарова',
  ];
  const PREF = ['917', '927', '937', '960', '906', '953', '902'];
  const SOURCES = ['ВК', 'ВК', 'ВК', 'MAX', '2ГИС', 'Яндекс Карты', 'Рекомендация', 'Рекомендация', 'Проходила мимо'];
  const KINDS: Client['contact']['kind'][] = ['vk', 'vk', 'vk', 'max', 'tg', 'wa', 'phone'];
  const PAY: Payment[] = ['card', 'card', 'card', 'transfer', 'transfer', 'cash'];
  const ZONEW = ['brows', 'brows', 'brows', 'brows', 'lips', 'lips', 'lips', 'lash', 'undereye', 'scars'];
  const HEAL: HealingStatus[] = ['good', 'good', 'good', 'uneven', 'faded', 'shade'];
  const used = new Set(D.clients.map((c) => c.phone));
  for (let i = 0; i < 40; i += 1) {
    const key = `F${i + 1}`;
    let phone: string;
    do {
      phone = `+79${pick(PREF).slice(1)}${String(ri(1000000, 9999999))}`;
    } while (used.has(phone));
    used.add(phone);
    const kind = pick(KINDS);
    const zones = uniq(rnd() < 0.3 ? [pick(ZONEW), pick(ZONEW)] : [pick(ZONEW)]);
    const primDays0 = ri(80, 720);
    addClient(key, {
      fn: FIRST[i],
      ln: LAST[(i * 7) % LAST.length],
      phone,
      birth: `${ri(1970, 2003)}-${String(ri(1, 12)).padStart(2, '0')}-${String(ri(1, 28)).padStart(2, '0')}`,
      source: pick(SOURCES),
      tags: rnd() < 0.18 ? ['Постоянная'] : [],
      contact: { kind, handle: kind === 'phone' || kind === 'wa' ? '' : `client${i + 101}` },
      pd: ago(primDays0),
      pc: ago(primDays0),
      health: health(primDays0),
    });
    zones.forEach((zone, zi) => {
      const primDays = zi === 0 ? primDays0 : Math.max(80, primDays0 - ri(0, 60));
      const recipes = RECIPE[zone];
      let recipe = ri(0, recipes.length - 1);
      let prim: string;
      if (zone === 'brows') prim = recipe === 3 ? 's_brows_hair' : 's_brows_powder';
      else if (zone === 'lips') prim = pick(['s_lips_lipstick', 's_lips_aqua']);
      else if (zone === 'lash') prim = 's_lash';
      else if (zone === 'undereye') {
        prim = 's_camo_undereye';
        recipe = 0;
      } else {
        prim = 's_camo_scar';
        recipe = 0;
      }
      const disc = rnd() < 0.12 ? pct(10, 'Постоянная клиентка') : rnd() < 0.1 ? rub(500, 'Акция') : undefined;
      addProc(key, primDays, prim, {
        recipe,
        discount: disc,
        payment: pick(PAY),
        healing: pick(HEAL),
        photos: rnd() < 0.35 ? ['before', 'after'] : [],
        pv: ri(0, 3),
      });
      const corrSvc =
        ({ brows: 's_brows_corr', lips: 's_lips_corr', lash: 's_lash_corr' } as Record<string, string>)[zone] ||
        's_camo_repeat';
      const corrDays = primDays - ri(32, 48);
      if (rnd() < 0.07) addProc(key, corrDays + 4, corrSvc, { recipe, zone, status: 'noshow' });
      addProc(key, corrDays, corrSvc, {
        recipe,
        zone,
        payment: pick(PAY),
        discount: rnd() < 0.1 ? pct(10, 'Повторная процедура') : undefined,
      });
      const updSvc = ({ brows: 's_brows_upd', lips: 's_lips_upd', lash: 's_lash_upd' } as Record<string, string>)[zone];
      if (updSvc && corrDays > 365 && rnd() < 0.85) {
        const updDays = corrDays - ri(365, 470);
        if (updDays >= 3)
          addProc(key, updDays, updSvc, {
            recipe,
            payment: pick(PAY),
            discount: rnd() < 0.4 ? pct(10, 'Постоянная клиентка') : undefined,
          });
      }
    });
  }

  // Сертификаты
  const cert = (
    id: string,
    no: string,
    amount: number,
    soldDays: number,
    buyer: string,
    recipient: string,
    payment: Certificate['payment'],
    extra: Partial<Certificate> = {},
  ): Entity<Certificate> => ({
    id,
    createdAt: ago(soldDays),
    no,
    amount,
    soldAt: ago(soldDays),
    validTo: addDays(ago(soldDays), 180),
    buyer,
    recipient,
    payment,
    note: '',
    usedProcId: '',
    usedAt: '',
    ...extra,
  });
  D.certificates = [
    cert('cert_1', 'С-001', 5000, 120, 'Андрей, подарок жене', '', 'card'),
    cert('cert_2', 'С-002', 5000, 80, 'Муж Марины Зайцевой', 'Марина Зайцева', 'transfer', {
      usedProcId: p20.id,
      usedAt: p20.date,
    }),
    cert('cert_3', 'С-003', 3000, 260, 'Коллеги, подарок на юбилей', '', 'cash'),
    cert('cert_4', 'С-004', 10000, 12, 'Ирина К.', 'Мама', 'card'),
    cert('cert_5', 'С-005', 7000, 30, 'Подруги Алины', 'Алина Фёдорова', 'transfer'),
  ];
  D.settings.nextCertNo = 6;
  D.expenses = demoExpenses(T);

  // Номера карт — по дате первого визита, начиная с № 1
  const firstDate = new Map<string, string>();
  for (const p of D.procedures) {
    const f = firstDate.get(p.clientId);
    if (!f || p.date < f) firstDate.set(p.clientId, p.date);
  }
  for (const c of D.clients) c.createdAt = firstDate.get(c.id) || c.createdAt;
  D.clients.sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0));
  D.clients.forEach((c, i) => {
    c.cardNo = i + 1;
  });
  D.settings.nextCardNo = D.clients.length + 1;
  D.settings.lastBackup = ago(34);
  return D;
}
