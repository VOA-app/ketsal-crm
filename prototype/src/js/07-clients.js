// Экраны «Клиенты» и «Карта клиента».

const SORT_LABEL = { name: 'По фамилии', card: 'По номеру карты', recent: 'По последнему визиту' };
const VIEW_HINT = {
  corr: () => `Окно коррекции: с ${S.settings.corrFrom} по ${S.settings.corrTo} день после первичной`,
  upd: () => `Прошло ${S.settings.updFrom}–${S.settings.lostAfter} ${plural(S.settings.lostAfter, 'месяц', 'месяца', 'месяцев')} с последней процедуры`,
  bday: () => 'Дни рождения в ближайшие 30 дней',
  models: () => 'Работали на моделях для обучения',
  lost: () => `Не были больше ${S.settings.lostAfter} месяцев`,
  noconsent: () => 'Нет подписанного согласия на обработку данных',
};
const VIEW_EMPTY = {
  corr: 'Сейчас никому не нужна коррекция',
  upd: 'Обновлять пока никому не нужно',
  bday: 'В ближайший месяц дней рождения нет',
  models: 'Моделей пока нет',
  lost: 'Все клиенты были недавно',
  noconsent: 'У всех есть согласие на обработку данных',
};

route((p) => !p.length || p[0] === 'clients', screenClients, { tab: 'clients' });
route((p) => p[0] === 'client' && !!p[1], screenClient);

function screenClients() {
  const hasLate = viewItems('corr').some((x) => x.it.state === 'late' && !recentlyReminded(x.c, x.it.key));
  const chips = CLIENT_VIEWS.map((v) => {
    const n = v.id === 'all' ? 0 : viewItems(v.id).length;
    const on = !UI.clientSearch.trim() && UI.clientView === v.id;
    return `<button type="button" role="tab" class="chip ${on ? 'on' : ''}" data-act="client-view" data-id="${v.id}" aria-selected="${on}">${v.id === 'corr' && hasLate ? '<span class="dot dot--alert" aria-hidden="true"></span>' : ''}${esc(v.label)}${n ? ` <span class="n">${n}</span>` : ''}</button>`;
  }).join('');
  return `<div class="screen">
    <header class="topbar">
      <div class="topbar-row"><h1 class="display title-lg">Клиенты</h1><div class="topbar-actions">${syncButton()}<button class="icon-btn" data-act="lock-now" aria-label="Заблокировать">${icon('lock')}</button></div></div>
      <label class="search">${icon('search', 'i-sm')}<input type="search" id="client-search" data-in="client-search" placeholder="Имя, телефон или № карты" value="${esc(UI.clientSearch)}" autocomplete="off" enterkeyhint="search" aria-label="Поиск клиентов"><button type="button" class="search-clear" data-act="client-search-clear" aria-label="Очистить поиск">${icon('close', 'i-sm')}</button></label>
      <div class="chips chips--scroll" id="client-views" role="tablist" aria-label="Списки клиентов">${chips}</div>
    </header>
    <div class="scroller"><div id="client-list">${clientListHtml()}</div></div>
    <button class="fab" data-act="new-client" aria-label="Новая карта">${icon('plus')}</button>
  </div>`;
}

function clientListHtml() {
  const q = UI.clientSearch.trim();
  if (q) {
    const res = searchClients(q);
    if (!res.length) {
      return `<div class="empty"><div class="display">Никого не нашли</div><p>Проверьте написание или заведите новую карту.</p><button class="btn btn-primary" data-act="new-client" data-prefill="${esc(q)}">${icon('plus')} Новая карта</button></div>`;
    }
    return `<div class="list-head"><span>Найдено: ${res.length}</span></div><div class="list">${res.map((x) => clientRow(x, 'all')).join('')}</div>`;
  }
  const view = UI.clientView;
  if (!S.clients.length) {
    return `<div class="empty"><div class="display">Пока никого нет</div><p>Первая карта получит № ${S.settings.nextCardNo}.</p><button class="btn btn-primary" data-act="new-client">${icon('plus')} Новая карта</button></div>`;
  }
  const items = viewItems(view);
  let head;
  let banner = '';
  if (view === 'all') {
    head = `<div class="list-head"><span>${pl(items.length, 'клиент', 'клиента', 'клиентов')}</span><button class="sort-btn" data-act="client-sort">${icon('sort')} ${SORT_LABEL[UI.clientSort]}</button></div>`;
    banner = backupBanner();
  } else {
    head = `<div class="list-head"><span>${esc(VIEW_HINT[view]())}</span></div>`;
  }
  if (!items.length) return `${head}<div class="empty"><p>${esc(VIEW_EMPTY[view])}</p></div>`;
  const rows = items.map((x) => {
    if (view === 'corr' || view === 'upd') return dueRow(x);
    if (view === 'bday') return bdayRow(x);
    if (view === 'lost') return lostRow(x);
    return clientRow(x, view);
  }).join('');
  return `${banner}${head}<div class="list">${rows}</div>`;
}

function backupDue() {
  const lb = S.settings.lastBackup;
  return !lb || daysBetween(lb, IDX.today) >= S.settings.backupEvery;
}
function backupBanner() {
  if (UI.backupBannerHidden || !backupDue() || !S.clients.length) return '';
  const lb = S.settings.lastBackup;
  const txt = lb ? `Резервной копии не было ${pl(daysBetween(lb, IDX.today), 'день', 'дня', 'дней')}` : 'Резервной копии ещё не было';
  return `<div class="banner">${icon('download')}<span>${esc(txt)}</span><button class="btn btn-sm btn-primary" data-act="go" data-to="/more/backup">Сделать</button><button class="icon-btn" data-act="hide-backup-banner" aria-label="Скрыть напоминание">${icon('close', 'i-sm')}</button></div>`;
}

function rowBadge(c, inf, view) {
  if (view === 'noconsent') return `<span class="pill"><span class="dot dot--ink"></span>${inf.consentMissing ? 'нет согласия' : 'нет согласия о здоровье'}</span>`;
  if (view === 'models') {
    const p = inf.done.find((x) => x.model && x.model.on);
    return p ? `<span class="pill pill--line">${esc(fmtDateShort(p.date))}</span>` : '';
  }
  const corr = inf.corr.find((x) => x.state !== 'soon') || inf.corr[0];
  if (corr) {
    const dot = corr.state === 'late' ? 'dot--alert' : corr.state === 'soon' ? 'dot--muted' : '';
    return `<span class="pill"><span class="dot ${dot}"></span>${corr.state === 'soon' ? 'Коррекция скоро' : 'Коррекция'}</span>`;
  }
  if (inf.upd.length) return '<span class="pill"><span class="dot"></span>Обновление</span>';
  if (inf.bday && inf.bday.inDays <= 7) {
    const when = inf.bday.inDays === 0 ? 'сегодня' : inf.bday.inDays === 1 ? 'завтра' : fmtDateShort(inf.bday.date);
    return `<span class="pill pill--line">ДР ${esc(when)}</span>`;
  }
  return '';
}

function clientSub(c, inf) {
  const bits = [`№${NBSP}${c.cardNo}`];
  if (inf.zones.length) bits.push(inf.zones.map((z) => lc(zoneName(z))).join(', '));
  bits.push(inf.last ? fmtDateShort(inf.last.date) : 'без процедур');
  return bits.join(' · ');
}

function clientRow({ c, inf }, view) {
  const side = rowBadge(c, inf, view);
  return `<button class="row" data-act="open-client" data-id="${c.id}">${avatarHtml(c)}<div class="row-main"><div class="row-title">${esc(fullName(c))}</div><div class="row-sub">${esc(clientSub(c, inf))}</div></div>${side ? `<div class="row-side">${side}</div>` : ''}</button>`;
}

function dueState(it) {
  if (it.kind === 'corr') {
    if (it.state === 'soon') return `окно с ${fmtDateShort(it.winFrom)}`;
    if (it.state === 'now') return `окно до ${fmtDateShort(it.winTo)}`;
    return `просрочена на ${pl(daysBetween(it.winTo, IDX.today), 'день', 'дня', 'дней')}`;
  }
  return `прошло ${pl(it.months, 'месяц', 'месяца', 'месяцев')}`;
}
const dueDot = (it) => (it.state === 'late' ? 'dot--alert' : it.state === 'soon' ? 'dot--muted' : '');

function dueRow({ c, it }) {
  const reminded = remindedAt(c, it.key);
  const sub = `${zoneName(it.zone)} · ${lc(TYPE_LABEL[it.proc.type])} ${fmtDateShort(it.proc.date)}`;
  return `<div class="row-wrap"><button class="row" data-act="open-client" data-id="${c.id}">${avatarHtml(c)}<div class="row-main"><div class="row-title">${esc(fullName(c))}</div><div class="row-sub">${esc(sub)}</div><div class="row-sub2"><span class="dot ${dueDot(it)}"></span> ${esc(dueState(it))}${reminded ? ` · напомнили ${esc(relDay(reminded))}` : ''}</div></div></button><button class="btn btn-secondary btn-sm row-act" data-act="message" data-id="${c.id}" data-kind="${it.kind}" data-key="${esc(it.key)}">Написать</button></div>`;
}

function bdayRow({ c, inf, it }) {
  const b = inf.bday;
  const reminded = remindedAt(c, it.key);
  const when = b.inDays === 0 ? 'сегодня' : b.inDays === 1 ? 'завтра' : `через ${pl(b.inDays, 'день', 'дня', 'дней')}`;
  return `<div class="row-wrap"><button class="row" data-act="open-client" data-id="${c.id}">${avatarHtml(c)}<div class="row-main"><div class="row-title">${esc(fullName(c))}</div><div class="row-sub">${esc(`${fmtDate(b.date, false)}, исполнится ${b.age}`)}</div><div class="row-sub2">${esc(when)}${reminded ? ' · поздравили' : ''}</div></div></button><button class="btn btn-secondary btn-sm row-act" data-act="message" data-id="${c.id}" data-kind="bday" data-key="${esc(it.key)}">Поздравить</button></div>`;
}

function lostRow({ c, inf, it }) {
  const reminded = remindedAt(c, it.key);
  const sub = `Последний визит ${fmtDate(inf.last.date, true)} · ${lc(zoneName(inf.last.zone))}`;
  return `<div class="row-wrap"><button class="row" data-act="open-client" data-id="${c.id}">${avatarHtml(c)}<div class="row-main"><div class="row-title">${esc(fullName(c))}</div><div class="row-sub">${esc(sub)}</div>${reminded ? `<div class="row-sub2">написали ${esc(relDay(reminded))}</div>` : ''}</div></button><button class="btn btn-secondary btn-sm row-act" data-act="message" data-id="${c.id}" data-kind="lost" data-key="${esc(it.key)}">Написать</button></div>`;
}

function refreshClientList() {
  const list = $('#client-list');
  if (list) list.innerHTML = clientListHtml();
  for (const b of $$('#client-views .chip')) {
    const on = !UI.clientSearch.trim() && b.dataset.id === UI.clientView;
    b.classList.toggle('on', on);
    b.setAttribute('aria-selected', String(on));
  }
}

INPUTS['client-search'] = (el) => {
  UI.clientSearch = el.value;
  refreshClientList();
};
ACTIONS['client-search-clear'] = () => {
  UI.clientSearch = '';
  const inp = $('#client-search');
  if (inp) { inp.value = ''; inp.focus(); }
  refreshClientList();
};
ACTIONS['client-view'] = (el) => {
  UI.clientView = el.dataset.id;
  UI.clientSearch = '';
  render();
  const sc = $('.scroller');
  if (sc) sc.scrollTop = 0;
};
ACTIONS['client-sort'] = async () => {
  const v = await actionSheet('Сортировка', Object.entries(SORT_LABEL).map(([value, label]) => ({ value, label, on: UI.clientSort === value })));
  if (!v) return;
  UI.clientSort = v;
  IDX.views.clear();
  render();
};
ACTIONS['hide-backup-banner'] = () => {
  UI.backupBannerHidden = true;
  render();
};
ACTIONS['open-client'] = (el) => go(`/client/${el.dataset.id}`);
ACTIONS['new-client'] = (el) => openClientForm({ prefill: el.dataset.prefill || '' });
ACTIONS.go = (el) => go(el.dataset.to);

// ── Карта клиента ──
function notFoundScreen(text) {
  return `<div class="screen">${navBar({ title: '' })}<div class="scroller"><div class="empty"><div class="display">${esc(text)}</div><p>Возможно, её удалили.</p></div></div></div>`;
}

function screenClient(r) {
  const c = IDX.client.get(r.parts[1]);
  if (!c) return notFoundScreen('Карта не найдена');
  const inf = clientInfo(c);
  const tab = UI.clientTab[c.id] || 'history';
  const tags = (c.tags || []).map((t) => `<span class="tag">${esc(t)}</span>`).join('');
  const tabs = [['history', 'История'], ['photos', 'Фото'], ['data', 'Данные']];
  let body;
  if (tab === 'photos') body = clientPhotos(c, inf);
  else if (tab === 'data') body = clientData(c, inf);
  else body = clientHistory(c, inf);
  return `<div class="screen">
    ${navBar({ title: `Карта № ${c.cardNo}`, right: `<button class="icon-btn icon-btn--accent" data-act="client-menu" data-id="${c.id}" aria-label="Действия с картой">${icon('dots')}</button>` })}
    <div class="scroller scroller--bar">
      <section class="profile">
        ${avatarHtml(c, 'avatar--xl')}
        <h1 class="display profile-name">${esc(fullName(c))}</h1>
        <div class="profile-meta">${esc(fmtPhone(c.phone))}${inf.first ? ` · с ${esc(fmtDate(inf.first.date, true))}` : ''}</div>
        ${tags ? `<div class="profile-tags">${tags}</div>` : ''}
        <div class="quick">
          <button data-act="call" data-id="${c.id}">${icon('phone')}Позвонить</button>
          <button data-act="message" data-id="${c.id}">${icon('message')}Написать</button>
          <button data-act="print-client" data-id="${c.id}">${icon('print')}PDF</button>
        </div>
      </section>
      ${clientAlerts(c, inf)}
      <div class="stats">
        <div class="stat"><div class="stat-v">${inf.visits}</div><div class="stat-l">${plural(inf.visits, 'визит', 'визита', 'визитов')}</div></div>
        <div class="stat"><div class="stat-v">${fmtMoney(inf.spent)}</div><div class="stat-l">потрачено</div></div>
        <div class="stat"><div class="stat-v">${inf.last ? fmtDateShort(inf.last.date) : '—'}</div><div class="stat-l">последний визит</div></div>
      </div>
      <div class="seg seg--card" role="tablist">${tabs.map(([id, l]) => `<button role="tab" class="${tab === id ? 'on' : ''}" aria-selected="${tab === id}" data-act="client-tab" data-id="${c.id}" data-tab="${id}">${l}</button>`).join('')}</div>
      <div id="client-tab">${body}</div>
    </div>
    <div class="bottom-bar"><button class="btn btn-primary btn-block" data-act="new-proc" data-id="${c.id}">${icon('plus')} Процедура</button></div>
  </div>`;
}

function noticeHtml(ic, text, btn, attrs) {
  return `<div class="notice">${icon(ic, 'i-sm')}<span>${esc(text)}</span><button class="btn btn-sm btn-secondary" ${attrs}>${esc(btn)}</button></div>`;
}

function reminderCard(c, it) {
  const p = it.proc;
  const reminded = remindedAt(c, it.key);
  const title = `${it.kind === 'corr' ? 'Коррекция' : 'Обновление'} · ${lc(zoneName(it.zone))}`;
  const sub = `${TYPE_LABEL[p.type]} ${fmtDate(p.date)}${p.technique ? ` · ${lc(p.technique)}` : ''}${it.kind === 'corr' ? ` · окно ${fmtDateShort(it.winFrom)} – ${fmtDateShort(it.winTo)}` : ''}`;
  return `<div class="rem rem--accent">
    <div class="rem-head"><span class="dot ${dueDot(it)}"></span><span>${esc(title)}</span><span class="rem-state">${esc(dueState(it))}</span></div>
    <div class="rem-sub">${esc(sub)}</div>
    ${reminded ? `<div class="rem-note">Напомнили ${esc(relDay(reminded))}</div>` : ''}
    <div class="rem-actions"><button class="btn btn-primary btn-sm" data-act="repeat" data-id="${c.id}" data-zone="${it.zone}">${icon('repeat')} Повторить как в прошлый раз</button><button class="btn btn-outline btn-sm" style="flex:0 0 auto;padding:0 12px" data-act="message" data-id="${c.id}" data-kind="${it.kind}" data-key="${esc(it.key)}" aria-label="Написать напоминание">${icon('message')}</button></div>
  </div>`;
}

function clientAlerts(c, inf) {
  const out = [];
  for (const it of [...inf.corr, ...inf.upd]) out.push(reminderCard(c, it));
  if (inf.bday && inf.bday.inDays <= 14) {
    const when = inf.bday.inDays === 0 ? 'сегодня' : inf.bday.inDays === 1 ? 'завтра' : fmtDate(inf.bday.date, false);
    out.push(noticeHtml('gift', `День рождения ${when}, исполнится ${inf.bday.age}`, 'Поздравить', `data-act="message" data-id="${c.id}" data-kind="bday" data-key="${esc(inf.bday.key)}"`));
  }
  const missing = [inf.consentMissing && 'на обработку данных', inf.procConsentMissing && inf.procs.length && 'на процедуру', inf.healthConsentMissing && 'на данные о здоровье'].filter(Boolean);
  if (missing.length) out.push(noticeHtml('doc', `Нет согласия ${missing.join(', ')}`, 'Добавить', `data-act="open-consents" data-id="${c.id}"`));
  if (inf.healthMissing) out.push(noticeHtml('health', 'Анкета здоровья не заполнена', 'Заполнить', `data-act="open-health" data-id="${c.id}"`));
  return out.length ? `<div class="alerts">${out.join('')}</div>` : '';
}

function procMaterialsShort(p) {
  const bits = p.pigments.filter((g) => g.pigmentId).map((g) => {
    const pg = IDX.pigment.get(g.pigmentId);
    return `<span><span class="swatch" style="background:${pg ? esc(pg.hex) : 'transparent'}"></span>${esc(pigmentLabel(g.pigmentId))}</span>`;
  });
  if (p.needles.length) bits.push(`<span>${esc(p.needles.map(needleName).join(', '))}</span>`);
  return bits.join('');
}

function procItem(p, withClient = false) {
  const c = IDX.client.get(p.clientId);
  const dim = p.status !== 'done';
  const mats = procMaterialsShort(p);
  const disc = discountAmount(p.price, p.discount);
  const title = withClient ? (c ? fullName(c) : 'Карта удалена') : serviceName(p.serviceId);
  const meta = [withClient ? serviceName(p.serviceId) : fmtDate(p.date, true), TYPE_LABEL[p.type], dim ? lc(STATUS_LABEL[p.status]) : null].filter(Boolean).join(' · ');
  return `<button class="proc-item ${dim ? 'proc-item--dim' : ''}" data-act="open-proc" data-id="${p.id}">
    <div class="proc-main"><div class="proc-title">${esc(title)}</div><div class="proc-meta">${esc(meta)}</div>${mats && !dim ? `<div class="proc-mat">${mats}</div>` : ''}</div>
    <div class="proc-sum">${dim ? '—' : fmtMoney(totalOf(p))}${disc && !dim ? `<small>скидка ${esc(discountText(p))}</small>` : ''}</div>
  </button>`;
}

function clientHistory(c, inf) {
  if (!inf.procs.length) return '<div class="empty"><p>Процедур пока нет.</p></div>';
  return `<div class="list">${inf.procs.map((p) => procItem(p)).join('')}</div>`;
}

function zonePhotos(c, zone) {
  const out = [];
  const procs = procsOf(c.id).filter((p) => p.zone === zone).slice().reverse();
  for (const p of procs) {
    for (const st of PHOTO_STAGES) {
      for (const id of (p.photos && p.photos[st.id]) || []) out.push({ id, p, stage: st.id });
    }
  }
  return out;
}

function clientPhotos(c) {
  const zones = uniq(procsOf(c.id).filter((p) => PHOTO_STAGES.some((st) => ((p.photos && p.photos[st.id]) || []).length)).map((p) => p.zone));
  if (!zones.length) return '<div class="empty"><p>Фото пока нет. Их добавляют в процедуре: до, сразу после и через месяц.</p></div>';
  const zone = zones.includes(UI.photoZone[c.id]) ? UI.photoZone[c.id] : zones[0];
  const items = zonePhotos(c, zone);
  const groups = [];
  items.forEach((x, i) => {
    let g = groups[groups.length - 1];
    if (!g || g.p.id !== x.p.id) { g = { p: x.p, items: [] }; groups.push(g); }
    g.items.push({ ...x, i });
  });
  return `<div class="chips" style="margin-bottom:12px">${zones.map((z) => chip(zoneName(z), z === zone, `data-act="photo-zone" data-id="${c.id}" data-zone="${z}"`)).join('')}</div>
    <button class="btn btn-secondary btn-sm" style="margin-bottom:16px" data-act="compare" data-id="${c.id}" data-zone="${zone}">${icon('compare')} Сравнить «до» и «через месяц»</button>
    ${groups.map((g) => `<div class="timeline-group"><div class="timeline-head"><b>${esc(fmtDate(g.p.date, true))}</b> · ${esc(TYPE_LABEL[g.p.type])}${g.p.technique ? ` · ${esc(lc(g.p.technique))}` : ''}</div>
      <div class="photo-grid">${g.items.map((x) => `<button class="ph" data-act="view-zone-photos" data-id="${c.id}" data-zone="${zone}" data-i="${x.i}"><img src="${photoSrc(x.id)}" alt="${esc(STAGE_LABEL[x.stage])}, ${esc(fmtDate(x.p.date, true))}" loading="lazy"><div class="ph-cap"><b>${esc(STAGE_LABEL[x.stage])}</b></div></button>`).join('')}</div></div>`).join('')}`;
}

function consentRow(label, cons, notNeeded, k) {
  const has = cons && cons.date;
  const photos = (cons && cons.photos) || [];
  let v;
  if (has) v = `${esc(fmtDate(cons.date, true))}${photos.length ? ` · <button class="btn-link" style="min-height:0" data-act="view-ids" data-ids="${esc(photos.join(','))}" data-cap="${esc(label)}">бланк</button>` : ''}`;
  else if (notNeeded) v = '<span class="muted">не требуется</span>';
  else v = '<span class="dot dot--alert"></span> нет';
  return `<div class="kv" data-consent="${k}"><span class="k">${esc(label)}</span><span class="v">${v}</span></div>`;
}

function healthBlock(c) {
  const h = c.health;
  if (!h || !h.filledAt) return '<div class="muted" style="font-size:15px">Не заполнена</div>';
  const marks = healthMarks(c);
  const head = `Заполнена ${fmtDate(h.filledAt, true)} · ${marks.length ? pl(marks.length, 'отметка', 'отметки', 'отметок') : 'отметок нет'}`;
  if (!marks.length) return `<div style="font-size:15px">${esc(head)}</div>`;
  if (!UI.healthShown[c.id]) {
    return `<div style="display:flex;align-items:center;justify-content:space-between;gap:12px"><span style="font-size:15px">${esc(head)}</span><button class="btn btn-sm btn-secondary" data-act="show-health" data-id="${c.id}">${icon('eye', 'i-sm')} Показать</button></div>`;
  }
  return `<div style="font-size:15px;margin-bottom:8px">${esc(head)}</div><ul style="margin:0;padding-left:20px;font-size:15px">${marks.map((m) => `<li>${esc(m)}</li>`).join('')}</ul><button class="btn-link" data-act="show-health" data-id="${c.id}">Скрыть</button>`;
}

function clientData(c, inf) {
  const ct = c.contact && c.contact.kind !== 'phone' ? `${CONTACT_LABEL[c.contact.kind]}${c.contact.handle ? `: ${c.contact.handle}` : ''}` : 'только звонок';
  const cons = c.consents || {};
  return `
    <div class="section-title" style="margin-top:4px">Контакты и данные <button class="btn-link" data-act="edit-client" data-id="${c.id}">Изменить</button></div>
    <div class="card">
      ${kv('ФИО', esc(formalName(c)))}
      ${kv('Телефон', esc(fmtPhone(c.phone)))}
      ${kv('Где переписываемся', esc(ct))}
      ${kv('Дата рождения', c.birth ? esc(`${fmtDate(c.birth, true)}, ${pl(ageOn(c.birth), 'год', 'года', 'лет')}`) : '—')}
      ${kv('Откуда пришла', esc(c.source || '—'))}
      ${kv('Первый визит', inf.first ? esc(fmtDate(inf.first.date, true)) : '—')}
      ${c.notes ? `<div class="kv" style="display:block"><div class="k" style="margin-bottom:4px">Заметки</div><div style="white-space:pre-wrap">${esc(c.notes)}</div></div>` : ''}
    </div>
    <div class="section-title">Согласия <button class="btn-link" data-act="open-consents" data-id="${c.id}">Изменить</button></div>
    <div class="card">${consentRow('На обработку данных', cons.pd, false, 'pd')}${consentRow('На процедуру', cons.procedure, false, 'procedure')}${consentRow('На данные о здоровье', cons.health, !hasHealthData(c), 'health')}</div>
    <div class="section-title">Анкета здоровья <button class="btn-link" data-act="open-health" data-id="${c.id}">${c.health && c.health.filledAt ? 'Изменить' : 'Заполнить'}</button></div>
    <div class="card">${healthBlock(c)}</div>
    <div class="section-title">Итоги</div>
    <div class="card">${kv('Процедур', String(inf.visits))}${kv('Потрачено', fmtMoney(inf.spent))}${kv('Скидки', fmtMoney(inf.discounts))}${kv('Средний чек', inf.visits ? fmtMoney(Math.round(inf.spent / inf.visits)) : '—')}</div>
    <div class="btn-stack" style="margin-top:18px">
      <button class="btn btn-outline" data-act="print-client" data-id="${c.id}">${icon('print')} Печать и PDF карты</button>
      <button class="btn btn-danger" data-act="purge-client" data-id="${c.id}">${icon('trash')} Удалить карту полностью</button>
    </div>`;
}

ACTIONS['client-tab'] = (el) => {
  UI.clientTab[el.dataset.id] = el.dataset.tab;
  render();
};
ACTIONS['photo-zone'] = (el) => {
  UI.photoZone[el.dataset.id] = el.dataset.zone;
  render();
};
ACTIONS['show-health'] = (el) => {
  UI.healthShown[el.dataset.id] = !UI.healthShown[el.dataset.id];
  render();
};
ACTIONS['client-menu'] = async (el) => {
  const id = el.dataset.id;
  const v = await actionSheet('', [
    { value: 'edit', label: 'Изменить данные', icon: 'edit' },
    { value: 'health', label: 'Анкета здоровья', icon: 'health' },
    { value: 'consents', label: 'Согласия', icon: 'doc' },
    { value: 'print', label: 'Печать и PDF карты', icon: 'print' },
    { value: 'purge', label: 'Удалить карту полностью', icon: 'trash', danger: true },
  ]);
  if (v === 'edit') openClientForm({ clientId: id });
  else if (v === 'health') openHealthForm(id);
  else if (v === 'consents') openConsentsForm(id);
  else if (v === 'print') openPrint(id);
  else if (v === 'purge') purgeFlow(id);
};
ACTIONS['edit-client'] = (el) => openClientForm({ clientId: el.dataset.id });
ACTIONS['open-health'] = (el) => openHealthForm(el.dataset.id);
ACTIONS['open-consents'] = (el) => openConsentsForm(el.dataset.id);
ACTIONS['print-client'] = (el) => openPrint(el.dataset.id);
ACTIONS['purge-client'] = (el) => purgeFlow(el.dataset.id);
ACTIONS.call = (el) => {
  const c = IDX.client.get(el.dataset.id);
  demoExternal(`Здесь начнётся звонок на ${fmtPhone(c.phone)}. В заглушке номера выдуманные`);
};
ACTIONS.message = (el) => {
  const c = IDX.client.get(el.dataset.id);
  if (c) openMessage(c, el.dataset.kind || '', el.dataset.key || '');
};
ACTIONS['new-proc'] = (el) => openProcForm({ clientId: el.dataset.id });
ACTIONS.repeat = (el) => openProcForm({ clientId: el.dataset.id, draft: repeatDraft(el.dataset.id, el.dataset.zone) });

ACTIONS['view-zone-photos'] = (el) => {
  const c = IDX.client.get(el.dataset.id);
  const items = zonePhotos(c, el.dataset.zone).map((x) => ({ src: photoSrc(x.id), title: STAGE_LABEL[x.stage], sub: `${fmtDate(x.p.date, true)} · ${TYPE_LABEL[x.p.type]} · ${zoneName(x.p.zone)}` }));
  openViewer(items, Number(el.dataset.i) || 0);
};
ACTIONS['view-ids'] = (el) => {
  const ids = el.dataset.ids.split(',').filter(Boolean);
  openViewer(ids.map((id, i) => ({ src: photoSrc(id), title: el.dataset.cap || 'Фото', sub: ids.length > 1 ? `${i + 1} из ${ids.length}` : '' })), 0);
};
ACTIONS.compare = (el) => {
  const c = IDX.client.get(el.dataset.id);
  const items = zonePhotos(c, el.dataset.zone);
  const withMonth = items.filter((x) => x.stage === 'month').pop();
  let a;
  let b;
  if (withMonth) {
    a = items.find((x) => x.p.id === withMonth.p.id && x.stage === 'before') || items.find((x) => x.stage === 'before');
    b = withMonth;
  } else {
    a = items.find((x) => x.stage === 'before');
    b = items.filter((x) => x.stage !== 'before').pop();
  }
  if (!a || !b) { toast('Для сравнения нужно фото «до» и хотя бы одно фото после'); return; }
  const cap = (x) => ({ src: photoSrc(x.id), title: STAGE_LABEL[x.stage], sub: `${x.stage === 'before' ? '' : 'после процедуры '}${fmtDate(x.p.date, true)}` });
  openCompare(cap(a), cap(b));
};

async function purgeFlow(id) {
  const c = IDX.client.get(id);
  if (!c) return;
  const n = procsOf(c.id).length;
  const ok = await confirmDialog({
    title: 'Удалить карту полностью?',
    text: `Удалятся карта № ${c.cardNo}, ${pl(n, 'процедура', 'процедуры', 'процедур')} и все фото, в том числе с Яндекс Диска. Вернуть будет нельзя. Так выполняется просьба клиентки удалить её данные.`,
    ok: 'Удалить навсегда',
    requireWord: 'удалить',
  });
  if (!ok) return;
  for (const p of procsOf(c.id)) {
    for (const st of PHOTO_STAGES) ((p.photos && p.photos[st.id]) || []).forEach((ph) => PhotoDB.del(ph));
    const cert = S.certificates.find((x) => x.usedProcId === p.id);
    if (cert) cert.usedProcId = 'deleted';
  }
  const cons = c.consents || {};
  [c.facePhoto, ...((cons.pd && cons.pd.photos) || []), ...((cons.procedure && cons.procedure.photos) || [])].forEach((ph) => PhotoDB.del(ph));
  S.procedures = S.procedures.filter((p) => p.clientId !== c.id);
  S.clients = S.clients.filter((x) => x.id !== c.id);
  saveState();
  closeAllSheets();
  navStack.length = 0;
  UI.tab = 'clients';
  goReplace('/clients');
  toast(`Карта № ${c.cardNo} удалена полностью`);
}
