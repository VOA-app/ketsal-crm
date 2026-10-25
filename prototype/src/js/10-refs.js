// «Справочники»: прайс, пигменты с партиями, иглы, анестезия, зоны и техники, курсы обучения.

const REF_KINDS = [
  { id: 'services', label: 'Услуги' },
  { id: 'pigments', label: 'Пигменты' },
  { id: 'needles', label: 'Иглы' },
  { id: 'anesthetics', label: 'Анестезия' },
  { id: 'zones', label: 'Зоны' },
  { id: 'courses', label: 'Курсы' },
];
const REF_COLL = { services: 'services', pigments: 'pigments', needles: 'needles', anesthetics: 'anesthetics', zones: 'zones', courses: 'courses' };

route((p) => p[0] === 'refs', screenRefs, { tab: 'refs' });

function usageCount(kind, id) {
  if (kind === 'services') return S.procedures.filter((p) => p.serviceId === id).length;
  if (kind === 'pigments') return S.procedures.filter((p) => p.pigments.some((g) => g.pigmentId === id)).length;
  if (kind === 'needles') return S.procedures.filter((p) => p.needles.includes(id)).length;
  if (kind === 'anesthetics') return S.procedures.filter((p) => p.anesthesia.primary === id || p.anesthesia.secondary === id).length;
  if (kind === 'zones') return S.procedures.filter((p) => p.zone === id).length + S.services.filter((s) => s.zones.includes(id)).length;
  if (kind === 'courses') return S.procedures.filter((p) => p.model && p.model.courseId === id).length;
  return 0;
}

function screenRefs(r) {
  const kind = REF_KINDS.some((k) => k.id === r.parts[1]) ? r.parts[1] : UI.refsKind;
  UI.refsKind = kind;
  const body = { services: refServices, pigments: refPigments, needles: refNeedles, anesthetics: refAnesthetics, zones: refZones, courses: refCourses }[kind]();
  return `<div class="screen">
    <header class="topbar">
      <div class="topbar-row"><h1 class="display title-lg">Справочники</h1></div>
      <div class="seg seg--scroll" role="tablist">${REF_KINDS.map((k) => `<button role="tab" class="${k.id === kind ? 'on' : ''}" aria-selected="${k.id === kind}" data-act="refs-kind" data-id="${k.id}">${k.label}</button>`).join('')}</div>
    </header>
    <div class="scroller">${body}</div>
    <button class="fab" data-act="ref-new" data-kind="${kind}" aria-label="Добавить">${icon('plus')}</button>
  </div>`;
}

const refRow = (kind, x, title, sub, side = '') => `<button class="row ${x.active === false ? 'row--dim' : ''}" data-act="ref-edit" data-kind="${kind}" data-id="${x.id}"><div class="row-main"><div class="row-title">${title}</div><div class="row-sub">${sub}</div></div>${side ? `<div class="row-side">${side}</div>` : ''}</button>`;

function refServices() {
  const row = (s) => refRow('services', s, esc(s.name), esc(`${TYPE_LABEL[s.type]} · ${s.duration} мин${s.active ? '' : ' · в архиве'}`), `<span class="num" style="font-weight:600">${fmtMoney(s.price)}</span>`);
  const groups = S.zones.map((z) => ({ title: z.name, items: S.services.filter((s) => s.zones.length === 1 && s.zones[0] === z.id) })).filter((g) => g.items.length);
  const multi = S.services.filter((s) => s.zones.length !== 1);
  if (multi.length) groups.push({ title: 'Для нескольких зон', items: multi });
  return `<p class="note" style="margin:4px 4px 0">Цены условные, это заглушка. Цена услуги подставляется в процедуру сама, её можно изменить.</p>${groups.map((g) => `<div class="section-title">${esc(g.title)}</div><div class="list list--plain">${g.items.map(row).join('')}</div>`).join('')}`;
}

function refPigments() {
  const T = IDX.today;
  const brands = uniq(S.pigments.map((p) => p.brand));
  const row = (p) => {
    const expired = p.lots.filter((l) => l.exp && l.exp < T);
    const cur = p.lots.find((l) => !l.exp || l.exp >= T);
    const sub = `${p.kind} · ${p.zones.map((z) => lc(zoneName(z))).join(', ')}`;
    const lotLine = [
      cur ? `партия ${esc(cur.no)}${cur.exp ? ` до ${fmtMonthNum(cur.exp)}` : ''}` : 'нет действующей партии',
      expired.length ? `<span class="dot dot--alert"></span> просрочена ${expired.map((l) => esc(l.no)).join(', ')}` : '',
    ].filter(Boolean).join(' · ');
    const used = usageCount('pigments', p.id);
    const side = `<span class="muted" style="font-size:12px">${used ? pl(used, 'процедура', 'процедуры', 'процедур') : 'не использовался'}</span>`;
    return `<button class="row ${p.active ? '' : 'row--dim'}" data-act="ref-edit" data-kind="pigments" data-id="${p.id}"><span class="swatch" style="width:28px;height:28px;background:${esc(p.hex)}"></span><div class="row-main"><div class="row-title">${esc(p.name)}</div><div class="row-sub">${esc(sub)}</div><div class="row-sub2">${lotLine}</div></div><div class="row-side">${side}</div></button>`;
  };
  return `<p class="note" style="margin:4px 4px 0">Марки условные. У каждого пигмента — партии со сроком годности: в процедуре подставляется действующая партия, просроченную приложение подсветит.</p>${brands.map((b) => `<div class="section-title">${esc(b)}</div><div class="list list--plain">${S.pigments.filter((p) => p.brand === b).map(row).join('')}</div>`).join('')}`;
}

function refNeedles() {
  const rows = S.needles.map((n) => {
    const used = usageCount('needles', n.id);
    return refRow('needles', n, esc(n.name), esc(`${n.note || 'картридж'}${n.active ? '' : ' · в архиве'}`), `<span class="muted" style="font-size:12px">${used ? pl(used, 'процедура', 'процедуры', 'процедур') : '—'}</span>`);
  }).join('');
  return `<div class="section-title">Картриджи и иглы</div><div class="list list--plain">${rows}</div>`;
}

function refAnesthetics() {
  const part = (stage, title) => {
    const items = S.anesthetics.filter((a) => a.stage === stage);
    return `<div class="section-title">${title}</div><div class="list list--plain">${items.map((a) => refRow('anesthetics', a, esc(a.name), esc(`Действующее вещество: ${a.substances.join(', ') || '—'}${a.active ? '' : ' · в архиве'}`))).join('') || '<div class="row"><span class="muted">Пусто</span></div>'}</div>`;
  };
  return `<p class="note" style="margin:4px 4px 0">По действующему веществу приложение сверяет анестезию с аллергиями из анкеты здоровья.</p>${part('primary', 'Первичная')}${part('secondary', 'Вторичная')}`;
}

function refZones() {
  const part = (g) => {
    const items = S.zones.filter((z) => z.group === g.id);
    if (!items.length) return '';
    return `<div class="section-title">${g.label}</div><div class="list list--plain">${items.map((z) => refRow('zones', z, esc(z.name), esc(`${z.techniques.join(', ') || 'без техник'}${z.update ? ' · напоминать об обновлении' : ''}`))).join('')}</div>`;
  };
  return `<p class="note" style="margin:4px 4px 0">Зоны и техники используются в процедуре. Для каждой зоны можно включить напоминание об обновлении.</p>${ZONE_GROUPS.map(part).join('')}`;
}

function refCourses() {
  if (!S.courses.length) return '<div class="empty"><p>Курсов пока нет. Курс нужен, чтобы отмечать работу на моделях.</p></div>';
  return `<div class="section-title">Курсы обучения</div><div class="list list--plain">${S.courses.map((co) => {
    const n = usageCount('courses', co.id);
    return refRow('courses', co, esc(co.name), esc(`${co.start ? `с ${fmtDate(co.start, true)}` : 'без даты'}${co.note ? ` · ${co.note}` : ''}`), `<span class="muted" style="font-size:12px">${n ? pl(n, 'модель', 'модели', 'моделей') : 'моделей нет'}</span>`);
  }).join('')}</div>`;
}

ACTIONS['refs-kind'] = (el) => {
  UI.refsKind = el.dataset.id;
  goReplace(`/refs/${el.dataset.id}`);
  const sc = $('.scroller');
  if (sc) sc.scrollTop = 0;
};
ACTIONS['ref-new'] = (el) => openRefForm(el.dataset.kind, null);
ACTIONS['ref-edit'] = (el) => openRefForm(el.dataset.kind, el.dataset.id);

// ── Формы справочников ──
const REF_TITLES = {
  services: ['Новая услуга', 'Услуга'],
  pigments: ['Новый пигмент', 'Пигмент'],
  needles: ['Новая игла', 'Игла'],
  anesthetics: ['Новый анестетик', 'Анестезия'],
  zones: ['Новая зона', 'Зона'],
  courses: ['Новый курс', 'Курс'],
};

function blankRef(kind) {
  const id = uid(kind.slice(0, 2));
  if (kind === 'services') return { id, name: '', zones: [], type: 'primary', technique: '', price: 0, duration: 120, active: true };
  if (kind === 'pigments') return { id, brand: '', name: '', kind: 'Органический', zones: [], hex: '#8C6A55', lots: [{ no: '', exp: addMonths(todayISO(), 12) }], active: true };
  if (kind === 'needles') return { id, name: '', note: '', active: true };
  if (kind === 'anesthetics') return { id, name: '', stage: 'primary', substances: [], active: true };
  if (kind === 'zones') return { id, name: '', group: 'pmu', techniques: [], update: true, photo: 'camo' };
  return { id, name: '', start: todayISO(), note: '' };
}

function refFormBody(kind, d, e) {
  const activeSwitch = 'active' in d ? `<div class="switch-row"><div><div class="t">Используется</div><div class="s">Выключите, чтобы убрать из выбора, не трогая историю</div></div><input type="checkbox" class="switch" data-bind="active" ${d.active ? 'checked' : ''} aria-label="Используется"></div>` : '';
  const zoneChips = (sel) => `<div class="chips">${S.zones.map((z) => chip(z.name, sel.includes(z.id), `data-act="ref-zone" data-v="${z.id}"`)).join('')}</div>`;
  if (kind === 'services') {
    const oneZone = d.zones.length === 1 ? IDX.zone.get(d.zones[0]) : null;
    return `<div class="form-card">
      ${field('Название', `<input class="input" data-bind="name" value="${esc(d.name)}" autocomplete="off">`, e.name)}
      <div class="grid-2">${field('Цена', `<div class="affix"><input class="input" inputmode="numeric" data-bind="price" value="${esc(d.price || '')}" placeholder="0"><span>₽</span></div>`, e.price)}${field('Длительность', `<div class="affix"><input class="input" inputmode="numeric" data-bind="duration" value="${esc(d.duration || '')}"><span>мин</span></div>`)}</div>
      <div class="field ${e.zones ? 'err' : ''}" ${e.zones ? 'data-err="1"' : ''}><span class="field-label">Зоны</span>${zoneChips(d.zones)}${e.zones ? errHtml(e.zones) : ''}</div>
      <div class="field"><span class="field-label">Тип визита</span><div class="chips">${VISIT_TYPES.map((t) => chip(t.label, d.type === t.id, `data-act="ref-type" data-v="${t.id}"`)).join('')}</div></div>
      ${oneZone && oneZone.techniques.length ? `<div class="field"><span class="field-label"><span>Техника по умолчанию</span><span class="opt">необязательно</span></span><div class="chips">${oneZone.techniques.map((t) => chip(t, d.technique === t, `data-act="ref-tech" data-v="${esc(t)}"`)).join('')}</div></div>` : ''}
      ${activeSwitch}
    </div>`;
  }
  if (kind === 'pigments') {
    const T = todayISO();
    return `<div class="form-card">
      <div class="grid-2">${field('Марка', `<input class="input" data-bind="brand" value="${esc(d.brand)}" autocomplete="off">`, e.brand)}${field('Цвет', `<input class="input" data-bind="name" value="${esc(d.name)}" autocomplete="off">`, e.name)}</div>
      <div class="field"><span class="field-label">Тип</span><div class="chips">${PIGMENT_KINDS.map((k) => chip(k, d.kind === k, `data-act="ref-pkind" data-v="${k}"`)).join('')}</div></div>
      <div class="field"><span class="field-label">Для каких зон</span>${zoneChips(d.zones)}</div>
      <div class="field"><span class="field-label"><span>Образец цвета</span><span class="opt">только для экрана</span></span><div class="inline-actions"><input type="color" data-bind="hex" value="${esc(d.hex)}" style="width:56px;height:48px;border:0;background:none;padding:0" aria-label="Образец цвета"><span class="muted" style="font-size:14px">Кружок рядом с названием в процедуре</span></div></div>
      ${activeSwitch}
    </div>
    <div class="form-title">Партии</div>
    ${d.lots.map((l, i) => `<div class="pg-row"><div class="grid-2b"><input class="input" data-bind="lots.${i}.no" value="${esc(l.no)}" placeholder="Номер партии" aria-label="Номер партии" autocomplete="off"><input class="input" type="date" data-bind="lots.${i}.exp" value="${esc(l.exp)}" aria-label="Годен до"></div><div style="display:flex;justify-content:space-between;align-items:center;margin-top:6px"><span class="muted" style="font-size:13px">${l.exp && l.exp < T ? '<span class="dot dot--alert"></span> срок годности истёк' : l.exp ? `годна до ${fmtMonthNum(l.exp)}` : 'срок не указан'}</span><button type="button" class="btn-link" data-act="lot-del" data-i="${i}">Удалить</button></div></div>`).join('')}
    <button type="button" class="btn btn-outline btn-block" data-act="lot-add">${icon('plus')} Добавить партию</button>
    <p class="hint" style="margin-top:10px">Первой в процедуру подставляется верхняя действующая партия.</p>`;
  }
  if (kind === 'needles') {
    return `<div class="form-card">${field('Конфигурация и диаметр', `<input class="input" data-bind="name" value="${esc(d.name)}" placeholder="например, 1RL 0,30 мм" autocomplete="off">`, e.name)}${field('Примечание', `<input class="input" data-bind="note" value="${esc(d.note)}" autocomplete="off">`, '', 'необязательно')}${activeSwitch}</div>`;
  }
  if (kind === 'anesthetics') {
    return `<div class="form-card">
      ${field('Название', `<input class="input" data-bind="name" value="${esc(d.name)}" autocomplete="off">`, e.name)}
      <div class="field"><span class="field-label">Этап</span><div class="chips">${chip('Первичная', d.stage === 'primary', 'data-act="ref-stage" data-v="primary"')}${chip('Вторичная', d.stage === 'secondary', 'data-act="ref-stage" data-v="secondary"')}</div></div>
      ${field('Действующие вещества', `<input class="input" data-bind="substancesText" value="${esc(d.substancesText)}" placeholder="через запятую: лидокаин, прилокаин" autocomplete="off">`, '', 'для проверки аллергий')}
      ${activeSwitch}
    </div>`;
  }
  if (kind === 'zones') {
    return `<div class="form-card">
      ${field('Название', `<input class="input" data-bind="name" value="${esc(d.name)}" autocomplete="off">`, e.name)}
      <div class="field"><span class="field-label">Группа</span><div class="chips">${ZONE_GROUPS.map((g) => chip(g.label, d.group === g.id, `data-act="ref-group" data-v="${g.id}"`)).join('')}</div></div>
      ${field('Техники', `<input class="input" data-bind="techniquesText" value="${esc(d.techniquesText)}" placeholder="через запятую" autocomplete="off">`, '', 'через запятую')}
      <div class="switch-row"><div><div class="t">Напоминать об обновлении</div><div class="s">Через ${S.settings.updFrom}–${S.settings.updTo} месяцев после последней процедуры</div></div><input type="checkbox" class="switch" data-bind="update" ${d.update ? 'checked' : ''} aria-label="Напоминать об обновлении"></div>
    </div>`;
  }
  return `<div class="form-card">
    ${field('Название', `<input class="input" data-bind="name" value="${esc(d.name)}" autocomplete="off" placeholder="например, Пудровые брови · практика">`, e.name)}
    ${field('Дата начала', `<input class="input" type="date" data-bind="start" value="${esc(d.start)}">`)}
    ${field('Примечание', `<textarea class="textarea" data-bind="note">${esc(d.note)}</textarea>`, '', 'необязательно')}
  </div>`;
}

function openRefForm(kind, id) {
  const coll = S[REF_COLL[kind]];
  const src = id ? coll.find((x) => x.id === id) : null;
  const d = src ? deepClone(src) : blankRef(kind);
  if (kind === 'anesthetics') d.substancesText = d.substances.join(', ');
  if (kind === 'zones') d.techniquesText = d.techniques.join(', ');
  const used = src ? usageCount(kind, src.id) : 0;
  const sh = openSheet({
    errors: {},
    render: (s) => `${sheetHead(src ? REF_TITLES[kind][1] : REF_TITLES[kind][0], { right: 'Готово', rightAct: 'save' })}
      <div class="sheet-scroll">${refFormBody(kind, d, s.errors || {})}
        ${src ? `<p class="hint" style="margin-top:14px">${used ? `Используется: ${used}. Удалить нельзя, только убрать из выбора — история процедур не пострадает.` : 'Пока нигде не используется, можно удалить.'}</p>${!used ? '<button type="button" class="btn btn-danger btn-block" data-act="ref-del">Удалить</button>' : ''}` : ''}
      </div>
      <div class="sheet-foot"><button class="btn btn-primary" data-act="save">Сохранить</button></div>`,
    onInput(path, v) {
      if (path === 'price' || path === 'duration') { d[path] = parseMoney(v); return; }
      setPath(d, path, v);
    },
    onChange(path, v) {
      if (path === 'price' || path === 'duration') return;
      setPath(d, path, v);
      if (/^lots\.\d+\.exp$/.test(path) || path === 'hex') sh.update();
    },
    actions: {
      'ref-zone': (el) => {
        const z = el.dataset.v;
        d.zones = d.zones.includes(z) ? d.zones.filter((x) => x !== z) : d.zones.concat(z);
        if (kind === 'services' && d.zones.length !== 1) d.technique = '';
        sh.update();
      },
      'ref-type': (el) => { d.type = el.dataset.v; sh.update(); },
      'ref-tech': (el) => { d.technique = d.technique === el.dataset.v ? '' : el.dataset.v; sh.update(); },
      'ref-pkind': (el) => { d.kind = el.dataset.v; sh.update(); },
      'ref-stage': (el) => { d.stage = el.dataset.v; sh.update(); },
      'ref-group': (el) => { d.group = el.dataset.v; sh.update(); },
      'lot-add': () => { d.lots.unshift({ no: '', exp: addMonths(todayISO(), 12) }); sh.update(); },
      'lot-del': (el) => { d.lots.splice(Number(el.dataset.i), 1); sh.update(); },
      'ref-del': async () => {
        const ok = await confirmDialog({ title: 'Удалить из справочника?', text: esc(d.name || 'Без названия') });
        if (!ok) return;
        S[REF_COLL[kind]] = coll.filter((x) => x.id !== src.id);
        saveState();
        sh.close('ok');
        render();
        toast('Удалено');
      },
      save: () => {
        const e = {};
        if (!String(d.name || '').trim()) e.name = 'Укажите название';
        if (kind === 'services' && !d.zones.length) e.zones = 'Выберите хотя бы одну зону';
        if (kind === 'pigments' && !String(d.brand || '').trim()) e.brand = 'Укажите марку';
        sh.errors = e;
        if (Object.keys(e).length) { sh.update(); scrollToError(sh); return; }
        const rec = { ...d, name: String(d.name).trim() };
        if (kind === 'anesthetics') { rec.substances = String(d.substancesText || '').split(',').map(norm).filter(Boolean); delete rec.substancesText; }
        if (kind === 'zones') { rec.techniques = uniq(String(d.techniquesText || '').split(',').map((t) => cap(t.trim())).filter(Boolean)); delete rec.techniquesText; }
        if (kind === 'pigments') { rec.brand = String(d.brand).trim(); rec.lots = d.lots.filter((l) => String(l.no).trim()).map((l) => ({ no: String(l.no).trim(), exp: l.exp || '' })); }
        if (src) Object.assign(src, rec); else coll.push(rec);
        saveState();
        sh.close('ok');
        render();
        toast(src ? 'Сохранено' : 'Добавлено в справочник');
      },
    },
  });
}
