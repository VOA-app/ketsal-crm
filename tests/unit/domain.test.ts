import { describe, expect, it } from 'vitest';
import { clientInfo } from '../../src/domain/client';
import { addMonths, ageOn, monthsBetween, nextBirthday } from '../../src/domain/dates';
import { discountAmount, parseMoney, totalOf } from '../../src/domain/money';
import { fmtPhone, normPhone, phoneQueryDigits } from '../../src/domain/phone';
import { defaultLot, newProcDraft, repeatDraft } from '../../src/domain/procedures';
import { recentlyReminded, urgentCount, viewItems, withReminded } from '../../src/domain/reminders';
import { monthlySeries, reportData } from '../../src/domain/reports';
import { findByPhone, searchClients } from '../../src/domain/search';
import { availableCerts, certStatus, relinkCertificates } from '../../src/domain/certificates';
import { fillTemplate } from '../../src/domain/templates';
import { hasDanger, procWarnings } from '../../src/domain/warnings';
import { buildDemo } from '../../src/dev/demo';
import { TODAY, ago, baseData, client, index, proc } from './fixtures';

describe('даты', () => {
  it('прибавляет месяцы с учётом коротких месяцев', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2024-01-31', 1)).toBe('2024-02-29');
    expect(addMonths('2026-03-15', -3)).toBe('2025-12-15');
  });
  it('считает полные месяцы и возраст', () => {
    expect(monthsBetween('2026-01-31', '2026-02-28')).toBe(0);
    expect(monthsBetween('2025-10-25', '2026-10-25')).toBe(12);
    expect(ageOn('1991-10-26', TODAY)).toBe(34);
    expect(ageOn('1991-10-25', TODAY)).toBe(35);
  });
  it('29 февраля празднуется 28-го в невисокосный год', () => {
    expect(nextBirthday('2000-02-29', '2026-01-10')).toBe('2026-02-28');
    expect(nextBirthday('2000-02-29', '2027-12-01')).toBe('2028-02-29');
    expect(nextBirthday('1990-10-25', TODAY)).toBe(TODAY);
    expect(nextBirthday('1990-10-24', TODAY)).toBe('2027-10-24');
  });
});

describe('деньги', () => {
  it('скидка в процентах округляется и не больше 100 %', () => {
    expect(discountAmount(7000, { mode: 'pct', value: 10, reason: '' })).toBe(700);
    expect(discountAmount(3333, { mode: 'pct', value: 15, reason: '' })).toBe(500);
    expect(discountAmount(5000, { mode: 'pct', value: 150, reason: '' })).toBe(5000);
  });
  it('скидка в рублях не больше цены', () => {
    expect(discountAmount(3000, { mode: 'rub', value: 500, reason: '' })).toBe(500);
    expect(discountAmount(3000, { mode: 'rub', value: 5000, reason: '' })).toBe(3000);
  });
  it('итог процедуры = цена − скидка', () => {
    expect(totalOf({ price: 7500, discount: { mode: 'rub', value: 500, reason: '' } })).toBe(7000);
    expect(totalOf({ price: 7000, discount: { mode: 'pct', value: 70, reason: '' } })).toBe(2100);
  });
  it('разбирает сумму из поля ввода', () => {
    expect(parseMoney('7 500 ₽')).toBe(7500);
    expect(parseMoney('')).toBe(0);
  });
});

describe('телефоны и поиск', () => {
  it('нормализует разные записи номера', () => {
    expect(normPhone('8 917 104-45-67')).toBe('+79171044567');
    expect(normPhone('+7(917)1044567')).toBe('+79171044567');
    expect(normPhone('9171044567')).toBe('+79171044567');
    expect(fmtPhone('+79171044567')).toBe('+7 917 104-45-67');
    expect(phoneQueryDigits('8917')).toBe('7917');
  });
  it('ищет по фрагменту телефона, номеру карты и словам', () => {
    const D = baseData();
    const a = client(D, { lastName: 'Смирнова', firstName: 'Анна', phone: '+79171044567' });
    const b = client(D, {
      lastName: 'Фёдорова',
      firstName: 'Алина',
      phone: '+79271190077',
      contact: { kind: 'vk', handle: 'alina.f' },
    });
    const idx = index(D);
    expect(searchClients(idx, '45-67').map((x) => x.c.id)).toEqual([a.id]);
    expect(searchClients(idx, '8 917 104').map((x) => x.c.id)).toEqual([a.id]);
    expect(searchClients(idx, String(b.cardNo))[0].c.id).toBe(b.id);
    expect(searchClients(idx, String(b.cardNo))[0].byCard).toBe(true);
    expect(searchClients(idx, 'федорова').map((x) => x.c.id)).toEqual([b.id]);
    expect(searchClients(idx, 'alina.f').map((x) => x.c.id)).toEqual([b.id]);
    expect(searchClients(idx, 'анна смир').map((x) => x.c.id)).toEqual([a.id]);
    expect(searchClients(idx, '12')).toEqual([]);
    expect(findByPhone(idx, '8 (917) 104-45-67')?.id).toBe(a.id);
    expect(findByPhone(idx, '8 (917) 104-45-67', a.id)).toBeNull();
  });
});

describe('напоминания о коррекции', () => {
  const corrState = (daysAgo: number) => {
    const D = baseData();
    const c = client(D);
    proc(D, c, daysAgo);
    return clientInfo(index(D), c).corr.map((x) => x.state);
  };
  it('скоро / пора / просрочена / перестаёт', () => {
    expect(corrState(20)).toEqual([]);
    expect(corrState(21)).toEqual(['soon']);
    expect(corrState(27)).toEqual(['soon']);
    expect(corrState(28)).toEqual(['now']);
    expect(corrState(56)).toEqual(['now']);
    expect(corrState(57)).toEqual(['late']);
    expect(corrState(116)).toEqual(['late']);
    expect(corrState(117)).toEqual([]);
  });
  it('коррекция или обновление после первичной снимают напоминание', () => {
    const D = baseData();
    const c = client(D);
    proc(D, c, 40);
    proc(D, c, 5, { serviceId: 's_brows_corr' });
    expect(clientInfo(index(D), c).corr).toEqual([]);
  });
  it('неявка на коррекцию не снимает напоминание', () => {
    const D = baseData();
    const c = client(D);
    proc(D, c, 40);
    proc(D, c, 5, { serviceId: 's_brows_corr', status: 'noshow' });
    expect(clientInfo(index(D), c).corr).toHaveLength(1);
  });
  it('после удаления в зоне не напоминает', () => {
    const D = baseData();
    const c = client(D);
    proc(D, c, 40);
    proc(D, c, 10, { serviceId: 's_removal', zone: 'brows' });
    const inf = clientInfo(index(D), c);
    expect(inf.corr).toEqual([]);
    expect(inf.upd).toEqual([]);
  });
  it('значок считает только открытые окна без отметки «напомнили»', () => {
    const D = baseData();
    const a = client(D);
    proc(D, a, 30);
    const b = client(D);
    const pb = proc(D, b, 60);
    const s = client(D);
    proc(D, s, 22);
    expect(urgentCount(index(D))).toBe(2);
    b.reminded = withReminded(b, `corr:${pb.id}`, ago(3));
    expect(recentlyReminded(b, `corr:${pb.id}`, TODAY)).toBe(true);
    expect(urgentCount(index(D))).toBe(1);
    // отметка старше 14 дней не действует
    b.reminded = withReminded(b, `corr:${pb.id}`, ago(14));
    expect(urgentCount(index(D))).toBe(2);
  });
  it('напомненные уходят вниз списка коррекций', () => {
    const D = baseData();
    const a = client(D);
    const pa = proc(D, a, 60);
    const b = client(D);
    proc(D, b, 30);
    a.reminded = withReminded(a, `corr:${pa.id}`, ago(1));
    expect(viewItems(index(D), 'corr').map((x) => x.c.id)).toEqual([b.id, a.id]);
  });
});

describe('напоминания об обновлении', () => {
  it('только для зон с обновлением, с 12 до 24 месяцев', () => {
    const D = baseData();
    const c = client(D);
    proc(D, c, 420, { serviceId: 's_brows_powder' });
    proc(D, c, 390, { serviceId: 's_brows_corr' });
    proc(D, c, 420, { serviceId: 's_camo_scar' });
    proc(D, c, 390, { serviceId: 's_camo_repeat', zone: 'scars' });
    const upd = clientInfo(index(D), c).upd;
    expect(upd.map((x) => x.zone)).toEqual(['brows']);
    expect(upd[0].state).toBe('now');
  });
  it('после 18 месяцев — просрочено, после 24 — «давно не были»', () => {
    const D = baseData();
    const a = client(D);
    proc(D, a, 600);
    proc(D, a, 570, { serviceId: 's_brows_corr' });
    const b = client(D);
    proc(D, b, 800);
    proc(D, b, 770, { serviceId: 's_brows_corr' });
    const idx = index(D);
    expect(clientInfo(idx, a).upd[0].state).toBe('late');
    expect(clientInfo(idx, a).lost).toBe(false);
    expect(clientInfo(idx, b).upd).toEqual([]);
    expect(clientInfo(idx, b).lost).toBe(true);
    expect(viewItems(idx, 'lost').map((x) => x.c.id)).toEqual([b.id]);
  });
  it('обновление не показывается, пока ждёт коррекция', () => {
    const D = baseData();
    const c = client(D);
    proc(D, c, 400);
    proc(D, c, 360, { serviceId: 's_brows_corr' });
    proc(D, c, 30, { serviceId: 's_brows_cover' });
    const inf = clientInfo(index(D), c);
    expect(inf.corr).toHaveLength(1);
    expect(inf.upd).toEqual([]);
  });
});

describe('дни рождения и виды списка', () => {
  it('именинники в ближайшие 30 дней по порядку', () => {
    const D = baseData();
    const a = client(D, { birth: '1990-11-20' });
    const b = client(D, { birth: '1995-10-28' });
    client(D, { birth: '1995-12-28' });
    const items = viewItems(index(D), 'bday');
    expect(items.map((x) => x.c.id)).toEqual([b.id, a.id]);
    expect(items[0].inf.bday?.age).toBe(31);
  });
  it('модели и «без согласия»', () => {
    const D = baseData();
    const m = client(D, { tags: ['Модель'] });
    const m2 = client(D);
    proc(D, m2, 100, { model: { on: true, courseId: '' } });
    const nc = client(D, {
      consents: { pd: { date: '', photos: [] }, procedure: { date: '', photos: [] }, health: { date: '' } },
    });
    const nh = client(D, {
      health: { filledAt: ago(5), flags: { diabetes: true }, allergies: [], meds: '', other: '' },
      consents: { pd: { date: ago(5), photos: [] }, procedure: { date: ago(5), photos: [] }, health: { date: '' } },
    });
    const idx = index(D);
    expect(
      viewItems(idx, 'models')
        .map((x) => x.c.id)
        .sort(),
    ).toEqual([m.id, m2.id].sort());
    expect(
      viewItems(idx, 'noconsent')
        .map((x) => x.c.id)
        .sort(),
    ).toEqual([nc.id, nh.id].sort());
  });
  it('сводка: визиты, траты, скидки', () => {
    const D = baseData();
    const c = client(D);
    proc(D, c, 100, { price: 7000, discount: { mode: 'pct', value: 10, reason: 'Акция' } });
    proc(D, c, 60, { serviceId: 's_brows_corr', price: 3000 });
    proc(D, c, 30, { serviceId: 's_brows_corr', status: 'cancel' });
    const inf = clientInfo(index(D), c);
    expect(inf.visits).toBe(2);
    expect(inf.spent).toBe(9300);
    expect(inf.discounts).toBe(700);
    expect(inf.first?.date).toBe(ago(100));
    expect(inf.last?.date).toBe(ago(60));
  });
});

describe('предупреждения в форме процедуры', () => {
  const codes = (w: { code: string }[]) => w.map((x) => x.code);
  it('аллергия на действующее вещество анестезии — важное', () => {
    const D = baseData();
    const c = client(D, { health: { filledAt: ago(10), flags: {}, allergies: ['лидокаин'], meds: '', other: '' } });
    const d = { ...newProcDraft(c.id, TODAY), zone: 'brows', anesthesia: { primary: 'an_lidopril', secondary: '' } };
    const w = procWarnings(index(D), d);
    expect(codes(w)).toContain('allergyHit');
    expect(hasDanger(w)).toBe(true);
    const safe = procWarnings(index(D), { ...d, anesthesia: { primary: 'an_benzo', secondary: '' } });
    expect(codes(safe)).toEqual(['allergyInfo']);
    expect(hasDanger(safe)).toBe(false);
  });
  it('герпес важен только для губ', () => {
    const D = baseData();
    const c = client(D, {
      health: { filledAt: ago(10), flags: { herpes: true, diabetes: true }, allergies: [], meds: 'аспирин', other: '' },
    });
    const lips = procWarnings(index(D), { ...newProcDraft(c.id, TODAY), zone: 'lips' });
    expect(codes(lips)).toEqual(['zoneFlag', 'healthFlags', 'meds']);
    const brows = procWarnings(index(D), { ...newProcDraft(c.id, TODAY), zone: 'brows' });
    expect(codes(brows)).toEqual(['healthFlags', 'meds']);
  });
  it('есть данные о здоровье, но нет согласия на них', () => {
    const D = baseData();
    const c = client(D, {
      health: { filledAt: ago(10), flags: {}, allergies: ['никель'], meds: '', other: '' },
      consents: { pd: { date: ago(10), photos: [] }, procedure: { date: ago(10), photos: [] }, health: { date: '' } },
    });
    expect(codes(procWarnings(index(D), newProcDraft(c.id, TODAY)))).toEqual(['allergyInfo', 'noHealthConsent']);
  });
  it('анкета не заполнена или старше 12 месяцев', () => {
    const D = baseData();
    const a = client(D, { health: null });
    const b = client(D, { health: { filledAt: ago(400), flags: {}, allergies: [], meds: '', other: '' } });
    const idx = index(D);
    expect(codes(procWarnings(idx, newProcDraft(a.id, TODAY)))).toEqual(['healthMissing']);
    const old = procWarnings(idx, newProcDraft(b.id, TODAY));
    expect(old[0]).toMatchObject({ code: 'healthOld', months: 13 });
  });
  it('нет согласий', () => {
    const D = baseData();
    const c = client(D, {
      consents: { pd: { date: '', photos: [] }, procedure: { date: '', photos: [] }, health: { date: '' } },
    });
    expect(codes(procWarnings(index(D), newProcDraft(c.id, TODAY)))).toEqual(['noProcConsent', 'noPdConsent']);
  });
  it('просроченная партия и реакция на пигмент', () => {
    const D = baseData();
    const c = client(D);
    proc(D, c, 200, {
      pigments: [{ pigmentId: 'pg_a_taupe', lot: 'A-2405', ratio: '' }],
      healing: { status: 'reaction', note: '' },
    });
    const d = {
      ...newProcDraft(c.id, TODAY),
      zone: 'brows',
      pigments: [
        { pigmentId: 'pg_a_choc', lot: 'A-2311', ratio: '' },
        { pigmentId: 'pg_a_taupe', lot: 'A-2405', ratio: '' },
      ],
    };
    const w = procWarnings(index(D), d);
    expect(w).toEqual([
      expect.objectContaining({ code: 'lotExpired', pigmentId: 'pg_a_choc', lot: 'A-2311' }),
      expect.objectContaining({ code: 'pigmentReaction', pigmentId: 'pg_a_taupe', procDate: ago(200) }),
    ]);
  });
});

describe('«Повторить как в прошлый раз»', () => {
  it('ждёт коррекция → коррекция, партия — действующая', () => {
    const D = baseData();
    const c = client(D);
    const base = proc(D, c, 35, {
      anesthesia: { primary: 'an_lidopril', secondary: 'an_gel_lido' },
      needles: ['nd_1rl30'],
      pigments: [{ pigmentId: 'pg_a_choc', lot: 'A-2311', ratio: '3 части' }],
    });
    const d = repeatDraft(index(D), c.id, 'brows', TODAY);
    expect(d.type).toBe('correction');
    expect(d.serviceId).toBe('s_brows_corr');
    expect(d.price).toBe(3000);
    expect(d.technique).toBe('Пудровое напыление');
    expect(d.anesthesia).toEqual({ primary: 'an_lidopril', secondary: 'an_gel_lido' });
    expect(d.needles).toEqual(['nd_1rl30']);
    expect(d.pigments).toEqual([{ pigmentId: 'pg_a_choc', lot: 'A-2407', ratio: '3 части' }]);
    expect(d.repeatedFrom).toBe(base.id);
    expect(d.prevHealing).toEqual({ procId: base.id, status: '', note: '' });
  });
  it('коррекция уже была → обновление', () => {
    const D = baseData();
    const c = client(D);
    proc(D, c, 400);
    proc(D, c, 360, { serviceId: 's_brows_corr' });
    const d = repeatDraft(index(D), c.id, 'brows', TODAY);
    expect(d.type).toBe('update');
    expect(d.serviceId).toBe('s_brows_upd');
    expect(d.prevHealing).toBeNull();
  });
  it('нет процедур в зоне → пустой черновик с зоной', () => {
    const D = baseData();
    const c = client(D);
    const d = repeatDraft(index(D), c.id, 'lips', TODAY);
    expect(d.zone).toBe('lips');
    expect(d.serviceId).toBe('');
  });
  it('действующая партия: первая с неистёкшим сроком', () => {
    const idx = index(baseData());
    expect(defaultLot(idx, 'pg_a_choc', TODAY)).toBe('A-2407');
    expect(defaultLot(idx, 'pg_b_caramel', TODAY)).toBe('B-118');
    expect(defaultLot(idx, 'unknown', TODAY)).toBe('');
  });
});

describe('сертификаты', () => {
  it('статусы и доступные для оплаты', () => {
    const D = baseData();
    const mk = (id: string, validTo: string, usedProcId = '') => ({
      id,
      createdAt: ago(10),
      no: id,
      amount: 5000,
      soldAt: ago(10),
      validTo,
      buyer: '',
      recipient: '',
      payment: 'card' as const,
      note: '',
      usedProcId,
      usedAt: '',
    });
    D.certificates = [mk('a', ago(-30)), mk('b', ago(1)), mk('c', ago(-30), 'p1')];
    expect(D.certificates.map((x) => certStatus(x, TODAY))).toEqual(['active', 'expired', 'used']);
    const idx = index(D);
    expect(availableCerts(idx, { certificateId: '', date: TODAY }).map((x) => x.id)).toEqual(['a']);
    expect(availableCerts(idx, { certificateId: 'c', date: TODAY }).map((x) => x.id)).toEqual(['a', 'c']);
  });
  it('используется при оплате и освобождается при смене оплаты или удалении', () => {
    const D = baseData();
    const c = client(D);
    const cert = {
      id: 'k',
      createdAt: ago(10),
      no: 'С-001',
      amount: 5000,
      soldAt: ago(10),
      validTo: ago(-100),
      buyer: '',
      recipient: '',
      payment: 'card' as const,
      note: '',
      usedProcId: '',
      usedAt: '',
    };
    const p = proc(D, c, 0, { payment: 'cert', certificateId: 'k' });
    let certs = relinkCertificates([cert], p, p.id);
    expect(certs[0]).toMatchObject({ usedProcId: p.id, usedAt: TODAY });
    certs = relinkCertificates(certs, { ...p, payment: 'card' }, p.id);
    expect(certs[0]).toMatchObject({ usedProcId: '', usedAt: '' });
    certs = relinkCertificates(relinkCertificates(certs, p, p.id), null, p.id);
    expect(certs[0].usedProcId).toBe('');
    certs = relinkCertificates([cert], { ...p, status: 'noshow' }, p.id);
    expect(certs[0].usedProcId).toBe('');
  });
});

describe('отчёты', () => {
  it('за месяц: выручка, средний чек, неявки, новые клиенты, расходники', () => {
    const D = baseData();
    const a = client(D, { source: 'ВК' });
    proc(D, a, 5, { price: 7000, discount: { mode: 'pct', value: 10, reason: 'Акция' } }); // 2026-10-20
    proc(D, a, 2, { serviceId: 's_lips_corr', status: 'noshow' });
    const b = client(D, { source: 'Рекомендация' });
    proc(D, b, 100); // июль — старая клиентка
    proc(D, b, 10, { serviceId: 's_brows_corr', payment: 'cash' });
    proc(D, b, 40); // сентябрь
    D.expenses = [{ id: 'e1', createdAt: TODAY, category: 'Иглы', name: '', amount: 2000, date: ago(3) }];
    const r = reportData(index(D), 'month', TODAY);
    expect([r.a, r.b]).toEqual(['2026-10-01', '2026-10-31']);
    expect(r.count).toBe(2);
    expect(r.revenue).toBe(6300 + 3000);
    expect(r.avg).toBe(4650);
    expect(r.discounts).toBe(700);
    expect(r.noshow).toBe(1);
    expect(r.newClients).toBe(1);
    expect(r.bySource).toEqual([{ key: 'ВК', count: 1, value: 0 }]);
    expect(r.byReason).toEqual([{ key: 'Акция', count: 1, value: 700 }]);
    expect(r.byPayment.map((g) => g.key)).toEqual(['card', 'cash']);
    expect(r.expenses).toBe(2000);
  });
  it('за год и по месяцам', () => {
    const D = baseData();
    const a = client(D);
    proc(D, a, 5, { price: 7000 });
    proc(D, a, 300, { price: 5000 }); // 2025-12-29 — прошлый год
    proc(D, a, 200, { serviceId: 's_brows_corr', price: 3000 }); // 2026-04-08
    const r = reportData(index(D), 'year', TODAY);
    expect([r.a, r.b]).toEqual(['2026-01-01', '2026-12-31']);
    expect(r.revenue).toBe(10000);
    const series = monthlySeries(index(D), TODAY);
    expect(series).toHaveLength(12);
    expect(series[11]).toMatchObject({ ym: '2026-10', revenue: 7000, count: 1 });
    expect(series[5]).toMatchObject({ ym: '2026-04', revenue: 3000 });
    expect(series[1]).toMatchObject({ ym: '2025-12', revenue: 5000 });
  });
});

describe('шаблоны и демо-набор', () => {
  it('подставляет имя, зону, дату и дни', () => {
    const D = baseData();
    const c = client(D, { firstName: 'Анна' });
    const text = fillTemplate('{имя}: {зона}, {дата}, {дней}', c, {
      zoneName: 'Брови',
      proc: { date: ago(30) },
      today: TODAY,
      fmtDate: (iso) => `[${iso}]`,
      noZone: 'процедура',
    });
    expect(text).toBe(`Анна: брови, [${ago(30)}], 30`);
  });
  it('демо-набор строится и даёт сценарии напоминаний', () => {
    const idx = index(buildDemo(TODAY));
    expect(idx.data.clients).toHaveLength(67);
    expect(idx.data.clients.map((c) => c.cardNo)).toEqual(idx.data.clients.map((_, i) => i + 1));
    const s1 = idx.client.get('c_S1')!;
    expect(clientInfo(idx, s1).corr[0].state).toBe('now');
    expect(viewItems(idx, 'bday').some((x) => x.c.id === 'c_S12')).toBe(true);
    expect(urgentCount(idx)).toBeGreaterThan(0);
  });
});
