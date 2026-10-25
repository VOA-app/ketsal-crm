// Стартовые настройки, списки вариантов и зоны (SPEC §4.3). Услуги, пигменты, иглы,
// анестетики и курсы стартуют пустыми: мастер заполняет их в «Справочниках».
import type { Data, Entity, Lists, Settings, Zone } from './types';

export function defaultSettings(): Settings {
  return {
    corrFrom: 28,
    corrTo: 56,
    updFrom: 12,
    updTo: 18,
    lostAfter: 24,
    autoLockMinutes: 5,
    quickUnlock: 'faceid',
    theme: 'auto',
    nextCardNo: 1,
    nextCertNo: 1,
    lastBackup: '',
    backupReminderDays: 30,
    templates: {
      corr: '{имя}, здравствуйте. Это студия «Кетсаль». Прошёл месяц после процедуры ({зона}), самое время для коррекции. Подобрать вам удобное время?',
      upd: '{имя}, здравствуйте. Это студия «Кетсаль». С последней процедуры ({зона}) прошло больше года, пигмент постепенно светлеет. Можно освежить цвет. Подобрать удобное время?',
      bday: '{имя}, с днём рождения. Спасибо, что возвращаетесь к нам. Студия «Кетсаль».',
      lost: '{имя}, здравствуйте. Это студия «Кетсаль». Давно вас не видели. Как держится результат? Если захотите освежить, будем рады.',
      free: '{имя}, здравствуйте. ',
    },
    stripExif: true,
    keepTakenAt: false,
    photoMaxSide: 2560,
  };
}

export function defaultLists(): Lists {
  return {
    sources: ['ВК', 'MAX', '2ГИС', 'Яндекс Карты', 'Рекомендация', 'Проходила мимо', 'Модель с обучения', 'Другое'],
    tags: ['Постоянная', 'VIP', 'Модель', 'Сложный случай'],
    discountReasons: ['Постоянная клиентка', 'Повторная процедура', 'Модель', 'Акция', 'Другое'],
    expenseCategories: ['Иглы', 'Пигменты', 'Анестезия', 'Одноразовые материалы', 'Другое'],
  };
}

/** Зоны и техники. Идентификаторы фиксированные: на них ссылаются отметки анкеты (herpes → lips). */
export function defaultZones(createdAt: string): Entity<Zone>[] {
  const z = (id: string, name: string, group: Zone['group'], techniques: string[], update: boolean): Entity<Zone> => ({
    id,
    createdAt,
    name,
    group,
    techniques,
    update,
  });
  return [
    z('brows', 'Брови', 'pmu', ['Пудровое напыление', 'Волосковая', 'Комбинированная'], true),
    z('lips', 'Губы', 'pmu', ['Помадный эффект', 'Акварельный прокрас', 'Нейтрализация тёмных губ'], true),
    z('lash', 'Межресничка', 'pmu', ['Межресничка', 'Межресничка с растушёвкой'], true),
    z('undereye', 'Под глазами', 'camo', ['Камуфляж тёмных кругов'], false),
    z('scars', 'Шрамы и рубцы', 'camo', ['Камуфляж шрама'], false),
    z('areola', 'Ареолы', 'camo', ['Коррекция ареолы', 'Реконструкция ареолы'], true),
    z('striae', 'Стрии', 'camo', ['Камуфляж стрий'], false),
    z('scalp', 'Кожа головы', 'camo', ['Трихопигментация'], true),
    z('vitiligo', 'Витилиго и пятна', 'camo', ['Камуфляж пятен'], false),
  ];
}

export function emptyData(today: string): Data {
  return {
    clients: [],
    procedures: [],
    services: [],
    pigments: [],
    needles: [],
    anesthetics: [],
    zones: defaultZones(today),
    courses: [],
    certificates: [],
    expenses: [],
    settings: defaultSettings(),
    lists: defaultLists(),
  };
}
