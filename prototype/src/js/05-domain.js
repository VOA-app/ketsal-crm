// Предметная логика: индексы, сводка по клиентке, напоминания о коррекции и обновлении,
// поиск, предупреждения при записи процедуры, отчёты.

let IDX = null;

const isAfter = (a, b) => a.date > b.date || (a.date === b.date && (a.createdAt || '') > (b.createdAt || ''));
const byDateDesc = (a, b) => (isAfter(a, b) ? -1 : isAfter(b, a) ? 1 : 0);

function reindex() {
  IDX = {
    client: new Map(S.clients.map((x) => [x.id, x])),
    proc: new Map(S.procedures.map((x) => [x.id, x])),
    service: new Map(S.services.map((x) => [x.id, x])),
    pigment: new Map(S.pigments.map((x) => [x.id, x])),
    needle: new Map(S.needles.map((x) => [x.id, x])),
    anest: new Map(S.anesthetics.map((x) => [x.id, x])),
    zone: new Map(S.zones.map((x) => [x.id, x])),
    course: new Map(S.courses.map((x) => [x.id, x])),
    cert: new Map(S.certificates.map((x) => [x.id, x])),
    byClient: new Map(),
    info: new Map(),
    views: new Map(),
    today: todayISO(),
  };
  for (const p of S.procedures) {
    let arr = IDX.byClient.get(p.clientId);
    if (!arr) { arr = []; IDX.byClient.set(p.clientId, arr); }
    arr.push(p);
  }
  for (const arr of IDX.byClient.values()) arr.sort(byDateDesc);
}

const procsOf = (clientId) => IDX.byClient.get(clientId) || [];
const zoneName = (id) => (IDX.zone.get(id) ? IDX.zone.get(id).name : '—');
const serviceName = (id) => (IDX.service.get(id) ? IDX.service.get(id).name : 'Услуга удалена');
const pigmentLabel = (id) => (IDX.pigment.get(id) ? IDX.pigment.get(id).name : 'Пигмент удалён');
const pigmentFull = (id) => (IDX.pigment.get(id) ? `${IDX.pigment.get(id).brand} · ${IDX.pigment.get(id).name}` : 'Пигмент удалён');
const needleName = (id) => (IDX.needle.get(id) ? IDX.needle.get(id).name : '—');
const anestName = (id) => (IDX.anest.get(id) ? IDX.anest.get(id).name : '—');
const courseName = (id) => (IDX.course.get(id) ? IDX.course.get(id).name : 'Курс не указан');
const fullName = (c) => [c.firstName, c.lastName].filter(Boolean).join(' ');
const formalName = (c) => [c.lastName, c.firstName, c.middleName].filter(Boolean).join(' ');
const initials = (c) => `${(c.firstName || '')[0] || ''}${(c.lastName || '')[0] || ''}`.toUpperCase() || '·';

function discountAmount(price, d) {
  if (!d || !d.value) return 0;
  const v = Number(d.value) || 0;
  return d.mode === 'pct' ? Math.round((price * clamp(v, 0, 100)) / 100) : clamp(v, 0, price);
}
const totalOf = (p) => Math.max(0, (Number(p.price) || 0) - discountAmount(Number(p.price) || 0, p.discount));
function discountText(p) {
  if (!p.discount || !p.discount.value) return '';
  return p.discount.mode === 'pct' ? `${p.discount.value}${NBSP}%` : fmtMoney(p.discount.value);
}

function hasHealthData(c) {
  const h = c.health;
  if (!h) return false;
  return Object.values(h.flags || {}).some(Boolean) || (h.allergies || []).length > 0 || !!(h.meds || '').trim() || !!(h.other || '').trim();
}
function healthMarks(c) {
  const h = c.health;
  if (!h) return [];
  const out = HEALTH_FLAGS.filter((f) => h.flags && h.flags[f.id]).map((f) => f.label);
  if ((h.allergies || []).length) out.push(`Аллергия: ${h.allergies.join(', ')}`);
  if ((h.meds || '').trim()) out.push(`Принимает: ${h.meds.trim()}`);
  if ((h.other || '').trim()) out.push(h.other.trim());
  return out;
}

function defaultLot(pigmentId, onDate = todayISO()) {
  const p = IDX.pigment.get(pigmentId);
  if (!p || !p.lots.length) return '';
  const valid = p.lots.find((l) => !l.exp || l.exp >= onDate);
  return (valid || p.lots[0]).no;
}
const lotInfo = (pigmentId, no) => (IDX.pigment.get(pigmentId) ? IDX.pigment.get(pigmentId).lots.find((l) => l.no === no) || null : null);

function nextBirthday(birth, T) {
  const b = parseISO(birth);
  const t = parseISO(T);
  const mk = (y) => {
    const d = new Date(y, b.getMonth(), b.getDate());
    if (d.getMonth() !== b.getMonth()) d.setDate(0);
    return d;
  };
  let n = mk(t.getFullYear());
  if (n < t) n = mk(t.getFullYear() + 1);
  return toISO(n);
}

// Сводка по клиентке: визиты, траты, напоминания
function clientInfo(c) {
  const cached = IDX.info.get(c.id);
  if (cached) return cached;
  const T = IDX.today;
  const st = S.settings;
  const procs = procsOf(c.id);
  const done = procs.filter((p) => p.status === 'done');
  const last = done[0] || null;
  const first = done.length ? done[done.length - 1] : null;
  const zones = uniq(done.map((p) => p.zone));
  const corr = [];
  const upd = [];
  for (const z of zones) {
    const inZone = done.filter((p) => p.zone === z);
    const latest = inZone[0];
    if (latest.type === 'removal') continue;
    const lastPrimary = inZone.find((p) => p.type === 'primary' || p.type === 'cover');
    if (lastPrimary) {
      const satisfied = inZone.some((p) => (p.type === 'correction' || p.type === 'update') && isAfter(p, lastPrimary));
      if (!satisfied) {
        const days = daysBetween(lastPrimary.date, T);
        if (days < st.corrFrom - 7) continue;
        if (days <= st.corrTo + 60) {
          corr.push({
            kind: 'corr', zone: z, proc: lastPrimary, days,
            state: days < st.corrFrom ? 'soon' : days <= st.corrTo ? 'now' : 'late',
            winFrom: addDays(lastPrimary.date, st.corrFrom), winTo: addDays(lastPrimary.date, st.corrTo),
            key: `corr:${lastPrimary.id}`,
          });
          continue;
        }
      }
    }
    const zd = IDX.zone.get(z);
    if (!zd || !zd.update) continue;
    const months = monthsBetween(latest.date, T);
    if (months >= st.updFrom && months < st.lostAfter) {
      upd.push({ kind: 'upd', zone: z, proc: latest, months, state: months < st.updTo ? 'now' : 'late', key: `upd:${latest.id}` });
    }
  }
  let bday = null;
  if (isISO(c.birth)) {
    const next = nextBirthday(c.birth, T);
    bday = { date: next, inDays: daysBetween(T, next), age: ageOn(c.birth, next), key: `bday:${next}` };
  }
  const inf = {
    procs, done, last, first, zones, corr, upd, bday,
    spent: sum(done, totalOf),
    discounts: sum(done, (p) => discountAmount(p.price, p.discount)),
    visits: done.length,
    lost: !!last && monthsBetween(last.date, T) >= st.lostAfter,
    isModel: (c.tags || []).includes('Модель') || done.some((p) => p.model && p.model.on),
    consentMissing: !(c.consents && c.consents.pd && c.consents.pd.date),
    healthConsentMissing: hasHealthData(c) && !(c.consents && c.consents.health && c.consents.health.date),
    procConsentMissing: !(c.consents && c.consents.procedure && c.consents.procedure.date),
    healthMissing: !(c.health && c.health.filledAt),
  };
  IDX.info.set(c.id, inf);
  return inf;
}

const remindedAt = (c, key) => (c.reminded && c.reminded[key]) || '';
const recentlyReminded = (c, key) => {
  const d = remindedAt(c, key);
  return !!d && daysBetween(d, IDX.today) < 14;
};
function markReminded(c, key) {
  if (!key) return;
  c.reminded = c.reminded || {};
  c.reminded[key] = todayISO();
}

function sortClientItems(items, mode) {
  const coll = new Intl.Collator('ru');
  if (mode === 'card') items.sort((a, b) => b.c.cardNo - a.c.cardNo);
  else if (mode === 'recent') {
    const k = (x) => (x.inf.last ? x.inf.last.date : x.c.createdAt);
    items.sort((a, b) => (k(a) < k(b) ? 1 : k(a) > k(b) ? -1 : 0));
  } else items.sort((a, b) => coll.compare(`${a.c.lastName} ${a.c.firstName}`, `${b.c.lastName} ${b.c.firstName}`));
  return items;
}

function viewItems(view) {
  if (IDX.views.has(view)) return IDX.views.get(view);
  const out = [];
  for (const c of S.clients) {
    const inf = clientInfo(c);
    if (view === 'all') out.push({ c, inf });
    else if (view === 'corr') inf.corr.forEach((it) => out.push({ c, inf, it }));
    else if (view === 'upd') inf.upd.forEach((it) => out.push({ c, inf, it }));
    else if (view === 'bday') { if (inf.bday && inf.bday.inDays <= 30) out.push({ c, inf, it: { kind: 'bday', key: inf.bday.key } }); }
    else if (view === 'models') { if (inf.isModel) out.push({ c, inf }); }
    else if (view === 'lost') { if (inf.lost) out.push({ c, inf, it: { kind: 'lost', key: `lost:${inf.last.id}` } }); }
    else if (view === 'noconsent') { if (inf.consentMissing || inf.healthConsentMissing) out.push({ c, inf }); }
  }
  const rr = (x) => (recentlyReminded(x.c, x.it.key) ? 1 : 0);
  if (view === 'corr') {
    const rank = { late: 0, now: 1, soon: 2 };
    out.sort((a, b) => rr(a) - rr(b) || rank[a.it.state] - rank[b.it.state] || b.it.days - a.it.days);
  } else if (view === 'upd') out.sort((a, b) => rr(a) - rr(b) || b.it.months - a.it.months);
  else if (view === 'bday') out.sort((a, b) => a.inf.bday.inDays - b.inf.bday.inDays);
  else if (view === 'lost') out.sort((a, b) => (a.inf.last.date < b.inf.last.date ? 1 : -1));
  else sortClientItems(out, UI.clientSort);
  IDX.views.set(view, out);
  return out;
}

// Значок на вкладке: коррекции, у которых окно уже открыто, и о них ещё не напомнили
function urgentCount() {
  return viewItems('corr').filter((x) => x.it.state !== 'soon' && !recentlyReminded(x.c, x.it.key)).length;
}

function searchClients(q) {
  const raw = String(q || '').trim();
  if (!raw) return [];
  const res = [];
  if (/^[\d\s()+\-№.]+$/.test(raw)) {
    const card = raw.replace(/[^\d]/g, '');
    const digits = phoneQueryDigits(raw);
    for (const c of S.clients) {
      const byCard = String(c.cardNo) === card;
      const byPhone = digits.length >= 3 && String(c.phone).replace(/\D/g, '').includes(digits);
      if (byCard || byPhone) res.push({ c, inf: clientInfo(c), byCard });
    }
    res.sort((a, b) => (b.byCard ? 1 : 0) - (a.byCard ? 1 : 0) || a.c.cardNo - b.c.cardNo);
    return res;
  }
  const words = norm(raw).split(/\s+/).filter(Boolean);
  for (const c of S.clients) {
    const hay = norm(`${c.lastName} ${c.firstName} ${c.middleName} ${(c.contact && c.contact.handle) || ''}`);
    if (words.every((w) => hay.includes(w))) res.push({ c, inf: clientInfo(c) });
  }
  return sortClientItems(res, 'name');
}

const findByPhone = (phone, exceptId) => {
  const p = normPhone(phone);
  if (!p || p.length < 12) return null;
  return S.clients.find((c) => c.phone === p && c.id !== exceptId) || null;
};

// ── Процедуры: черновики формы ──
function newProcDraft(clientId, date = todayISO()) {
  return {
    id: null, clientId, date, serviceId: '', type: 'primary', zone: '', technique: '',
    anesthesia: { primary: '', secondary: '' }, pigments: [], needles: [],
    photos: { before: [], after: [], month: [] }, healing: { status: '', note: '' },
    prevHealing: null, note: '', price: 0, discount: { mode: 'pct', value: 0, reason: '' },
    payment: 'card', certificateId: '', status: 'done', model: { on: false, courseId: '' },
  };
}
const lastInZone = (clientId, zone, exceptId) => procsOf(clientId).find((p) => p.status === 'done' && p.zone === zone && p.type !== 'removal' && p.id !== exceptId) || null;
const findService = (zone, type) => S.services.find((s) => s.active && s.type === type && s.zones.includes(zone)) || null;

function healingTarget(d) {
  if (d.type !== 'correction' || !d.zone) return null;
  return procsOf(d.clientId).find((p) => p.status === 'done' && p.zone === d.zone && p.id !== d.id && (p.type === 'primary' || p.type === 'cover') && p.date <= d.date) || null;
}
function syncPrevHealing(d) {
  const t = healingTarget(d);
  if (!t) { d.prevHealing = null; return; }
  if (!d.prevHealing || d.prevHealing.procId !== t.id) {
    d.prevHealing = { procId: t.id, status: (t.healing && t.healing.status) || '', note: (t.healing && t.healing.note) || '' };
  }
}

// «Повторить как в прошлый раз»: материалы из последней процедуры в зоне, партии — актуальные
function repeatDraft(clientId, zone, baseId) {
  const base = baseId ? IDX.proc.get(baseId) : lastInZone(clientId, zone);
  const d = newProcDraft(clientId);
  if (!base) { d.zone = zone || ''; return d; }
  const c = IDX.client.get(clientId);
  const inf = clientInfo(c);
  d.zone = base.zone;
  d.technique = base.technique || '';
  d.anesthesia = { ...base.anesthesia };
  d.needles = base.needles.slice();
  d.pigments = base.pigments.map((pg) => ({ pigmentId: pg.pigmentId, lot: defaultLot(pg.pigmentId) || pg.lot, ratio: pg.ratio || '' }));
  const pendingCorr = inf.corr.find((x) => x.zone === base.zone);
  d.type = base.type === 'removal' ? 'removal' : pendingCorr ? 'correction' : 'update';
  const svc = (d.type === 'removal' && IDX.service.get(base.serviceId)) || findService(d.zone, d.type);
  if (svc) { d.serviceId = svc.id; d.price = svc.price; }
  d.repeatedFrom = base.id;
  syncPrevHealing(d);
  return d;
}

function draftFromProc(p) {
  const d = deepClone(p);
  d.photos = d.photos || { before: [], after: [], month: [] };
  d.healing = d.healing || { status: '', note: '' };
  d.model = d.model || { on: false, courseId: '' };
  d.prevHealing = null;
  syncPrevHealing(d);
  return d;
}

function procWarnings(d) {
  const c = IDX.client.get(d.clientId);
  if (!c) return [];
  const w = [];
  const h = c.health;
  const when = d.date || IDX.today;
  if (!h || !h.filledAt) w.push({ level: 'warn', text: 'Анкета здоровья не заполнена', act: 'open-health', btn: 'Заполнить' });
  else {
    const m = monthsBetween(h.filledAt, when);
    if (m >= 12) w.push({ level: 'info', text: `Анкета заполнена ${pl(m, 'месяц', 'месяца', 'месяцев')} назад, уточните изменения`, act: 'open-health', btn: 'Обновить' });
    const subs = [d.anesthesia.primary, d.anesthesia.secondary].filter(Boolean).flatMap((id) => (IDX.anest.get(id) ? IDX.anest.get(id).substances : []));
    const allergies = (h.allergies || []).map(norm).filter(Boolean);
    const hits = allergies.filter((a) => subs.some((s) => norm(s).includes(a) || a.includes(norm(s))));
    if (hits.length) w.push({ level: 'danger', text: `Аллергия на ${hits.join(', ')}. Выбранная анестезия содержит это вещество` });
    else if (allergies.length) w.push({ level: 'warn', text: `Аллергия по анкете: ${allergies.join(', ')}` });
    const flags = HEALTH_FLAGS.filter((f) => h.flags && h.flags[f.id]);
    flags.filter((f) => f.zones && f.zones.includes(d.zone)).forEach((f) => w.push({ level: 'danger', text: `В анкете: ${lc(f.label)}. Учтите перед процедурой в этой зоне` }));
    const general = flags.filter((f) => !f.zones);
    if (general.length) w.push({ level: 'warn', text: `В анкете отмечено: ${general.map((f) => lc(f.label)).join('; ')}` });
    if ((h.meds || '').trim()) w.push({ level: 'info', text: `Принимает: ${h.meds.trim()}` });
  }
  if (!c.consents || !c.consents.procedure || !c.consents.procedure.date) w.push({ level: 'warn', text: 'Нет согласия на процедуру', act: 'open-consents', btn: 'Добавить' });
  if (!c.consents || !c.consents.pd || !c.consents.pd.date) w.push({ level: 'warn', text: 'Нет согласия на обработку персональных данных', act: 'open-consents', btn: 'Добавить' });
  else if (hasHealthData(c) && !(c.consents.health && c.consents.health.date)) w.push({ level: 'warn', text: 'Нет согласия на обработку данных о здоровье', act: 'open-consents', btn: 'Добавить' });
  for (const pg of d.pigments) {
    if (!pg.pigmentId) continue;
    const lot = lotInfo(pg.pigmentId, pg.lot);
    if (lot && lot.exp && lot.exp < when) w.push({ level: 'danger', text: `Партия ${pg.lot} (${pigmentLabel(pg.pigmentId)}) просрочена: годна до ${fmtMonthNum(lot.exp)}` });
    const reaction = procsOf(c.id).find((p) => p.id !== d.id && p.healing && p.healing.status === 'reaction' && p.pigments.some((x) => x.pigmentId === pg.pigmentId));
    if (reaction) w.push({ level: 'danger', text: `Была реакция на пигмент «${pigmentLabel(pg.pigmentId)}» после процедуры ${fmtDate(reaction.date)}` });
  }
  return w;
}

// ── Сертификаты ──
function certStatus(cert) {
  if (cert.usedProcId) return 'used';
  if (cert.validTo && cert.validTo < IDX.today) return 'expired';
  return 'active';
}
const CERT_STATUS_LABEL = { active: 'Действует', used: 'Использован', expired: 'Срок истёк' };
function availableCerts(d) {
  return S.certificates.filter((x) => x.id === d.certificateId || (!x.usedProcId && (!x.validTo || x.validTo >= (d.date || IDX.today))));
}

// ── Отчёты ──
function periodRange(mode, cursor) {
  if (mode === 'year') {
    const y = cursor.slice(0, 4);
    return [`${y}-01-01`, `${y}-12-31`];
  }
  return [startOfMonth(cursor), endOfMonth(cursor)];
}
const periodLabel = (mode, cursor) => (mode === 'year' ? `${cursor.slice(0, 4)} год` : fmtMonthYear(cursor));

function groupBy(arr, keyFn, valFn) {
  const m = new Map();
  for (const x of arr) {
    for (const k of [].concat(keyFn(x))) {
      if (!k) continue;
      const g = m.get(k) || { key: k, count: 0, value: 0 };
      g.count += 1;
      g.value += valFn ? valFn(x) : 0;
      m.set(k, g);
    }
  }
  return Array.from(m.values());
}

function reportData(mode, cursor) {
  const [a, b] = periodRange(mode, cursor);
  const inR = (d) => d >= a && d <= b;
  const ps = S.procedures.filter((p) => inR(p.date));
  const done = ps.filter((p) => p.status === 'done');
  const revenue = sum(done, totalOf);
  const disc = (p) => discountAmount(p.price, p.discount);
  const newClients = S.clients.filter((c) => {
    const f = clientInfo(c).first;
    return f && inR(f.date);
  });
  const certsSold = S.certificates.filter((c) => inR(c.soldAt));
  const exps = (S.expenses || []).filter((e) => inR(e.date));
  return {
    expenses: sum(exps, (e) => e.amount),
    byExpense: groupBy(exps, (e) => e.category || 'Другое', (e) => e.amount).sort((x, y) => y.value - x.value),
    a, b,
    count: done.length,
    revenue,
    avg: done.length ? Math.round(revenue / done.length) : 0,
    discounts: sum(done, disc),
    noshow: ps.filter((p) => p.status !== 'done').length,
    newClients: newClients.length,
    byService: groupBy(done, (p) => p.serviceId, totalOf).sort((x, y) => y.value - x.value),
    byZone: groupBy(done, (p) => p.zone, totalOf).sort((x, y) => y.count - x.count),
    byType: groupBy(done, (p) => p.type, totalOf).sort((x, y) => y.count - x.count),
    byPigment: groupBy(done, (p) => uniq(p.pigments.map((g) => g.pigmentId))).sort((x, y) => y.count - x.count),
    byReason: groupBy(done.filter((p) => disc(p) > 0), (p) => p.discount.reason || 'Без причины', disc).sort((x, y) => y.value - x.value),
    bySource: groupBy(newClients, (c) => c.source || 'Не указано').sort((x, y) => y.count - x.count),
    byCourse: groupBy(done.filter((p) => p.model && p.model.on), (p) => p.model.courseId || 'none', disc).sort((x, y) => y.count - x.count),
    byPayment: groupBy(done, (p) => p.payment, totalOf).sort((x, y) => y.value - x.value),
    certsSold: certsSold.length,
    certsSum: sum(certsSold, (c) => c.amount),
  };
}

function monthlySeries(endISO, n = 12) {
  const out = [];
  for (let i = n - 1; i >= 0; i -= 1) {
    const m = addMonths(startOfMonth(endISO), -i);
    const ym = m.slice(0, 7);
    const done = S.procedures.filter((p) => p.status === 'done' && p.date.startsWith(ym));
    const expenses = sum((S.expenses || []).filter((e) => e.date.startsWith(ym)), (e) => e.amount);
    out.push({ ym, iso: m, label: MONTHS_AXIS[parseISO(m).getMonth()], year: m.slice(0, 4), revenue: sum(done, totalOf), count: done.length, expenses });
  }
  return out;
}

// ── Шаблоны сообщений ──
function fillTemplate(tpl, c, it) {
  const zoneTxt = it && it.zone ? lc(zoneName(it.zone)) : 'процедура';
  const days = it && it.proc ? daysBetween(it.proc.date, IDX.today) : '';
  return String(tpl || '')
    .replace(/\{имя\}/g, c.firstName || '')
    .replace(/\{зона\}/g, zoneTxt)
    .replace(/\{дата\}/g, it && it.proc ? fmtDate(it.proc.date, true) : '')
    .replace(/\{дней\}/g, String(days));
}
