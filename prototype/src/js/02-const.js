// Справочные константы и стартовые справочники (прайс, пигменты, иглы, анестезия, зоны).
// Названия марок и цены — заглушки: мастер заменит их своими в разделе «Справочники».

const VISIT_TYPES = [
  { id: 'primary', label: 'Первичная' },
  { id: 'correction', label: 'Коррекция' },
  { id: 'update', label: 'Обновление' },
  { id: 'cover', label: 'Перекрытие' },
  { id: 'removal', label: 'Удаление ремувером' },
];
const TYPE_LABEL = Object.fromEntries(VISIT_TYPES.map((t) => [t.id, t.label]));

const PAYMENTS = [
  { id: 'card', label: 'Карта' },
  { id: 'cash', label: 'Наличные' },
  { id: 'transfer', label: 'Перевод' },
  { id: 'cert', label: 'Сертификат' },
];
const PAYMENT_LABEL = Object.fromEntries(PAYMENTS.map((t) => [t.id, t.label]));

const STATUSES = [
  { id: 'done', label: 'Состоялась' },
  { id: 'noshow', label: 'Не пришла' },
  { id: 'cancel', label: 'Отменила' },
];
const STATUS_LABEL = Object.fromEntries(STATUSES.map((t) => [t.id, t.label]));

const HEALING = [
  { id: 'good', label: 'Зажило хорошо' },
  { id: 'uneven', label: 'Неравномерно' },
  { id: 'faded', label: 'Пигмент сильно ушёл' },
  { id: 'shade', label: 'Сменился оттенок' },
  { id: 'slow', label: 'Долго заживало' },
  { id: 'reaction', label: 'Реакция на пигмент' },
];
const HEALING_LABEL = Object.fromEntries(HEALING.map((t) => [t.id, t.label]));

const HEALTH_FLAGS = [
  { id: 'pregnancy', label: 'Беременность или грудное вскармливание' },
  { id: 'diabetes', label: 'Сахарный диабет' },
  { id: 'herpes', label: 'Герпес на губах', zones: ['lips'] },
  { id: 'bloodthin', label: 'Препараты, разжижающие кровь' },
  { id: 'clotting', label: 'Нарушение свёртываемости крови' },
  { id: 'retinoids', label: 'Ретиноиды или изотретиноин за последний год' },
  { id: 'keloid', label: 'Склонность к келоидным рубцам' },
  { id: 'skin', label: 'Кожные заболевания в зоне процедуры' },
  { id: 'autoimmune', label: 'Аутоиммунные заболевания' },
  { id: 'epilepsy', label: 'Эпилепсия' },
  { id: 'oncology', label: 'Онкологические заболевания' },
  { id: 'infection', label: 'Инфекционные заболевания' },
];
const ALLERGY_SUGGEST = ['лидокаин', 'прилокаин', 'бензокаин', 'тетракаин', 'латекс', 'никель'];

const PIGMENT_KINDS = ['Органический', 'Минеральный', 'Гибридный', 'Корректор', 'Ремувер'];
const ZONE_GROUPS = [
  { id: 'pmu', label: 'Перманент' },
  { id: 'camo', label: 'Камуфляж' },
  { id: 'other', label: 'Другое' },
];
const CONTACT_KINDS = [
  { id: 'vk', label: 'ВК' },
  { id: 'max', label: 'MAX' },
  { id: 'tg', label: 'Телеграм' },
  { id: 'wa', label: 'WhatsApp' },
  { id: 'phone', label: 'Только звонок' },
];
const CONTACT_LABEL = Object.fromEntries(CONTACT_KINDS.map((t) => [t.id, t.label]));

const CLIENT_VIEWS = [
  { id: 'all', label: 'Все' },
  { id: 'corr', label: 'Коррекция' },
  { id: 'upd', label: 'Обновление' },
  { id: 'bday', label: 'Именинники' },
  { id: 'models', label: 'Модели' },
  { id: 'lost', label: 'Давно не были' },
  { id: 'noconsent', label: 'Без согласия' },
];

const PHOTO_STAGES = [
  { id: 'before', label: 'До' },
  { id: 'after', label: 'Сразу после' },
  { id: 'month', label: 'Через месяц' },
];
const STAGE_LABEL = Object.fromEntries(PHOTO_STAGES.map((t) => [t.id, t.label]));

const TEMPLATE_DEFS = [
  { id: 'corr', label: 'Коррекция' },
  { id: 'upd', label: 'Обновление' },
  { id: 'bday', label: 'День рождения' },
  { id: 'lost', label: 'Давно не были' },
  { id: 'free', label: 'Свой текст' },
];

function defaultSettings() {
  return {
    corrFrom: 28,
    corrTo: 56,
    updFrom: 12,
    updTo: 18,
    lostAfter: 24,
    autoLock: 5,
    quickUnlock: 'faceid',
    theme: 'auto',
    nextCardNo: 1,
    nextCertNo: 1,
    lastBackup: null,
    backupEvery: 30,
    onboarded: true,
    templates: {
      corr: '{имя}, здравствуйте. Это студия «Кетсаль». Прошёл месяц после процедуры ({зона}), самое время для коррекции. Подобрать вам удобное время?',
      upd: '{имя}, здравствуйте. Это студия «Кетсаль». С последней процедуры ({зона}) прошло больше года, пигмент постепенно светлеет. Можно освежить цвет. Подобрать удобное время?',
      bday: '{имя}, с днём рождения. Спасибо, что возвращаетесь к нам. Студия «Кетсаль».',
      lost: '{имя}, здравствуйте. Это студия «Кетсаль». Давно вас не видели. Как держится результат? Если захотите освежить, будем рады.',
      free: '{имя}, здравствуйте. ',
    },
  };
}

function defaultLists() {
  return {
    sources: ['ВК', 'MAX', '2ГИС', 'Яндекс Карты', 'Рекомендация', 'Проходила мимо', 'Модель с обучения', 'Другое'],
    tags: ['Постоянная', 'VIP', 'Модель', 'Сложный случай'],
    discountReasons: ['Постоянная клиентка', 'Повторная процедура', 'Модель', 'Акция', 'Другое'],
    expenseCategories: ['Иглы', 'Пигменты', 'Анестезия', 'Одноразовые материалы', 'Другое'],
  };
}

const DEFAULT_ZONES = [
  { id: 'brows', name: 'Брови', group: 'pmu', techniques: ['Пудровое напыление', 'Волосковая', 'Комбинированная'], update: true, photo: 'brows' },
  { id: 'lips', name: 'Губы', group: 'pmu', techniques: ['Помадный эффект', 'Акварельный прокрас', 'Нейтрализация тёмных губ'], update: true, photo: 'lips' },
  { id: 'lash', name: 'Межресничка', group: 'pmu', techniques: ['Межресничка', 'Межресничка с растушёвкой'], update: true, photo: 'lash' },
  { id: 'undereye', name: 'Под глазами', group: 'camo', techniques: ['Камуфляж тёмных кругов'], update: false, photo: 'camo' },
  { id: 'scars', name: 'Шрамы и рубцы', group: 'camo', techniques: ['Камуфляж шрама'], update: false, photo: 'camo' },
  { id: 'areola', name: 'Ареолы', group: 'camo', techniques: ['Коррекция ареолы', 'Реконструкция ареолы'], update: true, photo: 'areola' },
  { id: 'striae', name: 'Стрии', group: 'camo', techniques: ['Камуфляж стрий'], update: false, photo: 'camo' },
  { id: 'scalp', name: 'Кожа головы', group: 'camo', techniques: ['Трихопигментация'], update: true, photo: 'scalp' },
  { id: 'vitiligo', name: 'Витилиго и пятна', group: 'camo', techniques: ['Камуфляж пятен'], update: false, photo: 'camo' },
];
const CAMO_ZONES = ['undereye', 'scars', 'areola', 'striae', 'scalp', 'vitiligo'];

function defaultServices() {
  const s = (id, name, zones, type, price, duration, technique = '') => ({ id, name, zones, type, price, duration, technique, active: true });
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

function defaultPigments(T) {
  const p = (id, brand, name, kind, zones, hex, lots) => ({ id, brand, name, kind, zones, hex, lots, active: true });
  const m = (n) => addMonths(T, n);
  return [
    p('pg_a_choc', 'Марка А', 'Тёплый шоколад', 'Органический', ['brows'], '#6B4A3A', [{ no: 'A-2407', exp: m(16) }, { no: 'A-2311', exp: m(-1) }]),
    p('pg_a_taupe', 'Марка А', 'Холодный тауп', 'Органический', ['brows'], '#6E6259', [{ no: 'A-2405', exp: m(12) }, { no: 'A-2302', exp: m(-7) }]),
    p('pg_a_graphite', 'Марка А', 'Графит', 'Органический', ['brows', 'lash'], '#4A4543', [{ no: 'A-2402', exp: m(8) }]),
    p('pg_b_caramel', 'Марка Б', 'Карамель', 'Гибридный', ['brows'], '#9A6B4B', [{ no: 'B-118', exp: m(20) }, { no: 'B-097', exp: m(2) }]),
    p('pg_b_ash', 'Марка Б', 'Пепельный блонд', 'Гибридный', ['brows'], '#8C7E72', [{ no: 'B-121', exp: m(18) }]),
    p('pg_b_orange', 'Марка Б', 'Корректор оранжевый', 'Корректор', ['brows'], '#D0803C', [{ no: 'B-090', exp: m(10) }]),
    p('pg_b_black', 'Марка Б', 'Чёрный', 'Минеральный', ['lash'], '#1F1B1B', [{ no: 'B-131', exp: m(22) }, { no: 'B-102', exp: m(1) }]),
    p('pg_c_nude', 'Марка В', 'Нюд розовый', 'Органический', ['lips'], '#C98B85', [{ no: 'C-5521', exp: m(14) }, { no: 'C-5402', exp: m(-3) }]),
    p('pg_c_coral', 'Марка В', 'Коралл', 'Органический', ['lips'], '#D46A5E', [{ no: 'C-5530', exp: m(15) }]),
    p('pg_c_cherry', 'Марка В', 'Вишня', 'Органический', ['lips'], '#A33A45', [{ no: 'C-5512', exp: m(9) }]),
    p('pg_c_warm', 'Марка В', 'Корректор тёплый', 'Корректор', ['lips'], '#D9895B', [{ no: 'C-5490', exp: m(6) }]),
    p('pg_d_beige_l', 'Марка Г', 'Камуфляж, светлый беж', 'Минеральный', ['undereye', 'scars', 'striae', 'vitiligo'], '#E3C3A8', [{ no: 'D-77', exp: m(12) }]),
    p('pg_d_beige_d', 'Марка Г', 'Камуфляж, тёмный беж', 'Минеральный', ['undereye', 'scars', 'striae', 'vitiligo'], '#C9A184', [{ no: 'D-79', exp: m(12) }]),
    p('pg_d_areola', 'Марка Г', 'Ареола, розово-бежевый', 'Органический', ['areola'], '#C98E82', [{ no: 'D-81', exp: m(13) }]),
    p('pg_d_scalp', 'Марка Г', 'Трихо, графит', 'Минеральный', ['scalp'], '#3E3A3A', [{ no: 'D-85', exp: m(20) }]),
    p('pg_r_saline', 'Ремувер', 'Солевой ремувер', 'Ремувер', ['brows', 'lips', 'lash'], '#EEEEEE', [{ no: 'R-12', exp: m(8) }]),
  ];
}

function defaultNeedles() {
  const n = (id, name, note = '') => ({ id, name, note, active: true });
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

function defaultAnesthetics() {
  const a = (id, name, stage, substances) => ({ id, name, stage, substances, active: true });
  return [
    a('an_lido5', 'Крем с лидокаином 5 %', 'primary', ['лидокаин']),
    a('an_lidopril', 'Крем лидокаин + прилокаин', 'primary', ['лидокаин', 'прилокаин']),
    a('an_benzo', 'Крем без лидокаина (бензокаин)', 'primary', ['бензокаин']),
    a('an_gel_lido', 'Вторичный гель с лидокаином', 'secondary', ['лидокаин']),
    a('an_gel_tetra', 'Вторичный гель (тетракаин)', 'secondary', ['тетракаин']),
  ];
}
