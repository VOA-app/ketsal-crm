// Экран входа, первый запуск, просмотр фото, печать карты, сценарии для проверки, тема и автоблокировка.

// ── Тема ──
function applyTheme() {
  const t = S.settings.theme;
  if (t === 'auto') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', t);
}

// ── Вход ──
const lockState = { pin: '', mode: 'pin', error: '' };
function showLock() {
  UI.locked = true;
  clearTimeout(idleTimer);
  lockState.pin = '';
  lockState.error = '';
  lockState.mode = S.settings.quickUnlock === 'password' ? 'password' : 'pin';
  renderLock();
  $('#lock').classList.add('show');
}
function renderLock() {
  const s = S.settings;
  const pin = lockState.mode === 'pin';
  $('#lock').innerHTML = `<div class="lock-bird">${ASSETS.bird}</div>
    <div class="lock-logo">${ASSETS.logo}</div>
    ${pin ? `
      <div class="lock-sub">Введите код</div>
      <div class="pin-dots" id="pin-dots" aria-live="polite" aria-label="Введено цифр: ${lockState.pin.length} из 6">${[0, 1, 2, 3, 4, 5].map((i) => `<i class="${i < lockState.pin.length ? 'on' : ''}"></i>`).join('')}</div>
      <div class="lock-hint" id="lock-hint">${esc(lockState.error || 'В заглушке подойдёт любой код из 6 цифр')}</div>
      <div class="keypad">
        ${['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((n) => `<button class="key" data-act="pin" data-v="${n}">${n}</button>`).join('')}
        ${s.quickUnlock === 'faceid' ? `<button class="key key--flat" data-act="faceid" aria-label="Войти по Face ID">${icon('faceid')}</button>` : '<span></span>'}
        <button class="key" data-act="pin" data-v="0">0</button>
        <button class="key key--flat" data-act="pin-del" aria-label="Стереть цифру">${icon('backspace')}</button>
      </div>
      <div class="lock-links"><button class="btn-link" data-act="lock-mode" data-v="password">Войти по мастер-паролю</button></div>`
    : `
      <div class="lock-sub">Введите мастер-пароль</div>
      <div class="lock-pass">
        <input class="input" type="password" id="lock-pass" placeholder="Мастер-пароль" autocomplete="current-password" aria-label="Мастер-пароль">
        <div class="lock-hint">${esc(lockState.error || 'В заглушке подойдёт любой пароль')}</div>
        <button class="btn btn-primary btn-block" data-act="unlock-pass">Войти</button>
        ${s.quickUnlock !== 'password' ? '<button class="btn btn-ghost btn-block" data-act="lock-mode" data-v="pin">Ввести код</button>' : ''}
      </div>`}`;
  if (!pin) setTimeout(() => { const i = $('#lock-pass'); if (i) i.focus(); }, 60);
}
function updatePinDots() {
  $$('#pin-dots i').forEach((d, i) => d.classList.toggle('on', i < lockState.pin.length));
}
function unlock() {
  UI.locked = false;
  $('#lock').classList.remove('show');
  $('#lock').innerHTML = '';
  resetIdle();
  render();
}
function pressPin(v) {
  if (lockState.pin.length >= 6) return;
  lockState.pin += v;
  lockState.error = '';
  updatePinDots();
  if (lockState.pin.length === 6) setTimeout(unlock, 160);
}
ACTIONS.pin = (el) => pressPin(el.dataset.v);
ACTIONS['pin-del'] = () => { lockState.pin = lockState.pin.slice(0, -1); updatePinDots(); };
ACTIONS.faceid = () => {
  const box = document.createElement('div');
  box.className = 'faceid-anim';
  box.innerHTML = `<div>${icon('faceid')}</div>`;
  $('#lock').appendChild(box);
  setTimeout(unlock, 850);
};
ACTIONS['lock-mode'] = (el) => { lockState.mode = el.dataset.v; lockState.error = ''; lockState.pin = ''; renderLock(); };
ACTIONS['unlock-pass'] = () => {
  const v = $('#lock-pass') ? $('#lock-pass').value : '';
  if (!v) { lockState.error = 'Введите пароль'; renderLock(); return; }
  unlock();
};
ACTIONS['lock-now'] = () => showLock();

// ── Автоблокировка ──
let idleTimer = null;
let hiddenAt = 0;
function resetIdle() {
  clearTimeout(idleTimer);
  const m = Number(S.settings.autoLock) || 0;
  if (!m || UI.locked) return;
  idleTimer = setTimeout(showLock, m * 60000);
}
function bindIdle() {
  let last = 0;
  const poke = () => {
    const now = Date.now();
    if (now - last < 1000) return;
    last = now;
    resetIdle();
  };
  ['pointerdown', 'keydown', 'wheel', 'touchstart'].forEach((ev) => document.addEventListener(ev, poke, { passive: true }));
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) hiddenAt = Date.now();
    else if (hiddenAt && Date.now() - hiddenAt > 60000 && !UI.locked && Number(S.settings.autoLock)) showLock();
  });
  document.addEventListener('keydown', (e) => {
    if (!UI.locked || lockState.mode !== 'pin' || !$('#lock').classList.contains('show')) return;
    if (/^\d$/.test(e.key)) pressPin(e.key);
    else if (e.key === 'Backspace') ACTIONS['pin-del']();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target && e.target.id === 'lock-pass') ACTIONS['unlock-pass']();
  });
}

// ── Первый запуск ──
const onb = { step: 0, pass: '', pass2: '', key: '', saved: false, verify: ['', '', '', ''], pos: [], quick: 'faceid', pin: '', pin2: '', connecting: false };
const ONB_STEPS = 7;
function genRecoveryKey() {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = new Uint8Array(52);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => abc[b % abc.length]).join('');
}
function startOnboarding() {
  closeAllSheets();
  Object.assign(onb, { step: 0, pass: '', pass2: '', saved: false, verify: ['', '', '', ''], quick: 'faceid', pin: '', pin2: '', connecting: false });
  onb.key = genRecoveryKey();
  const pos = new Set();
  while (pos.size < 4) pos.add(Math.floor(Math.random() * 52));
  onb.pos = Array.from(pos).sort((a, b) => a - b);
  renderOnb();
  $('#onb').classList.add('show');
}
function passStrength(p) {
  let s = 0;
  if (p.length >= 10) s += 1;
  if (p.length >= 14) s += 1;
  if (/[a-zа-яё]/.test(p) && /[A-ZА-ЯЁ]/.test(p)) s += 1;
  if (/\d/.test(p)) s += 1;
  if (/[^\wа-яё]/i.test(p)) s += 1;
  return s;
}
function onbCanNext() {
  if (onb.step === 1) return false;
  if (onb.step === 2) return passStrength(onb.pass) >= 3 && onb.pass === onb.pass2;
  if (onb.step === 3) return onb.saved;
  if (onb.step === 4) return onb.pos.every((p, i) => (onb.verify[i] || '').toUpperCase() === onb.key[p]);
  if (onb.step === 5) return onb.quick !== 'pin' || (/^\d{6}$/.test(onb.pin) && onb.pin === onb.pin2);
  return true;
}
function renderOnb() {
  const s = onb.step;
  let body = '';
  let foot = '';
  if (s === 0) {
    body = `<div class="onb-logo">${ASSETS.logo}</div>
      <h2 class="display">Карты клиентов студии</h2>
      <p>Клиенты, процедуры, пигменты и иглы, фото до и после, напоминания о коррекции. Работает на iPhone и без интернета.</p>
      <div class="onb-list">
        <div>${icon('lock')}<span>Всё шифруется прямо на телефоне мастер-паролем</span></div>
        <div>${icon('cloud')}<span>Копия хранится на вашем Яндекс Диске и открывается на другом устройстве</span></div>
        <div>${icon('phone')}<span>Установите на экран «Домой»: в Safari нажмите «Поделиться», затем «На экран Домой»</span></div>
      </div>`;
    foot = '<button class="btn btn-primary" data-act="onb-next">Начать</button>';
  } else if (s === 1) {
    body = `<h2 class="display">Подключите Яндекс Диск</h2>
      <p>Данные лежат в отдельной папке приложения на вашем Диске. Файлы зашифрованы на телефоне, Яндекс видит только зашифрованные файлы. Остальной Диск приложению не виден.</p>
      <div class="onb-list"><div>${icon('shield')}<span>Права доступа: только папка приложения</span></div><div>${icon('refresh')}<span>Синхронизация между iPhone и компьютером</span></div></div>`;
    foot = `<button class="btn btn-primary" data-act="onb-yandex" ${onb.connecting ? 'disabled' : ''}>${onb.connecting ? 'Подключаем…' : 'Войти через Яндекс'}</button><p class="note" style="text-align:center;margin:0">В заглушке вход только показан, Яндекс не открывается</p>`;
  } else if (s === 2) {
    const st = passStrength(onb.pass);
    const label = !onb.pass ? '' : st < 3 ? 'Слабый: добавьте длину, цифры и знаки' : st < 4 ? 'Нормальный' : 'Надёжный';
    body = `<h2 class="display">Придумайте мастер-пароль</h2>
      <p>Им шифруются все данные. Без пароля и ключа восстановления базу не открыть, даже нам. Так задумано.</p>
      ${field('Пароль', `<input class="input" type="password" data-onb="pass" value="${esc(onb.pass)}" autocomplete="new-password">`)}
      <div class="strength"><i style="width:${(Math.min(st, 5) / 5) * 100}%"></i></div>
      <p class="hint" style="margin-top:0" id="onb-strength">${esc(label || 'Минимум 10 символов, лучше фраза из нескольких слов')}</p>
      ${field('Повторите пароль', `<input class="input" type="password" data-onb="pass2" value="${esc(onb.pass2)}" autocomplete="new-password">`)}`;
    foot = `<button class="btn btn-primary" data-act="onb-next" id="onb-next" ${onbCanNext() ? '' : 'disabled'}>Дальше</button>`;
  } else if (s === 3) {
    const groups = onb.key.match(/.{4}/g);
    body = `<h2 class="display">Ключ восстановления</h2>
      <p>Если пароль забудется, открыть данные можно только этим ключом. Сохраните его в надёжном месте. Больше он не покажется.</p>
      <div class="recovery" aria-label="Ключ восстановления">${groups.map((g) => `<span>${g}</span>`).join('')}</div>
      <div class="btn-row" style="margin-bottom:14px"><button class="btn btn-outline" data-act="onb-copy">${icon('copy')} Скопировать</button></div>
      <label class="check" style="border:0"><input type="checkbox" data-onb="saved" ${onb.saved ? 'checked' : ''}><span>Ключ сохранён в надёжном месте</span></label>`;
    foot = `<button class="btn btn-primary" data-act="onb-next" id="onb-next" ${onbCanNext() ? '' : 'disabled'}>Дальше</button>`;
  } else if (s === 4) {
    body = `<h2 class="display">Проверим ключ</h2>
      <p>Введите символы ключа с этими номерами. Так мы убедимся, что ключ сохранён.</p>
      <div class="verify">${onb.pos.map((p, i) => `<label>№ ${p + 1}<input class="input" maxlength="1" data-onb="v${i}" value="${esc(onb.verify[i])}" autocomplete="off" autocapitalize="characters"></label>`).join('')}</div>
      <button class="btn-link" data-act="onb-back">Посмотреть ключ ещё раз</button>
      <p class="note">Подсказка для заглушки: ${onb.pos.map((p) => onb.key[p]).join(' ')}</p>`;
    foot = `<button class="btn btn-primary" data-act="onb-next" id="onb-next" ${onbCanNext() ? '' : 'disabled'}>Дальше</button>`;
  } else if (s === 5) {
    const opt = (v, ic, t, d) => `<button class="opt-card ${onb.quick === v ? 'on' : ''}" data-act="onb-quick" data-v="${v}">${icon(ic)}<div><div class="t">${t}</div><div class="s">${d}</div></div></button>`;
    body = `<h2 class="display">Быстрый вход</h2>
      <p>Чтобы не вводить длинный пароль каждый раз.</p>
      ${opt('faceid', 'faceid', 'Face ID', 'Удобно и надёжно')}
      ${opt('pin', 'pin', 'Код из 6 цифр', 'После пяти ошибок понадобится мастер-пароль')}
      ${opt('password', 'key', 'Только мастер-пароль', 'Самый строгий вариант')}
      ${onb.quick === 'pin' ? `<div class="grid-2" style="margin-top:6px">${field('Код', `<input class="input" inputmode="numeric" maxlength="6" data-onb="pin" value="${esc(onb.pin)}" autocomplete="off">`)}${field('Ещё раз', `<input class="input" inputmode="numeric" maxlength="6" data-onb="pin2" value="${esc(onb.pin2)}" autocomplete="off">`)}</div>` : ''}`;
    foot = `<button class="btn btn-primary" data-act="onb-next" id="onb-next" ${onbCanNext() ? '' : 'disabled'}>Дальше</button>`;
  } else {
    body = `<div class="onb-logo">${ASSETS.logo}</div>
      <h2 class="display">Всё готово</h2>
      <p>Хранилище создано и подключено к Яндекс Диску. Можно заводить первую карту.</p>
      <p>Для проверки заглушки можно оставить выдуманных клиентов или начать с пустой базы: тогда первая карта получит № 1.</p>`;
    foot = '<button class="btn btn-primary" data-act="onb-finish" data-v="keep">Оставить демо-данные</button><button class="btn btn-outline" data-act="onb-finish" data-v="empty">Начать с пустой базы</button>';
  }
  $('#onb').innerHTML = `<div class="onb-top">${s > 0 && s < ONB_STEPS - 1 ? `<button class="icon-btn" data-act="onb-back" aria-label="Назад">${icon('back')}</button>` : '<span style="width:44px"></span>'}<div class="steps">${Array.from({ length: ONB_STEPS }, (_, i) => `<i class="${i <= s ? 'on' : ''}"></i>`).join('')}</div><button class="btn btn-ghost btn-sm" data-act="onb-close">Закрыть</button></div>
    <div class="onb-body">${body}</div><div class="onb-foot">${foot}</div>`;
}
function onbInput(el) {
  const k = el.dataset.onb;
  if (k === 'saved') onb.saved = el.checked;
  else if (/^v\d$/.test(k)) onb.verify[Number(k[1])] = el.value.trim();
  else onb[k] = el.value;
  if (onb.step === 2) {
    const st = passStrength(onb.pass);
    const bar = $('#onb .strength i');
    if (bar) bar.style.width = `${(Math.min(st, 5) / 5) * 100}%`;
    const lab = $('#onb-strength');
    if (lab) lab.textContent = !onb.pass ? 'Минимум 10 символов, лучше фраза из нескольких слов' : st < 3 ? 'Слабый: добавьте длину, цифры и знаки' : st < 4 ? 'Нормальный' : 'Надёжный';
  }
  const next = $('#onb-next');
  if (next) next.disabled = !onbCanNext();
}
['input', 'change'].forEach((ev) => document.addEventListener(ev, (e) => {
  if (e.target && e.target.dataset && e.target.dataset.onb) onbInput(e.target);
}));
ACTIONS['onb-next'] = () => {
  if (!onbCanNext()) return;
  onb.step = Math.min(ONB_STEPS - 1, onb.step + 1);
  renderOnb();
};
ACTIONS['onb-back'] = () => { onb.step = Math.max(0, onb.step - 1); renderOnb(); };
ACTIONS['onb-close'] = () => { $('#onb').classList.remove('show'); };
ACTIONS['onb-yandex'] = () => {
  onb.connecting = true;
  renderOnb();
  setTimeout(() => { onb.connecting = false; onb.step = 2; renderOnb(); toast('Яндекс Диск подключён'); }, 1100);
};
ACTIONS['onb-copy'] = async () => {
  const ok = await copyText(onb.key.match(/.{4}/g).join('-'));
  toast(ok ? 'Ключ скопирован' : 'Не удалось скопировать');
};
ACTIONS['onb-quick'] = (el) => { onb.quick = el.dataset.v; renderOnb(); };
ACTIONS['onb-finish'] = (el) => {
  S.settings.quickUnlock = onb.quick;
  S.settings.onboarded = true;
  $('#onb').classList.remove('show');
  if (el.dataset.v === 'empty') {
    clearToEmpty();
    toast('Готово. Первая карта получит № 1');
  } else {
    saveState();
    render();
    toast('Готово');
  }
  if (UI.locked) unlock();
};

// ── Просмотр фото ──
let viewer = null;
function openViewer(items, index = 0) {
  if (!items.length) return;
  viewer = { mode: 'single', items, i: clamp(index, 0, items.length - 1) };
  renderViewer();
  $('#viewer').classList.add('show');
}
function openCompare(a, b) {
  viewer = { mode: 'compare', a, b };
  renderViewer();
  $('#viewer').classList.add('show');
}
function closeViewer() {
  $('#viewer').classList.remove('show');
  $('#viewer').innerHTML = '';
  viewer = null;
}
function renderViewer() {
  const el = $('#viewer');
  const close = `<button class="icon-btn" data-act="viewer-close" aria-label="Закрыть">${icon('close')}</button>`;
  if (viewer.mode === 'compare') {
    const fig = (x) => `<figure><img src="${x.src}" alt="${esc(x.title)}"><figcaption>${esc(x.title)} <small>${esc(x.sub)}</small></figcaption></figure>`;
    el.innerHTML = `<div class="viewer-top"><span style="width:44px"></span><span class="viewer-count">Сравнение</span>${close}</div><div class="compare">${fig(viewer.a)}${fig(viewer.b)}</div>`;
    return;
  }
  const it = viewer.items[viewer.i];
  const many = viewer.items.length > 1;
  el.innerHTML = `<div class="viewer-top"><span style="width:44px"></span><span class="viewer-count">${many ? `${viewer.i + 1} из ${viewer.items.length}` : ''}</span>${close}</div>
    <div class="viewer-img" id="viewer-img"><img src="${it.src}" alt="${esc(it.title)}" draggable="false">${many ? `<button class="viewer-nav prev" data-act="viewer-step" data-v="-1" aria-label="Предыдущее фото">${icon('chevLeft')}</button><button class="viewer-nav next" data-act="viewer-step" data-v="1" aria-label="Следующее фото">${icon('chev')}</button>` : ''}</div>
    <div class="viewer-cap">${esc(it.title)}<small>${esc(it.sub || '')}</small></div>`;
  const area = $('#viewer-img');
  let x0 = null;
  area.addEventListener('pointerdown', (e) => { x0 = e.clientX; });
  area.addEventListener('pointerup', (e) => {
    if (x0 === null) return;
    const dx = e.clientX - x0;
    x0 = null;
    if (Math.abs(dx) > 50 && many) stepViewer(dx < 0 ? 1 : -1);
  });
}
function stepViewer(k) {
  if (!viewer || viewer.mode !== 'single') return;
  viewer.i = (viewer.i + k + viewer.items.length) % viewer.items.length;
  renderViewer();
}
ACTIONS['viewer-close'] = closeViewer;
ACTIONS['viewer-step'] = (el) => stepViewer(Number(el.dataset.v));
document.addEventListener('keydown', (e) => {
  if (!viewer) return;
  if (e.key === 'ArrowRight') stepViewer(1);
  if (e.key === 'ArrowLeft') stepViewer(-1);
});

// ── Печать и PDF карты клиента ──
const printOpts = { materials: true, photos: true, health: false };
let printClientId = null;
function openPrint(clientId) {
  printClientId = clientId;
  renderPrint();
  $('#print-root').classList.add('show');
  fitPrint();
}
function closePrint() {
  $('#print-root').classList.remove('show');
  $('#print-root').innerHTML = '';
  printClientId = null;
}
function fitPrint() {
  const page = $('#print-page');
  if (!page) return;
  page.style.zoom = '';
  const avail = window.innerWidth - 16;
  const w = page.offsetWidth;
  if (w > avail) page.style.zoom = String(avail / w);
}
function renderPrint() {
  const c = IDX.client.get(printClientId);
  if (!c) { closePrint(); return; }
  const inf = clientInfo(c);
  const cons = c.consents || {};
  const procs = inf.procs.slice().reverse();
  const done = procs.filter((p) => p.status === 'done');
  const pp = (k, v) => `<div class="pp-kv"><span class="k">${esc(k)}</span><span>${v}</span></div>`;
  const rows = procs.map((p) => {
    const mats = [
      p.anesthesia.primary ? `Анестезия: ${anestName(p.anesthesia.primary)}${p.anesthesia.secondary ? `; ${anestName(p.anesthesia.secondary)}` : ''}` : '',
      p.pigments.length ? `${p.type === 'removal' ? 'Ремувер' : 'Пигменты'}: ${p.pigments.map((g) => `${pigmentFull(g.pigmentId)}, партия ${g.lot}${g.ratio ? `, ${g.ratio}` : ''}`).join(' + ')}` : '',
      p.needles.length ? `Игла: ${p.needles.map(needleName).join(', ')}` : '',
    ].filter(Boolean).map(esc).join('<br>');
    const disc = discountAmount(p.price, p.discount);
    const dim = p.status !== 'done';
    return `<tr><td class="nowrap">${fmtDateNum(p.date)}</td><td>${esc(serviceName(p.serviceId))}<br><span style="color:#6E7674">${esc(TYPE_LABEL[p.type])}${dim ? `, ${esc(lc(STATUS_LABEL[p.status]))}` : ''}</span></td><td>${esc(zoneName(p.zone))}${p.technique ? `<br><span style="color:#6E7674">${esc(p.technique)}</span>` : ''}</td>${printOpts.materials ? `<td>${mats || '—'}</td>` : ''}<td class="r">${dim ? '—' : fmtMoney(p.price)}</td><td class="r">${disc && !dim ? `−${fmtMoney(disc)}` : '—'}</td><td class="r">${dim ? '—' : fmtMoney(totalOf(p))}</td></tr>`;
  }).join('');
  const photos = [];
  if (printOpts.photos) {
    for (const p of procs) for (const st of PHOTO_STAGES) for (const id of (p.photos && p.photos[st.id]) || []) photos.push({ id, p, st });
  }
  const cols = printOpts.materials ? 7 : 6;
  $('#print-root').innerHTML = `<div class="print-toolbar">
      <div style="display:flex;align-items:center;gap:10px"><button class="btn btn-outline btn-sm" data-act="print-close">${icon('close', 'i-sm')} Закрыть</button><b style="font-size:15px">Карта № ${c.cardNo}</b></div>
      <div class="print-opts">
        <label><input type="checkbox" data-ch="print-opt" data-k="materials" ${printOpts.materials ? 'checked' : ''}> Материалы</label>
        <label><input type="checkbox" data-ch="print-opt" data-k="photos" ${printOpts.photos ? 'checked' : ''}> Фото</label>
        <label><input type="checkbox" data-ch="print-opt" data-k="health" ${printOpts.health ? 'checked' : ''}> Данные о здоровье</label>
      </div>
      <button class="btn btn-primary btn-sm" data-act="print-go">${icon('print', 'i-sm')} Печать или PDF</button>
    </div>
    <div class="print-page" id="print-page">
      <div class="pp-head"><div class="pp-logo">${ASSETS.logo}</div><div class="pp-title"><div class="display">Карта клиента</div><div class="no">№ ${c.cardNo}</div><div class="d">Сформирована ${esc(fmtDate(todayISO(), true))}</div></div></div>
      <div class="pp-sec"><h4>Клиент</h4><div class="pp-grid">
        ${pp('ФИО', esc(formalName(c)))}
        ${pp('Телефон', esc(fmtPhone(c.phone)))}
        ${pp('Дата рождения', c.birth ? esc(fmtDateNum(c.birth)) : '—')}
        ${pp('Первый визит', inf.first ? esc(fmtDateNum(inf.first.date)) : '—')}
        ${pp('Согласие на данные', cons.pd && cons.pd.date ? esc(fmtDateNum(cons.pd.date)) : 'нет')}
        ${pp('Согласие на процедуру', cons.procedure && cons.procedure.date ? esc(fmtDateNum(cons.procedure.date)) : 'нет')}
      </div></div>
      ${printOpts.health ? `<div class="pp-sec pp-health"><h4>Анкета здоровья${c.health && c.health.filledAt ? ` от ${esc(fmtDateNum(c.health.filledAt))}` : ''}</h4>${healthMarks(c).length ? `<ul>${healthMarks(c).map((m) => `<li>${esc(m)}</li>`).join('')}</ul>` : '<div>Отметок нет</div>'}${cons.health && cons.health.date ? `<div style="margin-top:2mm;color:#6E7674">Согласие на обработку данных о здоровье от ${esc(fmtDateNum(cons.health.date))}</div>` : ''}</div>` : ''}
      <div class="pp-sec"><h4>Процедуры</h4>${procs.length ? `<table class="pp-table"><thead><tr><th>Дата</th><th>Услуга</th><th>Зона</th>${printOpts.materials ? '<th>Материалы</th>' : ''}<th class="r">Стоимость</th><th class="r">Скидка</th><th class="r">Итого</th></tr></thead><tbody>${rows}</tbody><tfoot><tr><td colspan="${cols - 1}">Итого за ${pl(done.length, 'процедуру', 'процедуры', 'процедур')}</td><td class="r">${fmtMoney(inf.spent)}</td></tr></tfoot></table>` : '<div>Процедур пока нет</div>'}</div>
      ${photos.length ? `<div class="pp-sec"><h4>Фото</h4><div class="pp-photos">${photos.slice(0, 16).map((x) => `<figure><img src="${photoSrc(x.id)}" alt=""><figcaption>${esc(x.st.label)} · ${esc(zoneName(x.p.zone))} · ${esc(fmtDateNum(x.p.date))}</figcaption></figure>`).join('')}</div></div>` : ''}
      <div class="pp-foot"><span>Студия красоты «Кетсаль» · Ульяновск, пр. Нариманова, 44, 2 этаж</span><span>+7 (917) 619-24-27</span></div>
    </div>`;
}
INPUTS['print-opt'] = (el) => {
  printOpts[el.dataset.k] = el.checked;
  renderPrint();
  fitPrint();
};
ACTIONS['print-close'] = closePrint;
ACTIONS['print-go'] = () => window.print();

// ── Сценарии для проверки ──
function findDemo(key) {
  return S.clients.find((c) => c.demoKey === key) || null;
}
function ensureUnlocked() {
  if (UI.locked) unlock();
  $('#onb').classList.remove('show');
  closeViewer();
  closePrint();
  closeAllSheets();
}
function openScenarioClient(key, tab = 'history') {
  const c = findDemo(key);
  if (!c) { toast('Этой клиентки нет в базе. Верните демо-данные в настройках'); return null; }
  UI.clientTab[c.id] = tab;
  UI.tab = 'clients';
  navStack.length = 0;
  navStack.push('/clients');
  goReplace(`/client/${c.id}`);
  return c;
}
function toClients(view) {
  UI.clientView = view;
  UI.clientSearch = '';
  switchTab('clients');
}
const later = (fn) => setTimeout(fn, 380);

const GUIDE = [
  { group: 'Вход и безопасность', items: [
    { id: 'onb', t: 'Первый запуск', d: 'Яндекс Диск, мастер-пароль, ключ восстановления, быстрый вход', run: () => startOnboarding() },
    { id: 'lock', t: 'Вход по коду или Face ID', d: 'Любой код из 6 цифр. Автоблокировка через 5 минут без действий', run: () => showLock() },
  ] },
  { group: 'Клиенты', items: [
    { id: 'search', t: 'Поиск клиента', d: 'По имени, любому куску телефона или номеру карты: «смир», «8917 104», «45-67», «№ 12»', run: () => { toClients('all'); later(() => { const i = $('#client-search'); if (i) i.focus(); }); } },
    { id: 'new-client', t: 'Новая карта', d: 'Номер присваивается сам. Введите телефон +7 917 104-45-67, чтобы увидеть проверку дубля', run: () => { toClients('all'); later(() => openClientForm()); } },
    { id: 'card', t: 'Карта клиента', d: 'Елена Соколова: история за два года, фото по зонам, данные и итоги', run: () => openScenarioClient('S10', 'history') },
    { id: 'health', t: 'Анкета здоровья и согласия', d: 'Виктория Николаева: аллергия на лидокаин. Данные о здоровье скрыты до нажатия «Показать»', run: () => openScenarioClient('S14', 'data') },
    { id: 'purge', t: 'Полное удаление карты', d: 'Светлана Павлова: вкладка «Данные», внизу «Удалить карту полностью»', run: () => openScenarioClient('S9', 'data') },
  ] },
  { group: 'Процедуры', items: [
    { id: 'proc-new', t: 'Первичная процедура', d: 'Услуга, зона, техника, анестезия, пигменты с партией, игла, фото, скидка, оплата', run: () => { const c = openScenarioClient('S9', 'history'); if (c) later(() => openProcForm({ clientId: c.id })); } },
    { id: 'repeat', t: 'Коррекция «как в прошлый раз»', d: 'Анна Смирнова: материалы подставятся сами, останется отметить, как зажило', run: () => { const c = openScenarioClient('S1'); if (c) later(() => openProcForm({ clientId: c.id, draft: repeatDraft(c.id, 'brows') })); } },
    { id: 'allergy', t: 'Предупреждение об аллергии', d: 'Виктория: смените первичную анестезию на крем с лидокаином', run: () => { const c = openScenarioClient('S14'); if (c) later(() => openProcForm({ clientId: c.id, draft: repeatDraft(c.id, 'brows') })); } },
    { id: 'expired', t: 'Просроченная партия', d: 'В пигменте «Тёплый шоколад» выберите партию A-2311', run: () => { const c = openScenarioClient('S1'); if (c) later(() => openProcForm({ clientId: c.id, draft: repeatDraft(c.id, 'brows') })); } },
    { id: 'discount', t: 'Скидка в % или ₽', d: 'Переключатель % и ₽, причина скидки, итог пересчитывается сразу', run: () => { const c = openScenarioClient('S12'); if (c) later(() => openProcForm({ clientId: c.id, draft: repeatDraft(c.id, 'lips') })); } },
    { id: 'cert', t: 'Оплата сертификатом', d: 'Способ оплаты «Сертификат», № С-004. После сохранения он станет использованным', run: () => { const c = openScenarioClient('S7'); if (c) later(() => openProcForm({ clientId: c.id, draft: repeatDraft(c.id, 'brows') })); } },
    { id: 'model', t: 'Работа на модели', d: 'Ирина Морозова: модель курса по камуфляжу, скидка 50 %', run: () => openScenarioClient('S8') },
    { id: 'journal', t: 'Журнал процедур', d: 'Сегодня, 7 дней, месяц: сумма, скидки, неявки. Поиск по пигменту и партии', run: () => { ensureUnlocked(); switchTab('procedures'); } },
    { id: 'photos', t: 'Фото и сравнение', d: 'Елена Соколова → «Фото» → «Сравнить „до“ и „через месяц“»', run: () => openScenarioClient('S10', 'photos') },
  ] },
  { group: 'Напоминания', items: [
    { id: 'corr', t: 'Кому пора на коррекцию', d: 'Окно с 28 по 56 день. Красная точка — просрочено', run: () => toClients('corr') },
    { id: 'upd', t: 'Кому пора обновить', d: 'Через 12–18 месяцев после последней процедуры в зоне', run: () => toClients('upd') },
    { id: 'msg', t: 'Напоминание по шаблону', d: 'Кнопка «Написать»: текст копируется, клиентка уходит вниз списка на две недели', run: () => toClients('corr') },
    { id: 'bday', t: 'Дни рождения', d: 'Ближайшие 30 дней, кнопка «Поздравить»', run: () => toClients('bday') },
    { id: 'lost', t: 'Давно не были', d: 'Больше 24 месяцев без визитов', run: () => toClients('lost') },
  ] },
  { group: 'Справочники, отчёты, данные', items: [
    { id: 'refs', t: 'Справочники', d: 'Прайс, пигменты с партиями и сроками, иглы, анестезия, зоны, курсы', run: () => { ensureUnlocked(); switchTab('refs'); } },
    { id: 'reports', t: 'Отчёты', d: 'Выручка по месяцам, услуги, зоны, пигменты, скидки, модели', run: () => { ensureUnlocked(); switchTab('more'); go('/more/reports'); } },
    { id: 'expenses', t: 'Расходники', d: 'Что купили, стоимость, дата покупки. Итоги по категориям — в отчётах', run: () => { ensureUnlocked(); switchTab('more'); go('/more/expenses'); } },
    { id: 'certs', t: 'Подарочные сертификаты', d: 'Продажа, срок действия, кто и когда использовал', run: () => { ensureUnlocked(); switchTab('more'); go('/more/certificates'); } },
    { id: 'print', t: 'Печать и PDF карты', d: 'С материалами и фото, данные о здоровье — по галочке', run: () => { const c = openScenarioClient('S10'); if (c) later(() => openPrint(c.id)); } },
    { id: 'backup', t: 'Резервная копия и Excel', d: 'Копия одним файлом, восстановление, выгрузка CSV с предупреждением', run: () => { ensureUnlocked(); switchTab('more'); go('/more/backup'); } },
    { id: 'settings', t: 'Настройки', d: 'Окна напоминаний, вход, тема, шаблоны, очистка базы и старт с № 1', run: () => { ensureUnlocked(); switchTab('more'); go('/more/settings'); } },
  ] },
];

function guideListHtml() {
  const checks = guideChecks();
  return GUIDE.map((g) => `<div class="guide-group">${esc(g.group)}</div>${g.items.map((it) => `<div class="gitem ${checks[it.id] ? 'done' : ''}">
    <label class="check"><input type="checkbox" data-ch="guide-check" data-id="${it.id}" ${checks[it.id] ? 'checked' : ''} aria-label="Проверено: ${esc(it.t)}"></label>
    <div class="gitem-main"><div class="gitem-t">${esc(it.t)}</div><div class="gitem-d">${esc(it.d)}</div></div>
    <button class="btn btn-secondary" data-act="guide-run" data-id="${it.id}">Показать</button>
  </div>`).join('')}`).join('');
}
function guideProgress() {
  const checks = guideChecks();
  const total = GUIDE.reduce((n, g) => n + g.items.length, 0);
  const done = GUIDE.reduce((n, g) => n + g.items.filter((it) => checks[it.id]).length, 0);
  return { total, done };
}
function renderGuidePanel() {
  const panel = $('#guide-panel');
  if (!panel || getComputedStyle(panel).display === 'none') return;
  const list = $('.guide-list', panel);
  const top = list ? list.scrollTop : 0;
  const { total, done } = guideProgress();
  panel.innerHTML = `<div class="guide-head"><h2 class="display">Сценарии для проверки</h2><p>Нажмите «Показать», и приложение слева откроет нужный экран. Отмечайте проверенное: отметки сохраняются.</p><div class="guide-progress"><div class="bar"><i style="width:${(done / total) * 100}%"></i></div><span>${done} из ${total}</span></div></div>
    <div class="guide-list">${guideListHtml()}</div>
    <div class="guide-foot">Все клиенты и телефоны выдуманы, цены и марки пигментов условные. Данные хранятся только в этом браузере. Звонки и сообщения не отправляются.</div>`;
  const l2 = $('.guide-list', panel);
  if (l2) l2.scrollTop = top;
}
function screenGuide() {
  const { total, done } = guideProgress();
  return `<div class="screen">
    ${navBar({ title: 'Сценарии', backTo: '/more' })}
    <div class="scroller">
      <p class="note" style="margin:6px 4px 0">Нажмите «Показать», и приложение откроет нужный экран. Отмечено ${done} из ${total}.</p>
      <div class="guide-list" style="padding:0;margin:0 -8px">${guideListHtml()}</div>
    </div>
  </div>`;
}
INPUTS['guide-check'] = (el) => {
  setGuideCheck(el.dataset.id, el.checked);
  renderGuidePanel();
  const row = el.closest('.gitem');
  if (row) row.classList.toggle('done', el.checked);
};
ACTIONS['guide-run'] = (el) => {
  const it = GUIDE.flatMap((g) => g.items).find((x) => x.id === el.dataset.id);
  if (!it) return;
  if (it.id !== 'lock') ensureUnlocked();
  else { closeAllSheets(); }
  it.run();
};
