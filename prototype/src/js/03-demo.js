// Демо-данные: выдуманные клиентки и истории процедур. Даты считаются от сегодняшнего дня,
// чтобы напоминания о коррекции и обновлении срабатывали при любом запуске.
// Фото — нарисованные схемы (SVG), реальных лиц в заглушке нет.

function emptyState() {
  const T = todayISO();
  return {
    version: 1,
    settings: defaultSettings(),
    clients: [],
    procedures: [],
    services: defaultServices(),
    pigments: defaultPigments(T),
    needles: defaultNeedles(),
    anesthetics: defaultAnesthetics(),
    zones: deepClone(DEFAULT_ZONES),
    courses: [],
    certificates: [],
    expenses: [],
    lists: defaultLists(),
    meta: { createdAt: T, demo: false },
  };
}

// Демо-покупки расходников за последний год
function demoExpenses(T) {
  const rnd = mulberry32(7700);
  const ri = (a, b) => a + Math.floor(rnd() * (b - a + 1));
  const out = [];
  const add = (daysAgo, category, name, amount) => out.push({ id: `ex_${out.length + 1}`, category, name, amount, date: addDays(T, -daysAgo) });
  const pigments = ['Марка А · Тёплый шоколад', 'Марка В · Нюд розовый', 'Марка Б · Карамель', 'Марка Г · Камуфляж, светлый беж'];
  for (let m = 0; m < 12; m += 1) {
    const base = m * 30;
    add(base + ri(0, 9), 'Иглы', 'Картриджи 1RL 0,30 мм, 20 шт', ri(18, 26) * 100);
    add(base + ri(4, 20), 'Одноразовые материалы', 'Перчатки, салфетки, плёнка', ri(9, 16) * 100);
    if (m % 2 === 0) add(base + ri(3, 25), 'Анестезия', 'Крем лидокаин + прилокаин', ri(14, 22) * 100);
    if (m % 3 === 0) add(base + ri(2, 28), 'Пигменты', pigments[(m / 3) % pigments.length], ri(35, 60) * 100);
  }
  return out;
}

// ── Демо-фото ──
const demoPhotoCache = new Map();
function demoPhoto(id) {
  if (demoPhotoCache.has(id)) return demoPhotoCache.get(id);
  const [, kind, stage, v] = id.split(':');
  const uri = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(demoPhotoSVG(kind, stage, Number(v) || 0))}`;
  demoPhotoCache.set(id, uri);
  return uri;
}

function qPoint(p0, p1, p2, t) {
  const u = 1 - t;
  return [u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0], u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1]];
}

function demoPhotoSVG(kind, stage, v) {
  const skins = [['#F4E5D9', '#E3C9B6'], ['#F0DDCC', '#DDC0AA'], ['#F6E8DD', '#E6CEBC'], ['#EBD6C5', '#D6B9A3']];
  const [c1, c2] = skins[v % skins.length];
  const k = stage === 'before' ? 0 : stage === 'after' ? 2 : 1; // 0 — до, 1 — через месяц, 2 — сразу после
  let body = '';
  if (kind === 'brows') {
    const col = ['#4E3A30', '#5B4739', '#3F3B39', '#6B4C38'][v % 4];
    const op = [0.24, 0.64, 0.94][k];
    let hairs = '';
    if (k === 0) {
      for (let i = 0; i < 9; i += 1) {
        const x = 236 + i * 13;
        hairs += `<path d="M${x} ${147 - i * 3.3}l9 -7" stroke="${col}" stroke-opacity=".34" stroke-width="1.6" stroke-linecap="round"/>`;
      }
    }
    const brow = `<path d="M222 150C250 120 300 104 346 111C354 112 360 116 362 121C330 118 290 125 252 143C240 148 230 152 222 150Z" fill="${col}" fill-opacity="${op}"/>`;
    const P0 = [236, 198], P1 = [292, 176], P2 = [350, 196];
    let lashes = '';
    for (let t = 0.12; t < 0.9; t += 0.11) {
      const [x, y] = qPoint(P0, P1, P2, t);
      lashes += `<path d="M${x.toFixed(1)} ${y.toFixed(1)}l${(-3 + t * 7).toFixed(1)} 10" stroke="#4A3D38" stroke-width="1.6" stroke-linecap="round"/>`;
    }
    const eye = `<path d="M236 198Q292 176 350 196" stroke="#6A5750" stroke-width="3" fill="none" stroke-linecap="round"/>${lashes}`;
    body = `<g>${brow}${hairs}${eye}</g><g transform="translate(400 0) scale(-1 1)">${brow}${hairs}${eye}</g>`;
  } else if (kind === 'lips') {
    const sets = [['#D3A39B', '#C56E72', '#B4434F'], ['#D6A69A', '#CF7C6E', '#CB5A4E'], ['#CFA19A', '#B8707A', '#9E3342'], ['#D8AAA0', '#C98B85', '#B96F6B']];
    const col = sets[v % 4][k];
    const op = [0.62, 0.86, 0.96][k];
    const upper = 'M110 152C140 128 172 118 190 130C196 134 204 134 210 130C228 118 260 128 290 152C250 158 150 158 110 152Z';
    const lower = 'M110 152C150 160 250 160 290 152C268 192 232 206 200 206C168 206 132 192 110 152Z';
    body = `<path d="${upper}" fill="${col}" fill-opacity="${op}"/><path d="${lower}" fill="${col}" fill-opacity="${op}"/>`
      + `<path d="M112 152C150 160 250 160 288 152" stroke="#7E4144" stroke-opacity=".45" stroke-width="2" fill="none"/>`
      + (k === 0 ? `<path d="${upper}" fill="none" stroke="#B0847B" stroke-opacity=".35"/>` : '')
      + (k > 0 ? '<ellipse cx="200" cy="182" rx="34" ry="6" fill="#fff" fill-opacity=".16"/>' : '');
  } else if (kind === 'lash') {
    const lid = 'M92 160Q200 84 308 160';
    const col = ['#7A6A62', '#2E2828', '#1E1A1A'][k];
    const w = [1.5, 3.6, 5.2][k];
    let lashes = '';
    for (let t = 0.12; t < 0.92; t += 0.08) {
      const [x, y] = qPoint([92, 160], [200, 84], [308, 160], t);
      const dx = (t - 0.5) * 22;
      lashes += `<path d="M${x.toFixed(1)} ${y.toFixed(1)}q${(dx * 0.4).toFixed(1)} -12 ${dx.toFixed(1)} -20" stroke="#2B2425" stroke-width="1.7" fill="none" stroke-linecap="round"/>`;
    }
    body = '<defs><clipPath id="eye"><path d="M92 160Q200 84 308 160Q200 222 92 160Z"/></clipPath></defs>'
      + '<path d="M92 160Q200 84 308 160Q200 222 92 160Z" fill="#FAF6F2" stroke="#7C6A61" stroke-width="1.5"/>'
      + '<g clip-path="url(#eye)"><circle cx="200" cy="154" r="37" fill="#6D5A4B"/><circle cx="200" cy="154" r="15" fill="#221B1A"/><circle cx="188" cy="143" r="6" fill="#fff" fill-opacity=".7"/></g>'
      + `${lashes}<path d="${lid}" stroke="${col}" stroke-width="${w}" fill="none" stroke-linecap="round"/>`;
  } else if (kind === 'camo') {
    const scar = 'M118 214C170 178 232 160 292 106';
    if (k === 0) {
      body = `<path d="${scar}" stroke="#D5A99D" stroke-opacity=".7" stroke-width="22" fill="none" stroke-linecap="round"/><path d="${scar}" stroke="#F7E4DE" stroke-width="15" fill="none" stroke-linecap="round"/>`;
      for (let i = 0; i < 7; i += 1) {
        const [x, y] = qPoint([118, 214], [205, 175], [292, 106], 0.1 + i * 0.13);
        body += `<path d="M${(x - 9).toFixed(1)} ${(y - 9).toFixed(1)}l18 18" stroke="#D9AEA2" stroke-width="2" stroke-opacity=".6"/>`;
      }
    } else {
      const col = k === 2 ? '#E0C3AF' : '#EACFBF';
      body = `<path d="${scar}" stroke="#D8B6A2" stroke-opacity="${k === 2 ? 0.12 : 0.22}" stroke-width="20" fill="none" stroke-linecap="round"/><path d="${scar}" stroke="${col}" stroke-opacity=".9" stroke-width="14" fill="none" stroke-linecap="round"/>`;
    }
  } else if (kind === 'areola') {
    const col = ['#E2C4B6', '#CD998C', '#C4887B'][k];
    body = `<ellipse cx="200" cy="150" rx="${k === 0 ? 58 : 64}" ry="${k === 0 ? 52 : 64}" fill="${col}"/><circle cx="200" cy="150" r="17" fill="${col}" style="filter:brightness(.9)"/><circle cx="200" cy="150" r="17" fill="#8A5A50" fill-opacity=".18"/>`;
  } else if (kind === 'scalp') {
    const r = mulberry32(99 + v);
    const n = [70, 260, 320][k];
    const op = [0.35, 0.7, 0.85][k];
    let dots = '';
    for (let i = 0; i < n; i += 1) {
      const a = r() * Math.PI * 2;
      const d = Math.sqrt(r());
      dots += `<circle cx="${(200 + Math.cos(a) * d * 150).toFixed(1)}" cy="${(150 + Math.sin(a) * d * 110).toFixed(1)}" r="1.5"/>`;
    }
    body = `<g fill="#3E3A3A" fill-opacity="${op}">${dots}</g>`;
  } else if (kind === 'doc') {
    let lines = '';
    for (let i = 0; i < 9; i += 1) lines += `<rect x="140" y="${70 + i * 14}" width="${[120, 112, 118, 96, 120, 104, 116, 88, 110][i]}" height="4" rx="2" fill="#6E7674" fill-opacity=".4"/>`;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300"><rect width="400" height="300" fill="${v % 2 ? '#E7F0EE' : '#EFEAE3'}"/><rect x="120" y="22" width="160" height="256" rx="4" fill="#fff" stroke="#DFE4E2"/><rect x="140" y="44" width="92" height="7" rx="3" fill="#2B2223" fill-opacity=".75"/>${lines}<path d="M150 242c10-18 18 8 26-4s14-16 20 2 10 6 22-8" stroke="#284C8C" stroke-width="2" fill="none" stroke-linecap="round"/><rect x="214" y="246" width="46" height="3" rx="1.5" fill="#6E7674" fill-opacity=".4"/></svg>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300"><defs><radialGradient id="g" cx="50%" cy="45%" r="75%"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></radialGradient></defs><rect width="400" height="300" fill="url(#g)"/>${body}</svg>`;
}

// ── Демо-база ──
function buildDemo() {
  const T = todayISO();
  const S0 = emptyState();
  S0.meta.demo = true;
  const rnd = mulberry32(240924);
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
  const ri = (a, b) => a + Math.floor(rnd() * (b - a + 1));
  const ago = (n) => addDays(T, -n);
  const bday = (offset, year) => `${year}-${addDays(T, offset).slice(5)}`.replace(/-02-29$/, '-02-28');
  const SVC = Object.fromEntries(S0.services.map((s) => [s.id, s]));
  const PG = Object.fromEntries(S0.pigments.map((p) => [p.id, p]));

  S0.courses = [
    { id: 'co_camo', name: 'Камуфляж шрамов и рубцов · практика', start: ago(48), note: 'Отработка на моделях, группа из четырёх человек' },
    { id: 'co_brows', name: 'Пудровые брови · практика', start: ago(20), note: '' },
  ];

  const lotFor = (pgId, date) => {
    const lots = PG[pgId].lots;
    return lots.length > 1 && daysBetween(date, T) > 240 ? lots[1].no : lots[0].no;
  };
  const RECIPE = {
    brows: [
      { pig: [['pg_a_choc', '']], nd: ['nd_1rl30'], an: ['an_lidopril', 'an_gel_lido'] },
      { pig: [['pg_a_taupe', '']], nd: ['nd_3rs35'], an: ['an_lido5', 'an_gel_lido'] },
      { pig: [['pg_b_caramel', '3 части'], ['pg_b_orange', '1 часть']], nd: ['nd_1rl30', 'nd_3rs35'], an: ['an_lidopril', 'an_gel_lido'] },
      { pig: [['pg_a_graphite', '']], nd: ['nd_1r18'], an: ['an_lido5', 'an_gel_tetra'] },
    ],
    lips: [
      { pig: [['pg_c_nude', '']], nd: ['nd_3rl30'], an: ['an_lidopril', 'an_gel_lido'] },
      { pig: [['pg_c_coral', '']], nd: ['nd_5m1'], an: ['an_lidopril', 'an_gel_lido'] },
      { pig: [['pg_c_cherry', '2 части'], ['pg_c_nude', '1 часть']], nd: ['nd_3rl30'], an: ['an_lido5', 'an_gel_lido'] },
      { pig: [['pg_c_nude', '2 части'], ['pg_c_warm', '1 часть']], nd: ['nd_3rl30'], an: ['an_lidopril', 'an_gel_tetra'] },
    ],
    lash: [
      { pig: [['pg_b_black', '']], nd: ['nd_1rl25'], an: ['an_lido5', 'an_gel_lido'] },
      { pig: [['pg_a_graphite', '']], nd: ['nd_1rlt25'], an: ['an_lido5', 'an_gel_tetra'] },
    ],
    undereye: [{ pig: [['pg_d_beige_l', '']], nd: ['nd_5m1'], an: ['an_lidopril', 'an_gel_lido'] }],
    scars: [{ pig: [['pg_d_beige_l', '2 части'], ['pg_d_beige_d', '1 часть']], nd: ['nd_3rs35'], an: ['an_lidopril', 'an_gel_lido'] }],
    areola: [{ pig: [['pg_d_areola', '']], nd: ['nd_5m1'], an: ['an_lidopril', 'an_gel_lido'] }],
    striae: [{ pig: [['pg_d_beige_l', '']], nd: ['nd_3rs35'], an: ['an_lidopril', 'an_gel_lido'] }],
    scalp: [{ pig: [['pg_d_scalp', '']], nd: ['nd_1rl25'], an: ['an_lido5', ''] }],
    vitiligo: [{ pig: [['pg_d_beige_d', '']], nd: ['nd_3rs35'], an: ['an_lidopril', 'an_gel_lido'] }],
  };

  const C = {};
  const addClient = (key, o) => {
    const c = {
      id: `c_${key}`,
      demoKey: key,
      cardNo: 0,
      lastName: o.ln,
      firstName: o.fn,
      middleName: o.mn || '',
      phone: o.phone,
      contact: o.contact || { kind: 'phone', handle: '' },
      birth: o.birth || '',
      source: o.source || '',
      tags: o.tags || [],
      facePhoto: '',
      notes: o.notes || '',
      consents: {
        pd: { date: o.pd || '', photos: o.pd ? [`demo:doc:doc:${o.docV || 0}`] : [] },
        health: { date: o.hc || '' },
        procedure: { date: o.pc || '', photos: o.pc ? [`demo:doc:doc:${(o.docV || 0) + 1}`] : [] },
      },
      health: o.health || null,
      reminded: {},
      createdAt: o.created || T,
    };
    S0.clients.push(c);
    C[key] = c;
    return c;
  };
  const health = (daysAgo, extra = {}) => ({ filledAt: ago(daysAgo), flags: extra.flags || {}, allergies: extra.allergies || [], meds: extra.meds || '', other: extra.other || '' });

  let pn = 0;
  const addProc = (key, daysAgo, svcId, o = {}) => {
    const c = C[key];
    const svc = SVC[svcId];
    const date = ago(daysAgo);
    const zone = o.zone || svc.zones[0];
    const recipes = RECIPE[zone];
    const r = recipes[Math.min(o.recipe || 0, recipes.length - 1)];
    const photoKind = S0.zones.find((z) => z.id === zone).photo;
    const photos = { before: [], after: [], month: [] };
    // Фото «через месяц» — снимок, сделанный уже при коррекции, поэтому оно на месте только у давних процедур
    for (const st of o.photos || []) photos[st].push(`demo:${photoKind}:${st}:${o.pv || 0}`);
    const pig = svc.type === 'removal' ? [['pg_r_saline', '']] : r.pig;
    const an = o.an || r.an;
    const prevSame = S0.procedures.filter((q) => q.clientId === c.id && q.zone === zone && q.technique).pop();
    const zoneDef = S0.zones.find((z) => z.id === zone);
    const fallbackTech = zone === 'brows' ? (o.recipe === 3 ? 'Волосковая' : 'Пудровое напыление') : zoneDef.techniques[0];
    const p = {
      id: `p_${key}_${pn++}`,
      clientId: c.id,
      date,
      serviceId: svcId,
      type: svc.type,
      zone,
      technique: svc.type === 'removal' ? '' : (o.tech || svc.technique || (prevSame && prevSame.technique) || fallbackTech),
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
      createdAt: `${date}T12:${String(pn % 60).padStart(2, '0')}:00`,
    };
    S0.procedures.push(p);
    return p;
  };
  const pct = (value, reason) => ({ mode: 'pct', value, reason });
  const rub = (value, reason) => ({ mode: 'rub', value, reason });

  // ── Сценарные клиентки (на них опирается список «Сценарии для проверки») ──
  addClient('S1', { fn: 'Анна', ln: 'Смирнова', mn: 'Сергеевна', phone: '+79171044567', birth: '1991-03-14', source: 'ВК', contact: { kind: 'vk', handle: 'anna.smirnova' }, pd: ago(35), pc: ago(35), health: health(35), created: ago(35) });
  addProc('S1', 35, 's_brows_powder', { recipe: 0, photos: ['before', 'after'], pv: 0 });

  addClient('S2', { fn: 'Екатерина', ln: 'Волкова', phone: '+79272318890', birth: bday(4, 1994), source: 'Рекомендация', contact: { kind: 'tg', handle: 'katya_volk' }, pd: ago(21), pc: ago(21), hc: ago(21), health: health(21, { flags: { herpes: true } }), docV: 1 });
  addProc('S2', 21, 's_lips_aqua', { recipe: 3, photos: ['before', 'after'], pv: 1, discount: rub(500, 'Акция'), payment: 'transfer', note: 'За два дня до процедуры принимала противовирусное по назначению врача' });

  addClient('S3', { fn: 'Мария', ln: 'Кузнецова', phone: '+79063379012', birth: '1988-11-02', source: '2ГИС', contact: { kind: 'vk', handle: 'm.kuznetsova' }, pd: ago(68), pc: ago(68), health: health(68) });
  const p3 = addProc('S3', 68, 's_brows_hair', { recipe: 3, photos: ['before', 'after'], pv: 2 });
  C.S3.reminded[`corr:${p3.id}`] = ago(5);

  addClient('S4', { fn: 'Ольга', ln: 'Попова', mn: 'Викторовна', phone: '+79179023311', birth: '1979-06-21', source: 'Рекомендация', tags: ['Постоянная'], contact: { kind: 'max', handle: 'olga.popova' }, pd: ago(430), pc: ago(430), health: health(430) });
  addProc('S4', 430, 's_brows_powder', { recipe: 1, photos: ['before', 'after', 'month'], pv: 3, healing: 'uneven', healingNote: 'Левая бровь зажила светлее' });
  addProc('S4', 392, 's_brows_corr', { recipe: 1, photos: ['after'], pv: 3, healing: 'good', discount: pct(10, 'Постоянная клиентка') });

  addClient('S5', { fn: 'Татьяна', ln: 'Лебедева', phone: '+79374410075', birth: '1985-01-30', source: 'ВК', contact: { kind: 'vk', handle: 'tanya.lebedeva' }, pd: ago(560), pc: ago(560), health: health(560) });
  addProc('S5', 560, 's_lips_lipstick', { recipe: 1, photos: ['before', 'after', 'month'], pv: 1, healing: 'good' });
  addProc('S5', 522, 's_lips_corr', { recipe: 1 });

  addClient('S6', { fn: 'Наталья', ln: 'Козлова', phone: '+79603128844', birth: '1990-09-09', source: 'ВК', contact: { kind: 'vk', handle: 'natalia.k' }, pd: ago(600), pc: ago(600), health: health(600) });
  addProc('S6', 600, 's_lash', { recipe: 0, photos: ['before', 'after'], pv: 0, healing: 'good' });
  addProc('S6', 562, 's_lash_corr', { recipe: 0 });

  addClient('S7', { fn: 'Юлия', ln: 'Новикова', phone: '+79272045566', birth: bday(12, 1996), source: 'ВК', contact: { kind: 'vk', handle: 'yulia.novikova' }, pd: ago(100), pc: ago(100), health: health(100) });
  addProc('S7', 100, 's_brows_powder', { recipe: 2, photos: ['before', 'after', 'month'], pv: 1, discount: rub(500, 'Акция'), healing: 'good' });
  addProc('S7', 62, 's_brows_corr', { recipe: 2, photos: ['after'], pv: 1 });

  addClient('S8', { fn: 'Ирина', ln: 'Морозова', phone: '+79177770312', birth: '1983-04-17', source: 'Модель с обучения', tags: ['Модель'], contact: { kind: 'vk', handle: 'irina.moroz' }, pd: ago(40), pc: ago(40), health: health(40) });
  addProc('S8', 40, 's_camo_scar', { photos: ['before', 'after'], pv: 1, model: 'co_camo', discount: pct(50, 'Модель'), note: 'Шрам на предплечье, 4 см. Работа на практике курса' });

  addClient('S9', { fn: 'Светлана', ln: 'Павлова', phone: '+79063012288', birth: '1993-07-07', source: '2ГИС', contact: { kind: 'vk', handle: 'sveta.pavlova' }, created: ago(9), notes: 'Консультация: перекрытие старого татуажа бровей. Думает, перезвонит после отпуска.' });

  addClient('S10', { fn: 'Елена', ln: 'Соколова', mn: 'Андреевна', phone: '+79171239876', birth: '1982-12-05', source: 'Рекомендация', tags: ['VIP', 'Постоянная'], contact: { kind: 'max', handle: 'elena.sokolova' }, pd: ago(800), pc: ago(800), hc: ago(150), health: health(150, { allergies: ['никель'] }), notes: 'Любит тёплые оттенки. Удобнее записывать на утро.' });
  addProc('S10', 800, 's_brows_powder', { recipe: 0, photos: ['before', 'after', 'month'], pv: 0, healing: 'good' });
  addProc('S10', 762, 's_brows_corr', { recipe: 0 });
  addProc('S10', 150, 's_lips_aqua', { recipe: 0, photos: ['before', 'after', 'month'], pv: 3, healing: 'good' });
  addProc('S10', 150, 's_lash', { recipe: 1, photos: ['before', 'after'], pv: 1, healing: 'good', discount: pct(10, 'Постоянная клиентка') });
  addProc('S10', 112, 's_lips_corr', { recipe: 0, photos: ['after'], pv: 3 });
  addProc('S10', 112, 's_lash_corr', { recipe: 1, discount: pct(10, 'Постоянная клиентка') });
  addProc('S10', 90, 's_brows_upd', { recipe: 0, photos: ['before', 'after'], pv: 0, discount: pct(10, 'Постоянная клиентка') });

  addClient('S11', { fn: 'Дарья', ln: 'Михайлова', phone: '+79530914455', birth: '1997-02-11', source: 'ВК', contact: { kind: 'vk', handle: 'dasha.mikh' }, pd: ago(50), pc: ago(50), health: health(50) });
  addProc('S11', 50, 's_brows_powder', { recipe: 1, photos: ['before', 'after'], pv: 2 });
  addProc('S11', 5, 's_brows_corr', { recipe: 1, status: 'noshow', note: 'Не пришла и не предупредила' });

  addClient('S12', { fn: 'Алина', ln: 'Фёдорова', phone: '+79271190077', birth: bday(1, 1999), source: 'ВК', contact: { kind: 'vk', handle: 'alina.fedorova' }, pd: ago(200), pc: ago(200), health: health(200) });
  addProc('S12', 200, 's_lips_lipstick', { recipe: 2, photos: ['before', 'after'], pv: 2, healing: 'good' });
  addProc('S12', 164, 's_lips_corr', { recipe: 2 });

  addClient('S13', { fn: 'Ксения', ln: 'Васильева', phone: '+79374456120', birth: '1987-08-19', source: '2ГИС', contact: { kind: 'tg', handle: 'ksenia_v' }, pd: ago(130), pc: ago(130), health: health(130) });
  addProc('S13', 130, 's_removal', { zone: 'brows', note: 'Старый татуаж с синевой, первый сеанс' });
  addProc('S13', 72, 's_removal', { zone: 'brows', note: 'Второй сеанс' });
  addProc('S13', 12, 's_brows_cover', { recipe: 2, photos: ['before', 'after'], pv: 3, note: 'Перекрытие после удаления, корректор против синевы' });

  addClient('S14', { fn: 'Виктория', ln: 'Николаева', phone: '+79176663421', birth: '1995-05-23', source: 'Яндекс Карты', contact: { kind: 'tg', handle: 'vika_nik' }, pd: ago(30), pc: ago(30), hc: ago(30), health: health(30, { allergies: ['лидокаин'] }) });
  addProc('S14', 30, 's_brows_powder', { recipe: 0, an: ['an_benzo', 'an_gel_tetra'], photos: ['before', 'after'], pv: 2, note: 'Аллергия на лидокаин: только бензокаин и тетракаин' });

  addClient('S15', { fn: 'Полина', ln: 'Алексеева', phone: '+79603349090', birth: '1980-10-28', source: 'Рекомендация', contact: { kind: 'max', handle: 'polina.a' }, pd: ago(420), pc: ago(420), health: health(420) });
  addProc('S15', 420, 's_camo_areola', { photos: ['before', 'after'], pv: 0, healing: 'good' });
  addProc('S15', 380, 's_camo_repeat', { zone: 'areola' });

  addClient('S16', { fn: 'Дмитрий', ln: 'Орлов', phone: '+79272307711', birth: '1986-01-15', source: 'Рекомендация', contact: { kind: 'tg', handle: 'd_orlov' }, pd: ago(75), pc: ago(75), health: health(75) });
  addProc('S16', 75, 's_camo_scalp', { photos: ['before', 'after'], pv: 0, healing: 'good', payment: 'transfer' });
  addProc('S16', 35, 's_camo_repeat', { zone: 'scalp', photos: ['after'], pv: 0, payment: 'transfer' });

  addClient('S17', { fn: 'Игорь', ln: 'Белов', phone: '+79063342200', birth: '1978-03-03', source: '2ГИС', pd: ago(300), pc: ago(300), health: health(300) });
  addProc('S17', 300, 's_camo_scar', { photos: ['before', 'after'], pv: 2, note: 'Шрам на подбородке, 3 см', healing: 'good' });
  addProc('S17', 256, 's_camo_repeat', { zone: 'scars', photos: ['after'], pv: 2 });

  addClient('S18', { fn: 'Людмила', ln: 'Григорьева', mn: 'Петровна', phone: '+79170904433', birth: '1968-06-30', source: 'Проходила мимо', pd: ago(1000), pc: ago(1000), health: health(1000) });
  addProc('S18', 1000, 's_brows_hair', { recipe: 3, payment: 'cash' });
  addProc('S18', 962, 's_brows_corr', { recipe: 3, payment: 'cash' });

  addClient('S19', { fn: 'Вероника', ln: 'Тарасова', phone: '+79271117766', birth: bday(25, 1992), source: 'ВК', contact: { kind: 'vk', handle: 'nika.tarasova' }, pd: ago(820), pc: ago(820), health: health(820) });
  addProc('S19', 820, 's_lips_aqua', { recipe: 0 });
  addProc('S19', 781, 's_lips_corr', { recipe: 0 });

  addClient('S20', { fn: 'Марина', ln: 'Зайцева', phone: '+79377001199', birth: '1991-12-19', source: 'Другое', contact: { kind: 'max', handle: 'marina.z' }, pd: ago(45), pc: ago(45), health: health(45) });
  const p20 = addProc('S20', 45, 's_brows_powder', { recipe: 1, payment: 'cert', cert: 'cert_2', photos: ['before', 'after'], pv: 1, note: 'Сертификат в подарок от мужа, доплата картой' });

  addClient('S21', { fn: 'Анастасия', ln: 'Белова', phone: '+79176541230', birth: '2000-04-04', source: 'Модель с обучения', tags: ['Модель'], contact: { kind: 'vk', handle: 'nastya.belova' }, pd: ago(14), pc: ago(14), health: health(14) });
  addProc('S21', 14, 's_brows_powder', { recipe: 0, photos: ['before', 'after'], pv: 3, model: 'co_brows', discount: pct(70, 'Модель') });

  addClient('S22', { fn: 'Валерия', ln: 'Комарова', phone: '+79603402299', birth: '1994-02-26', source: 'ВК', contact: { kind: 'vk', handle: 'lera.komarova' }, pd: ago(18), hc: ago(18), health: health(18, { flags: { pregnancy: true } }), created: ago(18), notes: 'Хочет пудровые брови после окончания грудного вскармливания, примерно весной.' });

  addClient('S23', { fn: 'Кристина', ln: 'Медведева', phone: '+79279903344', birth: '1998-10-13', source: 'ВК', contact: { kind: 'vk', handle: 'kris.medvedeva' }, pd: T, pc: T, health: health(0) });
  addProc('S23', 0, 's_lips_lipstick', { recipe: 1, photos: ['before'], pv: 2, payment: 'transfer' });

  addClient('S24', { fn: 'Галина', ln: 'Сорокина', phone: '+79063218800', birth: '1975-07-27', source: 'Рекомендация', tags: ['Постоянная'], pd: ago(40), pc: ago(40), health: health(40) });
  addProc('S24', 40, 's_brows_powder', { recipe: 1, photos: ['before', 'after', 'month'], pv: 2, healing: 'good', payment: 'cash' });
  addProc('S24', 0, 's_brows_corr', { recipe: 1, payment: 'cash' });

  addClient('S25', { fn: 'Евгения', ln: 'Андреева', phone: '+79172209988', birth: '1989-09-30', source: 'Яндекс Карты', contact: { kind: 'wa', handle: '' }, pd: ago(20), pc: ago(20), health: health(20) });
  addProc('S25', 20, 's_camo_striae', { photos: ['before', 'after'], pv: 0 });

  addClient('S26', { fn: 'Олеся', ln: 'Никитина', phone: '+79370412345', birth: '1993-11-11', source: 'ВК', contact: { kind: 'vk', handle: 'olesya.nikitina' }, pd: ago(150), pc: ago(150), health: health(150) });
  addProc('S26', 150, 's_camo_vitiligo', { photos: ['before', 'after'], pv: 3, healing: 'good' });
  addProc('S26', 105, 's_camo_repeat', { zone: 'vitiligo', photos: ['after'], pv: 3 });

  addClient('S27', { fn: 'Софья', ln: 'Егорова', phone: '+79276014477', birth: '1990-05-05', source: 'Яндекс Карты', contact: { kind: 'tg', handle: 'sofia_egorova' }, pd: ago(60), pc: ago(60), health: health(60) });
  addProc('S27', 60, 's_camo_undereye', { photos: ['before', 'after'], pv: 1 });

  // ── Остальная база: обычные истории «первичная → коррекция → обновление» ──
  const FIRST = ['Алёна', 'Вера', 'Галина', 'Диана', 'Жанна', 'Зарина', 'Инна', 'Карина', 'Кира', 'Лариса', 'Лилия', 'Любовь', 'Маргарита', 'Милана', 'Надежда', 'Нина', 'Регина', 'Римма', 'Снежана', 'Таисия', 'Ульяна', 'Эльвира', 'Яна', 'Альбина', 'Ангелина', 'Василиса', 'Злата', 'Елизавета', 'Арина', 'Полина', 'Дарья', 'Ольга', 'Мария', 'Анна', 'Екатерина', 'Ирина', 'Юлия', 'Татьяна', 'Наталья', 'Софья'];
  const LAST = ['Абрамова', 'Баранова', 'Белоусова', 'Виноградова', 'Гусева', 'Давыдова', 'Ершова', 'Жукова', 'Зуева', 'Ильина', 'Калинина', 'Киселёва', 'Королёва', 'Кудрявцева', 'Лаптева', 'Макарова', 'Максимова', 'Мельникова', 'Назарова', 'Осипова', 'Панова', 'Полякова', 'Романова', 'Савельева', 'Сафонова', 'Семёнова', 'Степанова', 'Титова', 'Устинова', 'Филиппова', 'Фролова', 'Хохлова', 'Чернова', 'Шарова', 'Щербакова', 'Яковлева', 'Горбунова', 'Тихонова', 'Воробьёва', 'Комиссарова'];
  const PREF = ['917', '927', '937', '960', '906', '953', '902'];
  const SOURCES = ['ВК', 'ВК', 'ВК', 'MAX', '2ГИС', 'Яндекс Карты', 'Рекомендация', 'Рекомендация', 'Проходила мимо'];
  const KINDS = ['vk', 'vk', 'vk', 'max', 'tg', 'wa', 'phone'];
  const PAY = ['card', 'card', 'card', 'transfer', 'transfer', 'cash'];
  const ZONEW = ['brows', 'brows', 'brows', 'brows', 'lips', 'lips', 'lips', 'lash', 'undereye', 'scars'];
  const used = new Set(S0.clients.map((c) => c.phone));
  for (let i = 0; i < 40; i += 1) {
    const key = `F${i + 1}`;
    let phone;
    do { phone = `+79${pick(PREF).slice(1)}${String(ri(1000000, 9999999))}`; } while (used.has(phone));
    used.add(phone);
    const fn = FIRST[i];
    const ln = LAST[(i * 7) % LAST.length];
    const kind = pick(KINDS);
    const zones = uniq(rnd() < 0.3 ? [pick(ZONEW), pick(ZONEW)] : [pick(ZONEW)]);
    const primDays0 = ri(80, 720);
    addClient(key, {
      fn, ln, phone,
      birth: `${ri(1970, 2003)}-${String(ri(1, 12)).padStart(2, '0')}-${String(ri(1, 28)).padStart(2, '0')}`,
      source: pick(SOURCES),
      tags: rnd() < 0.18 ? ['Постоянная'] : [],
      contact: { kind, handle: kind === 'phone' || kind === 'wa' ? '' : `client${i + 101}` },
      pd: ago(primDays0), pc: ago(primDays0), health: health(primDays0),
    });
    zones.forEach((zone, zi) => {
      const primDays = zi === 0 ? primDays0 : Math.max(80, primDays0 - ri(0, 60));
      const recipes = RECIPE[zone];
      let recipe = ri(0, recipes.length - 1);
      let prim;
      if (zone === 'brows') { prim = recipe === 3 ? 's_brows_hair' : 's_brows_powder'; }
      else if (zone === 'lips') prim = pick(['s_lips_lipstick', 's_lips_aqua']);
      else if (zone === 'lash') prim = 's_lash';
      else if (zone === 'undereye') { prim = 's_camo_undereye'; recipe = 0; }
      else { prim = 's_camo_scar'; recipe = 0; }
      const disc = rnd() < 0.12 ? pct(10, 'Постоянная клиентка') : rnd() < 0.1 ? rub(500, 'Акция') : undefined;
      addProc(key, primDays, prim, { recipe, discount: disc, payment: pick(PAY), healing: pick(['good', 'good', 'good', 'uneven', 'faded', 'shade']), photos: rnd() < 0.35 ? ['before', 'after'] : [], pv: ri(0, 3) });
      const corrSvc = { brows: 's_brows_corr', lips: 's_lips_corr', lash: 's_lash_corr' }[zone] || 's_camo_repeat';
      const corrDays = primDays - ri(32, 48);
      if (rnd() < 0.07) addProc(key, corrDays + 4, corrSvc, { recipe, zone, status: 'noshow' });
      addProc(key, corrDays, corrSvc, { recipe, zone, payment: pick(PAY), discount: rnd() < 0.1 ? pct(10, 'Повторная процедура') : undefined });
      const updSvc = { brows: 's_brows_upd', lips: 's_lips_upd', lash: 's_lash_upd' }[zone];
      if (updSvc && corrDays > 365 && rnd() < 0.85) {
        const updDays = corrDays - ri(365, 470);
        if (updDays >= 3) addProc(key, updDays, updSvc, { recipe, payment: pick(PAY), discount: rnd() < 0.4 ? pct(10, 'Постоянная клиентка') : undefined });
      }
    });
  }

  // Сертификаты
  const cert = (id, no, amount, soldDays, buyer, recipient, payment, extra = {}) => ({ id, no, amount, soldAt: ago(soldDays), validTo: addDays(ago(soldDays), 180), buyer, recipient, payment, note: '', usedProcId: '', usedAt: '', ...extra });
  S0.certificates = [
    cert('cert_1', 'С-001', 5000, 120, 'Андрей, подарок жене', '', 'card'),
    cert('cert_2', 'С-002', 5000, 80, 'Муж Марины Зайцевой', 'Марина Зайцева', 'transfer', { usedProcId: p20.id, usedAt: p20.date }),
    cert('cert_3', 'С-003', 3000, 260, 'Коллеги, подарок на юбилей', '', 'cash'),
    cert('cert_4', 'С-004', 10000, 12, 'Ирина К.', 'Мама', 'card'),
    cert('cert_5', 'С-005', 7000, 30, 'Подруги Алины', 'Алина Фёдорова', 'transfer'),
  ];
  S0.settings.nextCertNo = 6;
  S0.expenses = demoExpenses(T);

  // Номера карт — по дате первого визита, начиная с № 1
  const firstDate = new Map();
  for (const p of S0.procedures) {
    const f = firstDate.get(p.clientId);
    if (!f || p.date < f) firstDate.set(p.clientId, p.date);
  }
  for (const c of S0.clients) c.createdAt = firstDate.get(c.id) || c.createdAt;
  S0.clients.sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0));
  S0.clients.forEach((c, i) => { c.cardNo = i + 1; });
  S0.settings.nextCardNo = S0.clients.length + 1;
  S0.settings.lastBackup = ago(34);
  return S0;
}
