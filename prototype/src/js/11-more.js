// «Ещё»: отчёты, сертификаты, резервная копия и выгрузка, настройки, синхронизация.

route((p) => p[0] === 'more' && !p[1], screenMore, { tab: 'more' });
route((p) => p[0] === 'more' && p[1] === 'reports', screenReports, { tab: 'more', after: bindChart });
route((p) => p[0] === 'more' && p[1] === 'certificates', screenCertificates, { tab: 'more' });
route((p) => p[0] === 'more' && p[1] === 'backup', screenBackup, { tab: 'more' });
route((p) => p[0] === 'more' && p[1] === 'settings', screenSettings, { tab: 'more' });
route((p) => p[0] === 'more' && p[1] === 'guide', screenGuide, { tab: 'more' });
route((p) => p[0] === 'more' && p[1] === 'expenses', screenExpenses, { tab: 'more' });

function menuItem(ic, title, sub, to) {
  return `<button class="menu-item" data-act="go" data-to="${to}">${icon(ic)}<span class="t">${esc(title)}${sub ? `<span class="s" style="display:block">${esc(sub)}</span>` : ''}</span>${icon('chev', 'row-chev')}</button>`;
}

function screenMore() {
  const active = S.certificates.filter((x) => certStatus(x) === 'active').length;
  const lb = S.settings.lastBackup;
  const checks = guideChecks();
  const total = GUIDE.reduce((n, g) => n + g.items.length, 0);
  const done = GUIDE.reduce((n, g) => n + g.items.filter((it) => checks[it.id]).length, 0);
  return `<div class="screen">
    <header class="topbar"><div class="topbar-row"><h1 class="display title-lg">Ещё</h1></div></header>
    <div class="scroller">
      <div class="sync-card">${icon('cloud')}<div style="flex:1;min-width:0"><div class="t">Яндекс Диск</div><div class="s" data-sync-text>${esc(syncText())}</div></div><button class="btn btn-sm btn-secondary" data-act="sync">Подробнее</button></div>
      <div class="menu">
        ${menuItem('chart', 'Отчёты', 'Выручка, расходники, услуги, скидки', '/more/reports')}
        ${menuItem('box', 'Расходники', `В этом месяце: ${fmtMoney(sum(S.expenses.filter((e) => e.date.slice(0, 7) === IDX.today.slice(0, 7)), (e) => e.amount))}`, '/more/expenses')}
        ${menuItem('gift', 'Сертификаты', `Действует: ${active}`, '/more/certificates')}
        ${menuItem('download', 'Резервная копия и выгрузка', lb ? `Последняя копия ${relDay(lb)}` : 'Копий ещё не было', '/more/backup')}
        ${menuItem('sliders', 'Настройки', 'Напоминания, вход, шаблоны сообщений', '/more/settings')}
      </div>
      <div class="menu">
        ${menuItem('list', 'Сценарии для проверки', `Отмечено ${done} из ${total}`, '/more/guide')}
        <button class="menu-item" data-act="lock-now">${icon('lock')}<span class="t">Заблокировать</span></button>
      </div>
      <div class="about">Кетсаль · учёт клиентов<br>Заглушка для проверки сценариев, версия 0.1<br>Данные хранятся только в этом браузере</div>
    </div>
  </div>`;
}

// ── Отчёты ──
function niceMax(v) {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  const n = v / p;
  const m = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
  return m * p;
}

function columnChart(series, selYm) {
  const W = 340;
  const H = 176;
  const L = 36;
  const R = 4;
  const T = 18;
  const B = 22;
  const top = niceMax(Math.max(...series.map((s) => s.revenue), 1));
  const y = (v) => T + (H - T - B) * (1 - v / top);
  const band = (W - L - R) / series.length;
  const bw = Math.min(16, band * 0.6);
  let g = '';
  for (const t of [0, top / 2, top]) {
    g += `<line x1="${L}" x2="${W - R}" y1="${y(t).toFixed(1)}" y2="${y(t).toFixed(1)}" stroke="var(--grid)" stroke-width="1"/><text x="${L - 6}" y="${(y(t) + 3.5).toFixed(1)}" text-anchor="end">${t ? esc(fmtMoneyShort(t)) : '0'}</text>`;
  }
  let bars = '';
  series.forEach((s, i) => {
    const x = L + band * i + (band - bw) / 2;
    const cx = x + bw / 2;
    const base = y(0);
    const tp = y(s.revenue);
    const h = base - tp;
    const sel = selYm ? s.ym === selYm : true;
    bars += `<rect class="hit" x="${(L + band * i).toFixed(1)}" y="${T}" width="${band.toFixed(1)}" height="${H - T - B}" data-i="${i}" tabindex="0" role="img" aria-label="${esc(`${MONTHS_NOM[parseISO(s.iso).getMonth()]} ${s.year}: ${fmtMoney(s.revenue)}`)}"/>`;
    if (h > 0.5) {
      const r = Math.min(4, bw / 2, h);
      bars += `<path class="col" style="fill:${sel ? 'var(--bar)' : 'var(--bar-muted)'};pointer-events:none" d="M${x.toFixed(1)} ${base.toFixed(1)}V${(tp + r).toFixed(1)}Q${x.toFixed(1)} ${tp.toFixed(1)} ${(x + r).toFixed(1)} ${tp.toFixed(1)}H${(x + bw - r).toFixed(1)}Q${(x + bw).toFixed(1)} ${tp.toFixed(1)} ${(x + bw).toFixed(1)} ${(tp + r).toFixed(1)}V${base.toFixed(1)}Z"/>`;
    }
    if (selYm && s.ym === selYm) bars += `<text class="val" x="${cx.toFixed(1)}" y="${(tp - 6).toFixed(1)}" text-anchor="middle">${esc(fmtMoneyShort(s.revenue))}</text>`;
    bars += `<text x="${cx.toFixed(1)}" y="${H - 6}" text-anchor="middle">${esc(s.label)}</text>`;
  });
  return `<div class="chart" data-series="${esc(JSON.stringify(series))}"><svg viewBox="0 0 ${W} ${H}" aria-label="Выручка по месяцам">${g}${bars}</svg><div class="chart-tip" aria-hidden="true"></div></div>`;
}

function seriesTable(series) {
  return `<table class="chart-table"><thead><tr><th>Месяц</th><th>Процедур</th><th>Выручка</th><th>Расходники</th></tr></thead><tbody>${series.slice().reverse().map((s) => `<tr><td>${esc(`${cap(MONTHS_NOM[parseISO(s.iso).getMonth()])} ${s.year}`)}</td><td>${s.count}</td><td>${fmtMoney(s.revenue)}</td><td>${fmtMoney(s.expenses)}</td></tr>`).join('')}</tbody></table>`;
}

function bindChart() {
  const chart = $('.chart');
  if (!chart) return;
  const series = JSON.parse(chart.dataset.series);
  const tip = $('.chart-tip', chart);
  const card = chart.closest('.chart-card');
  const show = (el) => {
    const s = series[Number(el.dataset.i)];
    tip.innerHTML = `<b>${esc(fmtMoney(s.revenue))}</b>${esc(`${cap(MONTHS_NOM[parseISO(s.iso).getMonth()])} ${s.year} · ${pl(s.count, 'процедура', 'процедуры', 'процедур')}`)}<br>${esc(`расходники ${fmtMoney(s.expenses)}`)}`;
    tip.classList.add('show');
    const r = el.getBoundingClientRect();
    const cr = card.getBoundingClientRect();
    const left = clamp(r.left - cr.left + r.width / 2 - tip.offsetWidth / 2, 4, cr.width - tip.offsetWidth - 4);
    tip.style.left = `${left}px`;
    tip.style.top = '6px';
  };
  const hide = () => tip.classList.remove('show');
  for (const el of $$('.hit', chart)) {
    el.addEventListener('pointerenter', () => show(el));
    el.addEventListener('pointerdown', () => show(el));
    el.addEventListener('focus', () => show(el));
    el.addEventListener('pointerleave', hide);
    el.addEventListener('blur', hide);
  }
}

function hbarsCard(title, rows, empty = 'Нет данных за период') {
  const max = Math.max(1, ...rows.map((r) => r.value));
  const body = rows.length
    ? `<div class="hbars">${rows.map((r) => `<div class="hbar"><div class="hbar-top"><span>${esc(r.label)}</span><span class="num">${r.text}</span></div><div class="hbar-track"><div class="hbar-fill" style="width:${((r.value / max) * 100).toFixed(1)}%"></div></div></div>`).join('')}</div>`
    : `<div class="muted" style="font-size:14px">${esc(empty)}</div>`;
  return `<div class="section-title">${esc(title)}</div><div class="card">${body}</div>`;
}

function screenReports() {
  const mode = UI.reportMode;
  const cur = UI.reportCursor;
  const R = reportData(mode, cur);
  const prevCur = mode === 'month' ? addMonths(cur, -1) : addMonths(cur, -12);
  const P = reportData(mode, prevCur);
  const T = IDX.today;
  const isLast = mode === 'month' ? cur.slice(0, 7) >= T.slice(0, 7) : cur.slice(0, 4) >= T.slice(0, 4);
  const series = mode === 'year' ? monthlySeries(`${cur.slice(0, 4)}-12-01`, 12) : monthlySeries(cur, 12);
  let delta = '';
  if (P.revenue > 0) {
    const pct = Math.round(((R.revenue - P.revenue) / P.revenue) * 100);
    delta = ` · ${pct > 0 ? '+' : pct < 0 ? '−' : ''}${Math.abs(pct)}${NBSP}% к ${mode === 'month' ? MONTHS_GEN[parseISO(prevCur).getMonth()].replace(/я$/, 'ю').replace(/а$/, 'у') : `${prevCur.slice(0, 4)} году`}`;
  }
  const certPaid = R.byPayment.find((g) => g.key === 'cert');
  const courseRows = R.byCourse.map((g) => ({ label: g.key === 'none' ? 'Курс не указан' : courseName(g.key), value: g.count, text: `<b>${pl(g.count, 'модель', 'модели', 'моделей')}</b> · скидки ${fmtMoney(g.value)}` }));
  return `<div class="screen">
    ${navBar({ title: 'Отчёты', backTo: '/more' })}
    <div class="scroller">
      <div class="seg" role="tablist" style="margin-top:4px"><button role="tab" class="${mode === 'month' ? 'on' : ''}" data-act="rep-mode" data-v="month">Месяц</button><button role="tab" class="${mode === 'year' ? 'on' : ''}" data-act="rep-mode" data-v="year">Год</button></div>
      <div class="period"><button class="icon-btn" data-act="rep-shift" data-v="-1" aria-label="Предыдущий период">${icon('chevLeft')}</button><div class="period-label">${esc(periodLabel(mode, cur))}</div><button class="icon-btn" data-act="rep-shift" data-v="1" aria-label="Следующий период" ${isLast ? 'disabled style="opacity:.3"' : ''}>${icon('chev')}</button></div>
      <div class="kpis">
        <div class="kpi kpi--hero"><div class="kpi-l">Выручка</div><div class="kpi-v">${fmtMoney(R.revenue)}</div><div class="kpi-s">${pl(R.count, 'процедура', 'процедуры', 'процедур')}${esc(delta)}</div></div>
        <div class="kpi"><div class="kpi-l">Расходники</div><div class="kpi-v">${fmtMoney(R.expenses)}</div></div>
        <div class="kpi"><div class="kpi-l">Выручка минус расходники</div><div class="kpi-v">${fmtMoney(R.revenue - R.expenses)}</div></div>
        <div class="kpi"><div class="kpi-l">Средний чек</div><div class="kpi-v">${fmtMoney(R.avg)}</div></div>
        <div class="kpi"><div class="kpi-l">Скидки</div><div class="kpi-v">${fmtMoney(R.discounts)}</div></div>
        <div class="kpi"><div class="kpi-l">Новые клиенты</div><div class="kpi-v">${R.newClients}</div></div>
        <div class="kpi"><div class="kpi-l">Не пришли, отменили</div><div class="kpi-v">${R.noshow}</div></div>
        <div class="kpi"><div class="kpi-l">Продано сертификатов</div><div class="kpi-v">${R.certsSold}</div><div class="kpi-s">на ${fmtMoney(R.certsSum)}</div></div>
        <div class="kpi"><div class="kpi-l">Оплачено сертификатами</div><div class="kpi-v">${fmtMoney(certPaid ? certPaid.value : 0)}</div></div>
      </div>
      <div class="section-title">Выручка по месяцам <button class="btn-link" data-act="rep-table">${UI.reportTable ? 'Показать диаграмму' : 'Показать таблицей'}</button></div>
      <div class="chart-card">${UI.reportTable ? seriesTable(series) : columnChart(series, mode === 'month' ? cur.slice(0, 7) : null)}</div>
      ${hbarsCard('Расходники по категориям', R.byExpense.map((g) => ({ label: g.key, value: g.value, text: `<b>${fmtMoney(g.value)}</b> · ${g.count}` })), 'Покупок не было')}
      ${hbarsCard('Услуги', R.byService.map((g) => ({ label: serviceName(g.key), value: g.value, text: `<b>${fmtMoney(g.value)}</b> · ${g.count}` })))}
      ${hbarsCard('Зоны', R.byZone.map((g) => ({ label: zoneName(g.key), value: g.count, text: `<b>${g.count}</b> · ${fmtMoney(g.value)}` })))}
      ${hbarsCard('Типы визитов', R.byType.map((g) => ({ label: TYPE_LABEL[g.key], value: g.count, text: `<b>${g.count}</b> · ${fmtMoney(g.value)}` })))}
      ${hbarsCard('Пигменты', R.byPigment.slice(0, 8).map((g) => ({ label: pigmentFull(g.key), value: g.count, text: `<b>${g.count}</b> ${plural(g.count, 'процедура', 'процедуры', 'процедур')}` })))}
      ${hbarsCard('Скидки по причинам', R.byReason.map((g) => ({ label: g.key, value: g.value, text: `<b>${fmtMoney(g.value)}</b> · ${g.count}` })), 'Скидок не было')}
      ${hbarsCard('Откуда пришли новые клиенты', R.bySource.map((g) => ({ label: g.key, value: g.count, text: `<b>${g.count}</b>` })), 'Новых клиентов не было')}
      ${hbarsCard('Способы оплаты', R.byPayment.map((g) => ({ label: PAYMENT_LABEL[g.key] || g.key, value: g.value, text: `<b>${fmtMoney(g.value)}</b> · ${g.count}` })))}
      ${hbarsCard('Модели по курсам', courseRows, 'Работ на моделях не было')}
    </div>
  </div>`;
}

ACTIONS['rep-mode'] = (el) => { UI.reportMode = el.dataset.v; render(); };
ACTIONS['rep-shift'] = (el) => {
  const k = Number(el.dataset.v);
  UI.reportCursor = UI.reportMode === 'month' ? addMonths(startOfMonth(UI.reportCursor), k) : addMonths(UI.reportCursor, 12 * k);
  render();
};
ACTIONS['rep-table'] = () => { UI.reportTable = !UI.reportTable; render(); };

// ── Сертификаты ──
function screenCertificates() {
  const f = UI.certFilter;
  const counts = { active: 0, used: 0, expired: 0 };
  S.certificates.forEach((x) => { counts[certStatus(x)] += 1; });
  const list = S.certificates.filter((x) => f === 'all' || certStatus(x) === f).sort((a, b) => (a.soldAt < b.soldAt ? 1 : -1));
  const filters = [['active', 'Действуют'], ['used', 'Использованы'], ['expired', 'Срок истёк'], ['all', 'Все']];
  const row = (x) => {
    const st = certStatus(x);
    let sub;
    if (st === 'active') sub = `действует до ${fmtDate(x.validTo, true)}`;
    else if (st === 'expired') sub = `срок истёк ${fmtDate(x.validTo, true)}`;
    else {
      const p = IDX.proc.get(x.usedProcId);
      const c = p ? IDX.client.get(p.clientId) : null;
      sub = `использован${x.usedAt ? ` ${fmtDate(x.usedAt, true)}` : ''}${c ? ` · ${fullName(c)}` : x.usedProcId === 'deleted' ? ' · карта удалена' : ''}`;
    }
    return `<button class="row ${st === 'active' ? '' : 'row--dim'}" data-act="cert-edit" data-id="${x.id}"><span class="avatar" aria-hidden="true">${icon('gift', 'i-sm')}</span><div class="row-main"><div class="row-title">№ ${esc(x.no)} · ${fmtMoney(x.amount)}</div><div class="row-sub">${esc(sub)}</div><div class="row-sub2">${esc([x.buyer && `купил: ${x.buyer}`, x.recipient && `для: ${x.recipient}`].filter(Boolean).join(' · '))}</div></div></button>`;
  };
  return `<div class="screen">
    ${navBar({ title: 'Сертификаты', backTo: '/more' })}
    <div class="scroller">
      <div class="chips" style="margin:6px 0 4px">${filters.map(([id, l]) => `<button type="button" class="chip ${f === id ? 'on' : ''}" data-act="cert-filter" data-v="${id}" aria-pressed="${f === id}">${esc(l)}${id !== 'all' && counts[id] ? ` <span class="n">${counts[id]}</span>` : ''}</button>`).join('')}</div>
      <p class="note" style="margin:6px 4px 0">Сертификат отмечается использованным сам, когда в процедуре выбирают оплату сертификатом.</p>
      ${list.length ? `<div class="list" style="margin-top:12px">${list.map(row).join('')}</div>` : '<div class="empty"><p>Здесь пусто</p></div>'}
    </div>
    <button class="fab" data-act="cert-new" aria-label="Продать сертификат">${icon('plus')}</button>
  </div>`;
}

ACTIONS['cert-filter'] = (el) => { UI.certFilter = el.dataset.v; render(); };
ACTIONS['cert-new'] = () => openCertForm(null);
ACTIONS['cert-edit'] = (el) => openCertForm(el.dataset.id);

function openCertForm(id) {
  const src = id ? S.certificates.find((x) => x.id === id) : null;
  const T = todayISO();
  const d = src ? deepClone(src) : { id: uid('cert'), no: `С-${String(S.settings.nextCertNo).padStart(3, '0')}`, amount: 5000, soldAt: T, validTo: addMonths(T, 6), buyer: '', recipient: '', payment: 'card', note: '', usedProcId: '', usedAt: '' };
  const presets = [3000, 5000, 7000, 10000];
  const sh = openSheet({
    errors: {},
    render: (s) => {
      const e = s.errors || {};
      const st = src ? certStatus(src) : 'active';
      const p = src && src.usedProcId ? IDX.proc.get(src.usedProcId) : null;
      const c = p ? IDX.client.get(p.clientId) : null;
      return `${sheetHead(src ? `Сертификат № ${d.no}` : 'Новый сертификат', { right: 'Готово', rightAct: 'save' })}
      <div class="sheet-scroll">
        ${src ? `<div class="card card--mint" style="margin-bottom:12px"><div style="font-weight:600">${esc(CERT_STATUS_LABEL[st])}</div>${c ? `<div class="note">Процедура ${esc(fmtDate(p.date, true))} · ${esc(fullName(c))} · ${esc(serviceName(p.serviceId))}</div><button type="button" class="btn-link" data-act="cert-open-proc">Открыть процедуру</button>` : ''}</div>` : ''}
        <div class="form-card">
          ${field('Номер', `<input class="input" data-bind="no" value="${esc(d.no)}" autocomplete="off">`, e.no)}
          <div class="field"><span class="field-label">Номинал</span><div class="chips" style="margin-bottom:8px">${presets.map((v) => chip(fmtMoney(v), Number(d.amount) === v, `data-act="cert-amount" data-v="${v}"`)).join('')}</div><div class="affix"><input class="input" inputmode="numeric" data-bind="amount" value="${esc(d.amount)}" aria-label="Номинал"><span>₽</span></div>${e.amount ? errHtml(e.amount) : ''}</div>
          <div class="grid-2">${field('Продан', `<input class="input" type="date" data-bind="soldAt" value="${esc(d.soldAt)}">`)}${field('Действует до', `<input class="input" type="date" data-bind="validTo" value="${esc(d.validTo)}">`)}</div>
          ${field('Кто купил', `<input class="input" data-bind="buyer" value="${esc(d.buyer)}" autocomplete="off">`, '', 'необязательно')}
          ${field('Для кого', `<input class="input" data-bind="recipient" value="${esc(d.recipient)}" autocomplete="off">`, '', 'необязательно')}
          <div class="field"><span class="field-label">Оплата</span><div class="chips">${PAYMENTS.filter((pm) => pm.id !== 'cert').map((pm) => chip(pm.label, d.payment === pm.id, `data-act="cert-pay" data-v="${pm.id}"`)).join('')}</div></div>
          ${field('Примечание', `<textarea class="textarea" data-bind="note">${esc(d.note)}</textarea>`, '', 'необязательно')}
        </div>
        ${src && !src.usedProcId ? '<button type="button" class="btn btn-danger btn-block" style="margin-top:14px" data-act="cert-del">Удалить сертификат</button>' : ''}
      </div>
      <div class="sheet-foot"><button class="btn btn-primary" data-act="save">${src ? 'Сохранить' : 'Продать сертификат'}</button></div>`;
    },
    onInput(path, v) {
      if (path === 'amount') { d.amount = parseMoney(v); return; }
      setPath(d, path, v);
    },
    onChange(path, v) { if (path !== 'amount') setPath(d, path, v); },
    actions: {
      'cert-amount': (el) => { d.amount = Number(el.dataset.v); sh.update(); },
      'cert-pay': (el) => { d.payment = el.dataset.v; sh.update(); },
      'cert-open-proc': () => { sh.close('ok'); go(`/proc/${src.usedProcId}`); },
      'cert-del': async () => {
        const ok = await confirmDialog({ title: 'Удалить сертификат?', text: `№ ${esc(d.no)} на ${fmtMoney(d.amount)}` });
        if (!ok) return;
        S.certificates = S.certificates.filter((x) => x.id !== src.id);
        saveState();
        sh.close('ok');
        render();
        toast('Сертификат удалён');
      },
      save: () => {
        const e = {};
        if (!String(d.no).trim()) e.no = 'Укажите номер';
        else if (S.certificates.some((x) => x.no === String(d.no).trim() && x.id !== d.id)) e.no = 'Такой номер уже есть';
        if (!(Number(d.amount) > 0)) e.amount = 'Укажите номинал';
        sh.errors = e;
        if (Object.keys(e).length) { sh.update(); scrollToError(sh); return; }
        const rec = { ...d, no: String(d.no).trim(), amount: Number(d.amount), buyer: String(d.buyer || '').trim(), recipient: String(d.recipient || '').trim(), note: String(d.note || '').trim() };
        if (src) Object.assign(src, rec);
        else {
          S.certificates.push(rec);
          S.settings.nextCertNo += 1;
        }
        saveState();
        sh.close('ok');
        render();
        toast(src ? 'Сохранено' : `Сертификат № ${rec.no} продан`);
      },
    },
  });
}

// ── Резервная копия и выгрузка ──
function screenBackup() {
  const lb = S.settings.lastBackup;
  const own = PhotoDB.entries().length;
  return `<div class="screen">
    ${navBar({ title: 'Резервная копия', backTo: '/more' })}
    <div class="scroller">
      <div class="card card--mint" style="margin-top:6px"><div style="font-weight:600">${lb ? `Последняя копия ${esc(fmtDate(lb, true))}` : 'Копий ещё не было'}</div><div class="note" style="margin-top:2px">${lb ? `${esc(cap(relDay(lb)))}. ` : ''}Напоминаем раз в ${pl(S.settings.backupEvery, 'день', 'дня', 'дней')}.</div></div>
      <div class="section-title">Копия всей базы</div>
      <div class="card">
        <p style="font-size:15px;margin-bottom:14px">Один файл: карты, процедуры, справочники и фото. В приложении он будет зашифрован мастер-паролем. На iPhone его можно сохранить в «Файлы» или отправить себе в Телеграм.</p>
        <div class="btn-stack"><button class="btn btn-primary" data-act="backup-save">${icon('download')} Сохранить копию</button><button class="btn btn-outline" data-act="backup-restore">${icon('upload')} Восстановить из копии</button></div>
        <p class="note">В заглушке файл сохраняется без шифрования, в формате JSON. Ваших фото в базе: ${own}.</p>
      </div>
      <div class="section-title">Выгрузка в Excel</div>
      <div class="card">
        <p style="font-size:15px;margin-bottom:14px">Таблицы CSV открываются в Excel. Такой файл не зашифрован.</p>
        <div class="btn-stack"><button class="btn btn-outline" data-act="export-csv" data-what="clients">${icon('download')} Клиенты</button><button class="btn btn-outline" data-act="export-csv" data-what="procs">${icon('download')} Процедуры</button></div>
      </div>
    </div>
  </div>`;
}

ACTIONS['backup-save'] = () => {
  const photos = Object.fromEntries(PhotoDB.entries());
  const payload = { format: 'ketsal-crm-backup', version: 1, createdAt: new Date().toISOString(), state: S, photos };
  S.settings.lastBackup = todayISO();
  payload.state = deepClone(S);
  download(`ketsal-backup-${todayISO()}.json`, JSON.stringify(payload));
  saveState();
  render();
  toast('Копия сохранена в загрузки');
};
ACTIONS['backup-restore'] = () => {
  const inp = $('#restore-input');
  inp.value = '';
  inp.onchange = async () => {
    const f = inp.files && inp.files[0];
    if (!f) return;
    let data;
    try {
      data = JSON.parse(await f.text());
    } catch (e) {
      toast('Не получилось прочитать файл');
      return;
    }
    if (!data || data.format !== 'ketsal-crm-backup' || !data.state || !Array.isArray(data.state.clients)) {
      toast('Это не резервная копия приложения');
      return;
    }
    const ok = await confirmDialog({
      title: 'Заменить все данные копией?',
      text: `Копия от ${esc(fmtDate(String(data.createdAt).slice(0, 10), true))}: ${pl(data.state.clients.length, 'карта', 'карты', 'карт')}, ${pl(data.state.procedures.length, 'процедура', 'процедуры', 'процедур')}. Текущие данные заменятся.`,
      ok: 'Заменить',
    });
    if (!ok) return;
    S = migrate(data.state);
    PhotoDB.clear();
    for (const [pid, url] of Object.entries(data.photos || {})) PhotoDB.put(pid, url);
    saveState();
    closeAllSheets();
    switchTab('clients');
    toast('Данные восстановлены из копии');
  };
  inp.click();
};

function csvCell(v) {
  const s = String(v ?? '');
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function toCSV(rows) {
  return `﻿${rows.map((r) => r.map(csvCell).join(';')).join('\r\n')}`;
}
function exportClientsCSV(withHealth) {
  const head = ['Номер карты', 'Фамилия', 'Имя', 'Отчество', 'Телефон', 'Где переписываемся', 'Ник', 'Дата рождения', 'Откуда пришла', 'Метки', 'Согласие на данные', 'Согласие на процедуру', 'Согласие на данные о здоровье', 'Первый визит', 'Последний визит', 'Визитов', 'Потрачено', 'Заметки'];
  if (withHealth) head.push('Анкета заполнена', 'Отметки о здоровье');
  const rows = [head];
  for (const c of S.clients.slice().sort((a, b) => a.cardNo - b.cardNo)) {
    const inf = clientInfo(c);
    const cons = c.consents || {};
    const r = [c.cardNo, c.lastName, c.firstName, c.middleName, fmtPhone(c.phone).replace(/ /g, ' '), c.contact ? CONTACT_LABEL[c.contact.kind] : '', c.contact ? c.contact.handle : '', fmtDateNum(c.birth), c.source, (c.tags || []).join(', '), fmtDateNum(cons.pd && cons.pd.date), fmtDateNum(cons.procedure && cons.procedure.date), fmtDateNum(cons.health && cons.health.date), inf.first ? fmtDateNum(inf.first.date) : '', inf.last ? fmtDateNum(inf.last.date) : '', inf.visits, inf.spent, c.notes];
    if (withHealth) r.push(c.health && c.health.filledAt ? fmtDateNum(c.health.filledAt) : '', healthMarks(c).join('; '));
    rows.push(r);
  }
  download(`ketsal-klienty-${todayISO()}.csv`, toCSV(rows), 'text/csv;charset=utf-8');
}
function exportProcsCSV() {
  const rows = [['Номер карты', 'Клиент', 'Дата', 'Услуга', 'Тип визита', 'Зона', 'Техника', 'Анестезия первичная', 'Анестезия вторичная', 'Пигменты', 'Игла', 'Стоимость', 'Скидка', 'Скидка в', 'Причина скидки', 'Итого', 'Оплата', 'Сертификат', 'Статус', 'Модель', 'Курс', 'Заживление', 'Примечание']];
  for (const p of S.procedures.slice().sort((a, b) => (a.date < b.date ? -1 : 1))) {
    const c = IDX.client.get(p.clientId);
    const cert = p.certificateId ? IDX.cert.get(p.certificateId) : null;
    rows.push([
      c ? c.cardNo : '', c ? formalName(c) : '', fmtDateNum(p.date), serviceName(p.serviceId), TYPE_LABEL[p.type], zoneName(p.zone), p.technique,
      p.anesthesia.primary ? anestName(p.anesthesia.primary) : '', p.anesthesia.secondary ? anestName(p.anesthesia.secondary) : '',
      p.pigments.map((g) => `${pigmentFull(g.pigmentId)}, партия ${g.lot}${g.ratio ? `, ${g.ratio}` : ''}`).join(' + '),
      p.needles.map(needleName).join(', '), p.price, p.discount && p.discount.value ? p.discount.value : '', p.discount && p.discount.value ? (p.discount.mode === 'pct' ? '%' : '₽') : '',
      p.discount ? p.discount.reason : '', totalOf(p), PAYMENT_LABEL[p.payment] || '', cert ? cert.no : '', STATUS_LABEL[p.status],
      p.model && p.model.on ? 'да' : '', p.model && p.model.on ? courseName(p.model.courseId) : '', p.healing && p.healing.status ? HEALING_LABEL[p.healing.status] : '', p.note,
    ]);
  }
  download(`ketsal-procedury-${todayISO()}.csv`, toCSV(rows), 'text/csv;charset=utf-8');
}
ACTIONS['export-csv'] = (el) => {
  const what = el.dataset.what;
  const st = { health: false };
  const sh = openSheet({
    auto: true,
    render: () => `${sheetHead('Выгрузка без шифрования')}
      <div class="sheet-scroll">
        <div class="warn-box"><div class="warn warn--danger"><span class="dot dot--alert"></span><div>Файл не зашифрован и содержит персональные данные клиентов. Любой, у кого он окажется, увидит все данные.</div></div></div>
        ${what === 'clients' ? `<label class="check" style="border:0;margin-top:6px"><input type="checkbox" data-bind="health" ${st.health ? 'checked' : ''}><span>Включить данные о здоровье. По умолчанию они не выгружаются</span></label>` : '<p class="note">Данные о здоровье в таблицу процедур не попадают.</p>'}
      </div>
      <div class="sheet-foot"><button class="btn btn-primary" data-act="do">Выгрузить</button></div>`,
    onChange(path, v) { st[path] = v; },
    actions: {
      do: () => {
        if (what === 'clients') exportClientsCSV(st.health); else exportProcsCSV();
        sh.close('ok');
        toast('Файл сохранён в загрузки');
      },
    },
  });
};

// ── Настройки ──
function numSetting(title, sub, key, value) {
  return `<label class="settings-num"><span><span class="t" style="display:block">${esc(title)}</span><span class="s">${esc(sub)}</span></span><input class="input" type="number" inputmode="numeric" min="1" max="999" data-ch="setting-num" data-k="${key}" value="${value}" aria-label="${esc(title)}"></label>`;
}
function listEditor(key, label) {
  return `<div class="field"><span class="field-label">${esc(label)}</span><div class="chips">${S.lists[key].map((v, i) => `<button type="button" class="chip" data-act="list-del" data-k="${key}" data-i="${i}" aria-label="Убрать: ${esc(v)}">${esc(v)} ${icon('close', 'i-sm')}</button>`).join('')}</div>
    <div class="inline-actions" style="margin-top:8px"><input class="input" id="list-in-${key}" placeholder="Новый вариант" autocomplete="off" aria-label="${esc(label)}: новый вариант"><button type="button" class="btn btn-secondary" data-act="list-add" data-k="${key}">Добавить</button></div></div>`;
}
function screenSettings() {
  const s = S.settings;
  return `<div class="screen">
    ${navBar({ title: 'Настройки', backTo: '/more' })}
    <div class="scroller">
      <div class="section-title">Напоминания</div>
      <div class="card" style="padding-top:4px;padding-bottom:4px">
        ${numSetting('Коррекция с', 'дня после первичной процедуры', 'corrFrom', s.corrFrom)}
        ${numSetting('Коррекция до', 'дня, дальше считается просроченной', 'corrTo', s.corrTo)}
        ${numSetting('Обновление через', 'месяцев после последней процедуры', 'updFrom', s.updFrom)}
        ${numSetting('Обновление просрочено', 'через столько месяцев', 'updTo', s.updTo)}
        ${numSetting('«Давно не были»', 'через столько месяцев без визитов', 'lostAfter', s.lostAfter)}
      </div>
      <div class="section-title">Вход и безопасность</div>
      <div class="card">
        <div class="field"><span class="field-label">Автоблокировка</span><div class="chips">${[1, 5, 15, 30, 0].map((m) => chip(m ? `${m} мин` : 'Не блокировать', s.autoLock === m, `data-act="set-autolock" data-v="${m}"`)).join('')}</div></div>
        <div class="field"><span class="field-label">Быстрый вход</span><div class="chips">${[['faceid', 'Face ID'], ['pin', 'Код из 6 цифр'], ['password', 'Только пароль']].map(([v, l]) => chip(l, s.quickUnlock === v, `data-act="set-quick" data-v="${v}"`)).join('')}</div>${s.quickUnlock === 'pin' ? '<p class="hint" style="margin:8px 2px 0">Код слабее пароля: после пяти ошибок понадобится мастер-пароль.</p>' : ''}</div>
        <button class="btn btn-outline btn-block" data-act="change-pass">${icon('key')} Сменить мастер-пароль</button>
      </div>
      <div class="section-title">Оформление</div>
      <div class="seg">${[['auto', 'Как в системе'], ['light', 'Светлая'], ['dark', 'Тёмная']].map(([v, l]) => `<button class="${s.theme === v ? 'on' : ''}" data-act="set-theme" data-v="${v}">${l}</button>`).join('')}</div>
      <div class="section-title">Шаблоны сообщений</div>
      <div class="card">${TEMPLATE_DEFS.filter((t) => t.id !== 'free').map((t) => `<div class="field"><span class="field-label">${esc(t.label)}</span><textarea class="textarea" data-ch="tpl" data-k="${t.id}" aria-label="Шаблон: ${esc(t.label)}">${esc(s.templates[t.id])}</textarea></div>`).join('')}<p class="hint" style="margin-top:-4px">Подстановки: {имя}, {зона}, {дата}, {дней}</p></div>
      <div class="section-title">Списки вариантов</div>
      <div class="card">${listEditor('sources', 'Откуда пришла')}${listEditor('tags', 'Метки')}${listEditor('discountReasons', 'Причины скидки')}${listEditor('expenseCategories', 'Категории расходников')}</div>
      <div class="section-title">Заглушка</div>
      <div class="menu">
        <button class="menu-item" data-act="demo-onboarding">${icon('play')}<span class="t">Показать первый запуск</span></button>
        <button class="menu-item" data-act="demo-reset">${icon('refresh')}<span class="t">Вернуть демо-данные</span></button>
        <button class="menu-item danger" data-act="demo-clear">${icon('trash')}<span class="t">Очистить всё и начать с № 1</span></button>
      </div>
    </div>
  </div>`;
}

INPUTS['setting-num'] = (el) => {
  const k = el.dataset.k;
  const v = parseInt(el.value, 10);
  const s = S.settings;
  if (!(v > 0)) { el.value = s[k]; return; }
  const next = { ...s, [k]: v };
  if (next.corrTo <= next.corrFrom || next.updTo <= next.updFrom || next.lostAfter <= next.updFrom) {
    toast('Проверьте порядок: «до» должно быть больше «с»');
    el.value = s[k];
    return;
  }
  s[k] = v;
  saveState();
  renderTabbar();
  toast('Сохранено');
};
INPUTS.tpl = (el) => {
  S.settings.templates[el.dataset.k] = el.value;
  saveState();
  toast('Шаблон сохранён');
};
ACTIONS['set-autolock'] = (el) => { S.settings.autoLock = Number(el.dataset.v); saveState(); resetIdle(); render(); };
ACTIONS['set-quick'] = (el) => { S.settings.quickUnlock = el.dataset.v; saveState(); render(); };
ACTIONS['set-theme'] = (el) => { S.settings.theme = el.dataset.v; saveState(); applyTheme(); render(); };
ACTIONS['list-add'] = (el) => {
  const k = el.dataset.k;
  const inp = $(`#list-in-${k}`);
  const v = inp ? inp.value.trim() : '';
  if (!v) return;
  if (!S.lists[k].includes(v)) S.lists[k].push(v);
  saveState();
  render();
};
ACTIONS['list-del'] = (el) => {
  S.lists[el.dataset.k].splice(Number(el.dataset.i), 1);
  saveState();
  render();
};
ACTIONS['change-pass'] = () => {
  const st = { cur: '', p1: '', p2: '' };
  const sh = openSheet({
    auto: true,
    render: () => `${sheetHead('Мастер-пароль')}
      <div class="sheet-scroll">
        ${field('Текущий пароль', '<input class="input" type="password" data-bind="cur" autocomplete="current-password">')}
        ${field('Новый пароль', '<input class="input" type="password" data-bind="p1" autocomplete="new-password">')}
        ${field('Повторите новый', '<input class="input" type="password" data-bind="p2" autocomplete="new-password">')}
        <p class="hint">Данные не перешифровываются: меняется только обёртка ключа, поэтому смена занимает секунду.</p>
      </div>
      <div class="sheet-foot"><button class="btn btn-primary" data-act="ok">Сменить пароль</button></div>`,
    onInput(path, v) { st[path] = v; },
    actions: {
      ok: () => {
        if (!st.cur || st.p1.length < 8) { toast('Новый пароль — минимум 8 символов'); return; }
        if (st.p1 !== st.p2) { toast('Пароли не совпадают'); return; }
        sh.close('ok');
        toast('Пароль изменён');
      },
    },
  });
};
ACTIONS['demo-onboarding'] = () => startOnboarding();
ACTIONS['demo-reset'] = async () => {
  const ok = await confirmDialog({ title: 'Вернуть демо-данные?', text: 'Все изменения в заглушке пропадут, база вернётся к исходным выдуманным клиентам.', ok: 'Вернуть', danger: false });
  if (!ok) return;
  S = buildDemo();
  PhotoDB.clear();
  saveState();
  switchTab('clients');
  toast('Демо-данные восстановлены');
};
ACTIONS['demo-clear'] = async () => {
  const ok = await confirmDialog({ title: 'Очистить всю базу?', text: 'Удалятся все карты, процедуры и сертификаты. Справочники останутся. Первая новая карта получит № 1.', ok: 'Очистить', requireWord: 'очистить' });
  if (!ok) return;
  clearToEmpty();
  toast('База пустая. Первая карта получит № 1');
};
function clearToEmpty() {
  const keep = { services: S.services, pigments: S.pigments, needles: S.needles, anesthetics: S.anesthetics, zones: S.zones, lists: S.lists, templates: S.settings.templates, theme: S.settings.theme, quickUnlock: S.settings.quickUnlock, autoLock: S.settings.autoLock };
  S = emptyState();
  Object.assign(S, { services: keep.services, pigments: keep.pigments, needles: keep.needles, anesthetics: keep.anesthetics, zones: keep.zones, lists: keep.lists });
  Object.assign(S.settings, { templates: keep.templates, theme: keep.theme, quickUnlock: keep.quickUnlock, autoLock: keep.autoLock });
  PhotoDB.clear();
  saveState();
  switchTab('clients');
}

// ── Синхронизация ──
function openSyncSheet() {
  openSheet({
    auto: true,
    render: () => `${sheetHead('Синхронизация', { left: 'Закрыть' })}
      <div class="sheet-scroll">
        <div class="sync-card" style="margin-top:0">${icon('cloud')}<div><div class="t">Яндекс Диск подключён</div><div class="s" data-sync-text>${esc(syncText())}</div></div></div>
        <div class="onb-list">
          <div>${icon('lock')}<span>Всё шифруется на телефоне. Яндекс видит только зашифрованные файлы.</span></div>
          <div>${icon('refresh')}<span>Изменения уходят на Диск через несколько секунд. Без сети они сохраняются на телефоне и отправятся позже.</span></div>
          <div>${icon('shield')}<span>Приложению доступна только его папка на Диске, остальные файлы оно не видит.</span></div>
        </div>
        <p class="note">В заглушке синхронизация только показана: данные хранятся в этом браузере.</p>
      </div>
      <div class="sheet-foot"><button class="btn btn-primary" data-act="sync-now">${icon('refresh')} Синхронизировать сейчас</button></div>`,
    actions: { 'sync-now': () => { markDirty(); toast('Синхронизация запущена'); } },
  });
}

// ── Расходники: что купили, сколько стоило, когда ──
const EXP_PERIODS = [['month', 'Этот месяц'], ['prev', 'Прошлый месяц'], ['year', 'Этот год'], ['all', 'Все']];
function expRange(id) {
  const T = IDX.today;
  if (id === 'month') return [startOfMonth(T), endOfMonth(T)];
  if (id === 'prev') {
    const m = addMonths(startOfMonth(T), -1);
    return [m, endOfMonth(m)];
  }
  if (id === 'year') return [`${T.slice(0, 4)}-01-01`, `${T.slice(0, 4)}-12-31`];
  return ['0000-01-01', '9999-12-31'];
}

function screenExpenses() {
  const [a, b] = expRange(UI.expPeriod);
  const list = S.expenses.filter((e) => e.date >= a && e.date <= b).sort((x, y) => (x.date < y.date ? 1 : x.date > y.date ? -1 : 0));
  const groups = [];
  for (const e of list) {
    const ym = e.date.slice(0, 7);
    let g = groups[groups.length - 1];
    if (!g || g.ym !== ym) { g = { ym, items: [] }; groups.push(g); }
    g.items.push(e);
  }
  const row = (e) => `<button class="row" data-act="exp-edit" data-id="${e.id}"><div class="row-main"><div class="row-title">${esc(e.name || e.category)}</div><div class="row-sub">${esc([e.name ? e.category : '', fmtDate(e.date, true)].filter(Boolean).join(' · '))}</div></div><div class="row-side"><span class="num" style="font-weight:600">${fmtMoney(e.amount)}</span></div></button>`;
  const body = list.length
    ? groups.map((g) => `<div class="section-title"><span>${esc(fmtMonthYear(`${g.ym}-01`))}</span><span class="num">${fmtMoney(sum(g.items, (e) => e.amount))}</span></div><div class="list list--plain">${g.items.map(row).join('')}</div>`).join('')
    : `<div class="empty"><p>За этот период покупок нет</p><button class="btn btn-primary" data-act="exp-new">${icon('plus')} Добавить покупку</button></div>`;
  return `<div class="screen">
    ${navBar({ title: 'Расходники', backTo: '/more' })}
    <div class="scroller">
      <div class="chips" style="margin:6px 0 4px">${EXP_PERIODS.map(([id, l]) => chip(l, UI.expPeriod === id, `data-act="exp-period" data-v="${id}"`)).join('')}</div>
      <div class="card card--mint" style="margin-top:10px"><div style="display:flex;justify-content:space-between;align-items:baseline;gap:12px"><span style="font-weight:600">${pl(list.length, 'покупка', 'покупки', 'покупок')}</span><span style="font-size:22px;font-weight:600">${fmtMoney(sum(list, (e) => e.amount))}</span></div><div class="note" style="margin-top:2px">Итоги по категориям и «выручка минус расходники» — в отчётах</div></div>
      ${body}
    </div>
    <button class="fab" data-act="exp-new" aria-label="Добавить покупку">${icon('plus')}</button>
  </div>`;
}
ACTIONS['exp-period'] = (el) => { UI.expPeriod = el.dataset.v; render(); };
ACTIONS['exp-new'] = () => openExpenseForm(null);
ACTIONS['exp-edit'] = (el) => openExpenseForm(el.dataset.id);

function openExpenseForm(id) {
  const src = id ? S.expenses.find((x) => x.id === id) : null;
  const d = src ? deepClone(src) : { id: uid('ex'), category: S.lists.expenseCategories[0] || 'Другое', name: '', amount: 0, date: todayISO() };
  const sh = openSheet({
    errors: {},
    render: (s) => {
      const e = s.errors || {};
      return `${sheetHead(src ? 'Покупка' : 'Новая покупка', { right: 'Готово', rightAct: 'save' })}
      <div class="sheet-scroll">
        <div class="form-card">
          <div class="field"><span class="field-label">Что купили</span><div class="chips">${S.lists.expenseCategories.map((c) => chip(c, d.category === c, `data-act="exp-cat" data-v="${esc(c)}"`)).join('')}</div></div>
          ${field('Описание', `<input class="input" data-bind="name" value="${esc(d.name)}" placeholder="например, картриджи 1RL 0,30 мм, 20 шт" autocomplete="off">`, '', 'необязательно')}
          <div class="grid-2">${field('Стоимость', `<div class="affix"><input class="input" inputmode="numeric" data-bind="amount" value="${d.amount ? esc(d.amount) : ''}" placeholder="0" autocomplete="off"><span>₽</span></div>`, e.amount)}${field('Дата покупки', `<input class="input" type="date" data-bind="date" value="${esc(d.date)}" max="${todayISO()}">`, e.date)}</div>
        </div>
        <p class="hint" style="margin-top:12px">Категории меняются в «Настройки → Списки вариантов».</p>
        ${src ? '<button type="button" class="btn btn-danger btn-block" style="margin-top:6px" data-act="exp-del">Удалить покупку</button>' : ''}
      </div>
      <div class="sheet-foot"><button class="btn btn-primary" data-act="save">Сохранить</button></div>`;
    },
    onInput(path, v) {
      if (path === 'amount') d.amount = parseMoney(v);
      else setPath(d, path, v);
    },
    onChange(path, v) { if (path !== 'amount') setPath(d, path, v); },
    actions: {
      'exp-cat': (el) => { d.category = el.dataset.v; sh.update(); },
      'exp-del': async () => {
        const ok = await confirmDialog({ title: 'Удалить покупку?', text: `${esc(d.name || d.category)}, ${fmtMoney(d.amount)}` });
        if (!ok) return;
        S.expenses = S.expenses.filter((x) => x.id !== src.id);
        saveState();
        sh.close('ok');
        render();
        toast('Покупка удалена');
      },
      save: () => {
        const e = {};
        if (!(d.amount > 0)) e.amount = 'Укажите стоимость';
        if (!isISO(d.date)) e.date = 'Укажите дату';
        sh.errors = e;
        if (Object.keys(e).length) { sh.update(); scrollToError(sh); return; }
        const rec = { ...d, name: String(d.name || '').trim() };
        if (src) Object.assign(src, rec); else S.expenses.push(rec);
        saveState();
        sh.close('ok');
        render();
        toast(src ? 'Сохранено' : 'Покупка добавлена');
      },
    },
  });
}
