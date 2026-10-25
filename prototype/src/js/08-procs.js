// Экраны «Процедуры» (журнал) и «Процедура» (подробно).

const PROC_PERIODS = [
  { id: 'today', label: 'Сегодня' },
  { id: 'week', label: '7 дней' },
  { id: 'month', label: 'Этот месяц' },
  { id: 'prev', label: 'Прошлый месяц' },
  { id: 'all', label: 'Все' },
];

route((p) => p[0] === 'procedures', screenProcedures, { tab: 'procedures' });
route((p) => p[0] === 'proc' && !!p[1], screenProc);

function procPeriodRange(id) {
  const T = IDX.today;
  if (id === 'today') return [T, T];
  if (id === 'week') return [addDays(T, -6), T];
  if (id === 'month') return [startOfMonth(T), endOfMonth(T)];
  if (id === 'prev') {
    const m = addMonths(startOfMonth(T), -1);
    return [m, endOfMonth(m)];
  }
  return ['0000-01-01', '9999-12-31'];
}

function screenProcedures() {
  return `<div class="screen">
    <header class="topbar">
      <div class="topbar-row"><h1 class="display title-lg">Процедуры</h1><div class="topbar-actions">${syncButton()}</div></div>
      <label class="search">${icon('search', 'i-sm')}<input type="search" id="proc-search" data-in="proc-search" placeholder="Клиент, услуга или пигмент" value="${esc(UI.procSearch)}" autocomplete="off" enterkeyhint="search" aria-label="Поиск по процедурам"><button type="button" class="search-clear" data-act="proc-search-clear" aria-label="Очистить поиск">${icon('close', 'i-sm')}</button></label>
      <div class="chips chips--scroll" role="tablist" aria-label="Период">${PROC_PERIODS.map((p) => chip(p.label, UI.procPeriod === p.id, `data-act="proc-period" data-id="${p.id}" role="tab"`)).join('')}</div>
    </header>
    <div class="scroller"><div id="proc-list">${procListHtml()}</div></div>
    <button class="fab" data-act="new-proc-pick" aria-label="Новая процедура">${icon('plus')}</button>
  </div>`;
}

function procListHtml() {
  const [a, b] = procPeriodRange(UI.procPeriod);
  const words = norm(UI.procSearch).split(/\s+/).filter(Boolean);
  let list = S.procedures.filter((p) => p.date >= a && p.date <= b);
  if (words.length) {
    list = list.filter((p) => {
      const c = IDX.client.get(p.clientId);
      const hay = norm(`${c ? `${c.firstName} ${c.lastName}` : ''} ${serviceName(p.serviceId)} ${zoneName(p.zone)} ${p.technique} ${p.pigments.map((g) => `${pigmentFull(g.pigmentId)} ${g.lot}`).join(' ')} ${p.note}`);
      return words.every((w) => hay.includes(w));
    });
  }
  list.sort(byDateDesc);
  const done = list.filter((p) => p.status === 'done');
  const missed = list.length - done.length;
  const disc = sum(done, (p) => discountAmount(p.price, p.discount));
  const summary = `<div class="card card--mint" style="margin:6px 0 4px">
    <div style="display:flex;justify-content:space-between;align-items:baseline;gap:12px"><span style="font-weight:600">${pl(done.length, 'процедура', 'процедуры', 'процедур')}</span><span style="font-size:22px;font-weight:600">${fmtMoney(sum(done, totalOf))}</span></div>
    <div class="note" style="margin-top:2px">Скидки ${fmtMoney(disc)}${missed ? ` · не пришли или отменили: ${missed}` : ''}</div>
  </div>`;
  if (!list.length) {
    const txt = words.length ? 'Ничего не нашли' : UI.procPeriod === 'today' ? 'Сегодня процедур пока нет' : 'За этот период процедур нет';
    return `${summary}<div class="empty"><p>${txt}</p><button class="btn btn-primary" data-act="new-proc-pick">${icon('plus')} Новая процедура</button></div>`;
  }
  const groups = [];
  for (const p of list) {
    let g = groups[groups.length - 1];
    if (!g || g.date !== p.date) { g = { date: p.date, items: [] }; groups.push(g); }
    g.items.push(p);
  }
  return summary + groups.map((g) => `<div class="section-title"><span>${esc(dayHeader(g.date))}</span><span class="num">${fmtMoney(sum(g.items.filter((p) => p.status === 'done'), totalOf))}</span></div><div class="list">${g.items.map((p) => procItem(p, true)).join('')}</div>`).join('');
}

INPUTS['proc-search'] = (el) => {
  UI.procSearch = el.value;
  const box = $('#proc-list');
  if (box) box.innerHTML = procListHtml();
};
ACTIONS['proc-search-clear'] = () => {
  UI.procSearch = '';
  const inp = $('#proc-search');
  if (inp) { inp.value = ''; inp.focus(); }
  $('#proc-list').innerHTML = procListHtml();
};
ACTIONS['proc-period'] = (el) => {
  UI.procPeriod = el.dataset.id;
  render();
  const sc = $('.scroller');
  if (sc) sc.scrollTop = 0;
};
ACTIONS['open-proc'] = (el) => go(`/proc/${el.dataset.id}`);
ACTIONS['new-proc-pick'] = () => openClientPicker((clientId) => openProcForm({ clientId }));

// ── Процедура подробно ──
function certPayText(cert, total) {
  const diff = total - cert.amount;
  if (diff > 0) return `номинал ${fmtMoney(cert.amount)}, доплата ${fmtMoney(diff)}`;
  if (diff < 0) return `номинал ${fmtMoney(cert.amount)}, больше суммы на ${fmtMoney(-diff)}`;
  return `номинал ${fmtMoney(cert.amount)}`;
}

function photoStageView(p, st) {
  const ids = (p.photos && p.photos[st.id]) || [];
  return `<div class="photo-stage"><div class="photo-stage-label"><span>${st.label}</span></div><div class="photo-strip">${ids.map((id, i) => `<button class="thumb" data-act="view-proc-photos" data-id="${p.id}" data-stage="${st.id}" data-i="${i}"><img src="${photoSrc(id)}" alt="${esc(st.label)}"></button>`).join('')}<button class="photo-add" data-act="quick-photo" data-id="${p.id}" data-stage="${st.id}" aria-label="Добавить фото: ${esc(st.label)}">${icon('camera')}</button></div></div>`;
}

function screenProc(r) {
  const p = IDX.proc.get(r.parts[1]);
  if (!p) return notFoundScreen('Процедура не найдена');
  const c = IDX.client.get(p.clientId);
  const pg = p.pigments.filter((g) => g.pigmentId);
  const disc = discountAmount(p.price, p.discount);
  const cert = p.certificateId ? IDX.cert.get(p.certificateId) : null;
  const anRows = [['Первичная', p.anesthesia.primary], ['Вторичная', p.anesthesia.secondary]].filter(([, id]) => id)
    .map(([l, id]) => `<div style="padding:3px 0"><span class="muted" style="font-size:13px">${l}</span><div>${esc(anestName(id))}</div></div>`).join('');
  const an = anRows || '<span class="muted">без анестезии</span>';
  const pigHtml = pg.length ? pg.map((g) => {
    const x = IDX.pigment.get(g.pigmentId);
    const lot = lotInfo(g.pigmentId, g.lot);
    return `<div style="display:flex;gap:10px;align-items:center;padding:5px 0"><span class="swatch" style="background:${x ? esc(x.hex) : 'transparent'}"></span><div style="flex:1;min-width:0"><div>${esc(pigmentFull(g.pigmentId))}</div><div class="muted" style="font-size:13px">Партия ${esc(g.lot || '—')}${lot && lot.exp ? ` · годна до ${fmtMonthNum(lot.exp)}` : ''}${g.ratio ? ` · ${esc(g.ratio)}` : ''}</div></div></div>`;
  }).join('') : '<span class="muted">не указаны</span>';
  return `<div class="screen">
    ${navBar({ title: 'Процедура', right: `<button class="icon-btn icon-btn--accent" data-act="edit-proc" data-id="${p.id}" aria-label="Изменить процедуру">${icon('edit')}</button>` })}
    <div class="scroller">
      ${c ? `<div class="list" style="margin:4px 0 16px"><button class="row" data-act="open-client" data-id="${c.id}">${avatarHtml(c, 'avatar--sm')}<div class="row-main"><div class="row-title">${esc(fullName(c))}</div><div class="row-sub">Карта № ${c.cardNo} · ${esc(fmtPhone(c.phone))}</div></div>${icon('chev', 'row-chev')}</button></div>` : ''}
      <h1 class="display" style="font-size:30px;line-height:1.1;font-weight:400">${esc(serviceName(p.serviceId))}</h1>
      <div class="profile-meta" style="text-align:left;margin-top:6px">${esc([fmtDate(p.date, true), TYPE_LABEL[p.type], zoneName(p.zone), p.technique].filter(Boolean).join(' · '))}</div>
      ${p.status !== 'done' || (p.model && p.model.on) ? `<div class="chips" style="margin-top:10px">${p.status !== 'done' ? `<span class="pill"><span class="dot dot--muted"></span>${esc(STATUS_LABEL[p.status])}</span>` : ''}${p.model && p.model.on ? `<span class="pill pill--line">Модель · ${esc(courseName(p.model.courseId))}</span>` : ''}</div>` : ''}
      <div class="section-title">Материалы</div>
      <div class="card">
        <div class="kv" style="display:block"><div class="k" style="margin-bottom:2px">Анестезия</div>${an}</div>
        <div class="kv" style="display:block"><div class="k" style="margin-bottom:4px">${p.type === 'removal' ? 'Ремувер' : 'Пигменты'}</div>${pigHtml}</div>
        ${kv('Игла', esc(p.needles.map(needleName).join(', ') || '—'))}
      </div>
      <div class="section-title">Фото</div>
      <div class="card">${PHOTO_STAGES.map((st) => photoStageView(p, st)).join('')}</div>
      <div class="section-title">Заживление <button class="btn-link" data-act="edit-healing" data-id="${p.id}">${p.healing && p.healing.status ? 'Изменить' : 'Заполнить'}</button></div>
      <div class="card">${p.healing && p.healing.status ? `<div style="font-weight:500">${esc(HEALING_LABEL[p.healing.status])}</div>${p.healing.note ? `<div class="note">${esc(p.healing.note)}</div>` : ''}` : '<span class="muted" style="font-size:15px">Заполняется на коррекции, когда видно, как зажило</span>'}</div>
      <div class="section-title">Оплата</div>
      <div class="card">
        ${kv('Стоимость', fmtMoney(p.price))}
        ${kv('Скидка', disc ? `−${fmtMoney(disc)}${p.discount.mode === 'pct' ? ` (${p.discount.value}${NBSP}%)` : ''}${p.discount.reason ? ` · ${esc(p.discount.reason)}` : ''}` : 'нет')}
        ${kv('Итого', fmtMoney(totalOf(p)), 'kv--total')}
        ${kv('Способ оплаты', `${esc(PAYMENT_LABEL[p.payment] || '—')}${cert ? ` № ${esc(cert.no)}` : ''}`)}
        ${cert ? kv('Сертификат', esc(certPayText(cert, totalOf(p)))) : ''}
      </div>
      ${p.note ? `<div class="section-title">Примечание</div><div class="card" style="font-size:15px;white-space:pre-wrap">${esc(p.note)}</div>` : ''}
      <div class="btn-stack" style="margin-top:18px">
        <button class="btn btn-secondary" data-act="repeat-proc" data-id="${p.id}">${icon('repeat')} Повторить как в прошлый раз</button>
        <button class="btn btn-danger" data-act="delete-proc" data-id="${p.id}">${icon('trash')} Удалить процедуру</button>
      </div>
    </div>
  </div>`;
}

ACTIONS['edit-proc'] = (el) => openProcForm({ procId: el.dataset.id });
ACTIONS['repeat-proc'] = (el) => {
  const p = IDX.proc.get(el.dataset.id);
  openProcForm({ clientId: p.clientId, draft: repeatDraft(p.clientId, p.zone, p.id) });
};
ACTIONS['view-proc-photos'] = (el) => {
  const p = IDX.proc.get(el.dataset.id);
  const items = [];
  let start = 0;
  for (const st of PHOTO_STAGES) {
    ((p.photos && p.photos[st.id]) || []).forEach((id, i) => {
      if (st.id === el.dataset.stage && i === Number(el.dataset.i)) start = items.length;
      items.push({ src: photoSrc(id), title: st.label, sub: `${fmtDate(p.date, true)} · ${serviceName(p.serviceId)}` });
    });
  }
  openViewer(items, start);
};
ACTIONS['quick-photo'] = (el) => {
  const p = IDX.proc.get(el.dataset.id);
  const stage = el.dataset.stage;
  pickPhotos((ids) => {
    p.photos = p.photos || { before: [], after: [], month: [] };
    p.photos[stage] = (p.photos[stage] || []).concat(ids);
    saveState();
    render();
    toast(ids.length > 1 ? `Добавлено фото: ${ids.length}` : `Фото «${lc(STAGE_LABEL[stage])}» добавлено`);
  });
};
ACTIONS['edit-healing'] = (el) => openHealingForm(el.dataset.id);
ACTIONS['delete-proc'] = async (el) => {
  const p = IDX.proc.get(el.dataset.id);
  const ok = await confirmDialog({ title: 'Удалить процедуру?', text: `${esc(serviceName(p.serviceId))}, ${esc(fmtDate(p.date, true))}. Фото этой процедуры тоже удалятся.` });
  if (!ok) return;
  const snapshot = deepClone(p);
  const idx = S.procedures.indexOf(p);
  const cert = S.certificates.find((x) => x.usedProcId === p.id);
  const certSnap = cert ? { id: cert.id, usedProcId: cert.usedProcId, usedAt: cert.usedAt } : null;
  S.procedures.splice(idx, 1);
  if (cert) { cert.usedProcId = ''; cert.usedAt = ''; }
  saveState();
  goBack(`/client/${p.clientId}`);
  toast('Процедура удалена', {
    action: 'Вернуть',
    onAction: () => {
      S.procedures.splice(Math.min(idx, S.procedures.length), 0, snapshot);
      if (certSnap) {
        const x = S.certificates.find((cc) => cc.id === certSnap.id);
        if (x) Object.assign(x, certSnap);
      }
      saveState();
      render();
      toast('Процедура возвращена');
    },
  });
  setTimeout(() => {
    if (!S.procedures.some((x) => x.id === snapshot.id)) {
      for (const st of PHOTO_STAGES) ((snapshot.photos && snapshot.photos[st.id]) || []).forEach((ph) => PhotoDB.del(ph));
    }
  }, 6000);
};
