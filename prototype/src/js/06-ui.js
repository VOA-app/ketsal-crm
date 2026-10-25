// Каркас интерфейса: иконки, маршруты, нижние шторки, диалоги, уведомления, обработка нажатий.

const ICONS = {
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.6-3.6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  back: '<path d="M15 18l-6-6 6-6"/>',
  chev: '<path d="M9 6l6 6-6 6"/>',
  chevDown: '<path d="M6 9l6 6 6-6"/>',
  chevLeft: '<path d="M15 6l-6 6 6 6"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  book: '<path d="M5 4.5h10.5A3.5 3.5 0 0 1 19 8v12H8.5A3.5 3.5 0 0 1 5 16.5z"/><path d="M5 16.5A3.5 3.5 0 0 1 8.5 13H19"/>',
  dots: '<circle cx="5" cy="12" r="1.6" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1.6" fill="currentColor" stroke="none"/>',
  camera: '<path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13.5" r="3.5"/>',
  phone: '<path d="M5 4h3.2l1.8 4.6-2.4 1.6a11 11 0 0 0 6.2 6.2l1.6-2.4L20 15.8V19a1.8 1.8 0 0 1-2 1.8A16 16 0 0 1 3.2 6 1.8 1.8 0 0 1 5 4z"/>',
  message: '<path d="M4 5.5h16v11H9.5L5 20v-3.5H4z"/>',
  print: '<path d="M7 9V3.5h10V9"/><rect x="3.5" y="9" width="17" height="8" rx="2"/><path d="M7 14h10v6.5H7z"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M14 6l4 4"/>',
  copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M15 9V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h4"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7"/>',
  lock: '<rect x="5" y="11" width="14" height="9.5" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  faceid: '<path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2"/><path d="M9 9v1.5M15 9v1.5M12 9v4h-1M9 16c1.6 1.2 4.4 1.2 6 0"/>',
  cloud: '<path d="M7 18.5h10a4 4 0 0 0 .6-7.95A6 6 0 0 0 6.1 11 3.8 3.8 0 0 0 7 18.5z"/>',
  download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
  upload: '<path d="M12 20V9M7 14l5-5 5 5M5 4h14"/>',
  chart: '<path d="M4 20V11M10 20V5M16 20v-7M3 20h18"/>',
  gift: '<rect x="3.5" y="8" width="17" height="4.5" rx="1"/><path d="M5 12.5V20h14v-7.5M12 8v12M12 8c-1.5-3.5-5.5-3.8-5.5-1.2S10.5 8 12 8zM12 8c1.5-3.5 5.5-3.8 5.5-1.2S13.5 8 12 8z"/>',
  sliders: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
  repeat: '<path d="M17 3l3 3-3 3"/><path d="M4 11V9.5A3.5 3.5 0 0 1 7.5 6H20M7 21l-3-3 3-3"/><path d="M20 13v1.5a3.5 3.5 0 0 1-3.5 3.5H4"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><circle cx="12" cy="7.8" r=".9" fill="currentColor"/>',
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
  sort: '<path d="M7 4v16M4 17l3 3 3-3M17 20V4M14 7l3-3 3 3"/>',
  image: '<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><circle cx="9" cy="10" r="1.8"/><path d="M20.5 16l-5-5-9 8.5"/>',
  health: '<path d="M12 3.5l7 3v5.5c0 4.3-3 7.3-7 8.8-4-1.5-7-4.5-7-8.8V6.5z"/><path d="M12 9v6M9 12h6"/>',
  doc: '<path d="M6.5 3.5h7.5l4 4v13h-11.5z"/><path d="M14 3.5v4h4M9.5 13h5M9.5 16.5h3.5"/>',
  compare: '<rect x="3.5" y="5" width="7.5" height="14" rx="1.5"/><rect x="13" y="5" width="7.5" height="14" rx="1.5"/>',
  refresh: '<path d="M20 12a8 8 0 1 1-2.4-5.7"/><path d="M20 4v4.5h-4.5"/>',
  list: '<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1" fill="currentColor"/><circle cx="4.5" cy="12" r="1" fill="currentColor"/><circle cx="4.5" cy="18" r="1" fill="currentColor"/>',
  play: '<path d="M8 5.5v13l10-6.5z"/>',
  backspace: '<path d="M9 5h11a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H9l-6-7z"/><path d="M12.5 9.5l5 5M17.5 9.5l-5 5"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="M11 12l8-8M16 7l2.5 2.5M14 9l2 2"/>',
  pin: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8.5 12h.01M12 12h.01M15.5 12h.01"/>',
  shield: '<path d="M12 3.5l7 3v5.5c0 4.3-3 7.3-7 8.8-4-1.5-7-4.5-7-8.8V6.5z"/><path d="M9 12l2 2 4-4"/>',
  star: '<path d="M12 4l2.4 5 5.3.7-3.9 3.7 1 5.3L12 16.2 7.2 18.7l1-5.3-3.9-3.7 5.3-.7z"/>',
  box: '<path d="M3.5 7.5L12 3l8.5 4.5v9L12 21l-8.5-4.5z"/><path d="M3.5 7.5L12 12l8.5-4.5M12 12v9"/>',
  logout: '<path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4M10 16l-4-4 4-4M6 12h10"/>',
};
const icon = (name, cls = '') => `<svg class="i ${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ''}</svg>`;

// Состояние интерфейса (не сохраняется)
const UI = {
  tab: 'clients',
  clientView: 'all',
  clientSearch: '',
  clientSort: 'name',
  clientTab: {},
  photoZone: {},
  procPeriod: 'week',
  procSearch: '',
  refsKind: 'services',
  reportMode: 'month',
  reportCursor: todayISO(),
  reportTable: false,
  certFilter: 'active',
  expPeriod: 'month',
  locked: true,
  healthShown: {},
  backupBannerHidden: false,
};

// ── Маршруты ──
const TABS = [
  { id: 'clients', label: 'Клиенты', icon: 'user', path: '/clients' },
  { id: 'procedures', label: 'Процедуры', icon: 'calendar', path: '/procedures' },
  { id: 'refs', label: 'Справочники', icon: 'book', path: '/refs' },
  { id: 'more', label: 'Ещё', icon: 'dots', path: '/more' },
];
const ROUTES = [];
function route(test, render, opts = {}) { ROUTES.push({ test, render, ...opts }); }

function parseRoute() {
  const h = decodeURIComponent(location.hash.replace(/^#/, '')) || '/clients';
  const parts = h.split('?')[0].split('/').filter(Boolean);
  return { path: `/${parts.join('/')}`, parts };
}

const navStack = [];
function go(path) {
  const cur = parseRoute().path;
  if (cur === path) { render(); return; }
  navStack.push(cur);
  location.hash = path;
}
function goReplace(path) {
  history.replaceState(null, '', `#${path}`);
  render();
}
function goBack(fallback) {
  const prev = navStack.pop();
  if (prev) goReplace(prev);
  else goReplace(fallback || TABS.find((t) => t.id === UI.tab).path);
}
function switchTab(id) {
  const t = TABS.find((x) => x.id === id);
  navStack.length = 0;
  UI.tab = id;
  goReplace(t.path);
}

function render() {
  if (!S) return;
  const r = parseRoute();
  const rt = ROUTES.find((x) => x.test(r.parts)) || ROUTES[0];
  if (rt.tab) UI.tab = rt.tab;
  const host = $('#screen');
  const same = host.dataset.path === r.path;
  const sc = $('.scroller', host);
  const top = same && sc ? sc.scrollTop : 0;
  host.innerHTML = rt.render(r);
  host.dataset.path = r.path;
  const sc2 = $('.scroller', host);
  if (sc2) sc2.scrollTop = top;
  // Активный чип в горизонтальной ленте — в зоне видимости
  for (const strip of $$('.chips--scroll, .seg--scroll', host)) {
    const on = $('.on', strip);
    if (on) strip.scrollLeft = Math.max(0, on.offsetLeft - (strip.clientWidth - on.offsetWidth) / 2);
  }
  renderTabbar();
  renderSyncBits();
  if (rt.after) rt.after(r);
  renderGuidePanel();
}

function renderTabbar() {
  const badge = urgentCount();
  $('#tabbar').innerHTML = TABS.map((t) => `<button class="tab ${UI.tab === t.id ? 'on' : ''}" data-act="tab" data-id="${t.id}" ${UI.tab === t.id ? 'aria-current="page"' : ''}>${icon(t.icon)}<span>${t.label}</span>${t.id === 'clients' && badge ? `<span class="badge" aria-label="Напоминаний: ${badge}">${badge}</span>` : ''}</button>`).join('');
}

// ── Общие куски разметки ──
function navBar({ title = '', back = true, right = '', backLabel = 'Назад', backTo = '' } = {}) {
  return `<header class="topbar topbar--nav"><div class="nav-row">
    ${back ? `<button class="back-btn" data-act="back" data-to="${esc(backTo)}">${icon('back')}<span>${esc(backLabel)}</span></button>` : '<span></span>'}
    <div class="nav-title">${esc(title)}</div>
    <div>${right}</div>
  </div></header>`;
}
function avatarHtml(c, cls = '') {
  const img = c.facePhoto ? `<img src="${photoSrc(c.facePhoto)}" alt="">` : esc(initials(c));
  return `<span class="avatar ${cls}" aria-hidden="true">${img}</span>`;
}
const chip = (label, on, attrs = '', extra = '') => `<button type="button" class="chip ${on ? 'on' : ''}" ${attrs} aria-pressed="${on ? 'true' : 'false'}">${extra}${esc(label)}</button>`;
function selectHtml(bind, options, value, { placeholder = '', attrs = '' } = {}) {
  const opts = options.map((o) => {
    if (o.group) return `<optgroup label="${esc(o.group)}">${o.items.map((i) => `<option value="${esc(i.value)}" ${i.value === value ? 'selected' : ''}>${esc(i.label)}</option>`).join('')}</optgroup>`;
    return `<option value="${esc(o.value)}" ${o.value === value ? 'selected' : ''}>${esc(o.label)}</option>`;
  }).join('');
  return `<div class="select-wrap"><select class="select" data-bind="${bind}" ${attrs}>${placeholder ? `<option value="" ${!value ? 'selected' : ''}>${esc(placeholder)}</option>` : ''}${opts}</select></div>`;
}
function kv(k, v, cls = '') {
  return `<div class="kv ${cls}"><span class="k">${esc(k)}</span><span class="v">${v}</span></div>`;
}
function syncButton() {
  return `<button class="icon-btn icon-btn--accent" data-act="sync" aria-label="Синхронизация" data-sync-icon>${icon('cloud')}</button>`;
}

// ── Шторки ──
const sheets = [];
function openSheet(def) {
  const el = document.createElement('div');
  el.className = 'sheet-layer';
  el.innerHTML = `<div class="sheet-backdrop" data-act="sheet-dismiss"></div><div class="sheet ${def.auto ? 'sheet--auto' : ''}" role="dialog" aria-modal="true"></div>`;
  $('#overlays').appendChild(el);
  const sh = {
    ...def,
    el,
    update() {
      const box = $('.sheet', el);
      const scr = $('.sheet-scroll', el);
      const top = scr ? scr.scrollTop : 0;
      box.innerHTML = this.render(this);
      const scr2 = $('.sheet-scroll', el);
      if (scr2) scr2.scrollTop = top;
      if (this.after) this.after(this);
    },
    close(result) {
      const i = sheets.indexOf(this);
      if (i >= 0) sheets.splice(i, 1);
      el.classList.remove('open');
      setTimeout(() => el.remove(), 280);
      if (this.onClose) this.onClose(result);
    },
  };
  sheets.push(sh);
  sh.update();
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('open')));
  return sh;
}
const topSheet = () => sheets[sheets.length - 1] || null;
function closeAllSheets() {
  while (sheets.length) sheets[sheets.length - 1].close('cancel');
}
function sheetHead(title, { left = 'Отмена', leftAct = 'sheet-cancel', right = '', rightAct = '' } = {}) {
  return `<div class="sheet-head">
    ${left ? `<button class="btn btn-ghost" data-act="${leftAct}">${esc(left)}</button>` : '<span></span>'}
    <h2>${esc(title)}</h2>
    ${right ? `<button class="btn btn-ghost" data-act="${rightAct}" style="font-weight:600">${esc(right)}</button>` : '<span></span>'}
  </div>`;
}

// Список действий снизу (как меню iOS)
function actionSheet(title, items) {
  return new Promise((resolve) => {
    let picked = null;
    const sh = openSheet({
      auto: true,
      render: () => `${title ? `<div class="action-title">${esc(title)}</div>` : ''}<div class="action-list">${items.map((it, i) => `<button data-act="pick" data-i="${i}" class="${it.danger ? 'danger' : ''} ${it.on ? 'on' : ''}">${it.icon ? icon(it.icon) : ''}<span>${esc(it.label)}</span></button>`).join('')}<button data-act="sheet-cancel" style="justify-content:center;color:var(--text-2)">Отмена</button></div>`,
      actions: {
        pick(el) { picked = items[Number(el.dataset.i)]; sh.close('ok'); },
      },
      onClose: () => resolve(picked ? picked.value : null),
    });
  });
}

// Диалог подтверждения; requireWord — защита от случайного удаления
function confirmDialog({ title, text = '', ok = 'Удалить', cancel = 'Отмена', danger = true, requireWord = '' }) {
  return new Promise((resolve) => {
    const layer = document.createElement('div');
    layer.className = 'dialog-layer';
    layer.innerHTML = `<div class="sheet-backdrop" data-dlg="no"></div><div class="dialog" role="alertdialog" aria-modal="true">
      <h3>${esc(title)}</h3>${text ? `<p>${text}</p>` : ''}
      ${requireWord ? `<input class="input" data-dlg-word autocomplete="off" placeholder="Введите слово «${esc(requireWord)}»">` : ''}
      <div class="dialog-actions"><button class="btn btn-outline" data-dlg="no">${esc(cancel)}</button><button class="btn ${danger ? 'btn-danger-solid' : 'btn-primary'}" data-dlg="yes" ${requireWord ? 'disabled' : ''}>${esc(ok)}</button></div></div>`;
    $('#overlays').appendChild(layer);
    const word = $('[data-dlg-word]', layer);
    if (word) {
      word.addEventListener('input', () => { $('[data-dlg="yes"]', layer).disabled = norm(word.value) !== norm(requireWord); });
      setTimeout(() => word.focus(), 50);
    }
    layer.addEventListener('click', (e) => {
      const b = e.target.closest('[data-dlg]');
      if (!b) return;
      layer.remove();
      resolve(b.dataset.dlg === 'yes');
    });
  });
}

// ── Уведомление внизу ──
let toastTimer = null;
let toastAction = null;
function toast(msg, opts = {}) {
  const t = $('#toast');
  t.innerHTML = `<span>${esc(msg)}</span>${opts.action ? `<button data-act="toast-action">${esc(opts.action)}</button>` : ''}`;
  toastAction = opts.onAction || null;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), opts.ms || (opts.action ? 5000 : 2800));
}

// Внешние действия в заглушке не выполняются: номера и ники выдуманные
function demoExternal(text) {
  toast(text);
}

// ── Обработка событий ──
const ACTIONS = {};
const INPUTS = {};
function sheetOf(el) {
  const layer = el.closest('.sheet-layer');
  return layer ? sheets.find((s) => s.el === layer) || null : null;
}
function readValue(el) {
  if (el.type === 'checkbox') return el.checked;
  return el.value;
}
function setPath(obj, path, value) {
  const keys = path.split('.');
  let o = obj;
  for (let i = 0; i < keys.length - 1; i += 1) {
    const k = keys[i];
    if (o[k] == null) o[k] = /^\d+$/.test(keys[i + 1]) ? [] : {};
    o = o[k];
  }
  o[keys[keys.length - 1]] = value;
}
function getPath(obj, path) {
  return path.split('.').reduce((o, k) => (o == null ? o : o[k]), obj);
}

function bindEvents() {
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]');
    if (!el || el.disabled) return;
    const act = el.dataset.act;
    const sh = sheetOf(el);
    if (sh && sh.actions && sh.actions[act]) {
      e.preventDefault();
      sh.actions[act](el, e, sh);
      return;
    }
    if (sh && (act === 'sheet-cancel' || act === 'sheet-dismiss')) {
      e.preventDefault();
      if (sh.onCancel) sh.onCancel(sh); else sh.close('cancel');
      return;
    }
    if (ACTIONS[act]) {
      e.preventDefault();
      ACTIONS[act](el, e);
    }
  });
  const onField = (e, kind) => {
    const el = e.target;
    if (!el.dataset) return;
    const sh = sheetOf(el);
    if (el.dataset.bind && sh) {
      const handler = kind === 'input' ? sh.onInput : sh.onChange;
      if (handler) handler.call(sh, el.dataset.bind, readValue(el), el, e);
      return;
    }
    const key = el.dataset[kind === 'input' ? 'in' : 'ch'];
    if (key && INPUTS[key]) INPUTS[key](el, e);
  };
  document.addEventListener('input', (e) => onField(e, 'input'));
  document.addEventListener('change', (e) => onField(e, 'change'));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if ($('#viewer').classList.contains('show')) { closeViewer(); return; }
      if ($('#print-root').classList.contains('show')) { closePrint(); return; }
      const sh = topSheet();
      if (sh) { if (sh.onCancel) sh.onCancel(sh); else sh.close('cancel'); }
    }
  });
  window.addEventListener('hashchange', () => {
    const cur = parseRoute().path;
    if (navStack.length && navStack[navStack.length - 1] === cur) navStack.pop();
    render();
  });
  $('#file-input').addEventListener('change', onFilesPicked);
}

ACTIONS.tab = (el) => {
  closeAllSheets();
  const id = el.dataset.id;
  if (id === 'clients' && UI.tab === 'clients' && parseRoute().path === '/clients') {
    const sc = $('.scroller');
    if (sc) sc.scrollTop = 0;
    return;
  }
  switchTab(id);
};
ACTIONS.back = (el) => goBack(el.dataset.to);
ACTIONS['toast-action'] = () => {
  $('#toast').classList.remove('show');
  if (toastAction) toastAction();
};
ACTIONS.sync = () => openSyncSheet();
