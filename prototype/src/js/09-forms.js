// Формы в нижних шторках: карта клиента, согласия, анкета здоровья, процедура, сообщение, выбор клиента.

const errHtml = (text) => `<div class="field-err"><span class="dot dot--alert"></span>${esc(text)}</div>`;
function field(label, control, err = '', opt = '', wrap = 'label') {
  return `<${wrap} class="field ${err ? 'err' : ''}" ${err ? 'data-err="1"' : ''}><span class="field-label"><span>${esc(label)}</span>${opt ? `<span class="opt">${esc(opt)}</span>` : ''}</span>${control}${err ? errHtml(err) : ''}</${wrap}>`;
}
function thumbHtml(id, delAct, attrs = '', viewAttrs = '') {
  const img = `<img src="${photoSrc(id)}" alt="">`;
  return `<div class="thumb">${viewAttrs ? `<button type="button" style="display:block;width:100%;height:100%" ${viewAttrs}>${img}</button>` : img}<button type="button" class="thumb-del" data-act="${delAct}" ${attrs} aria-label="Удалить фото">${icon('close')}</button></div>`;
}
function scrollToError(sh) {
  setTimeout(() => {
    const el = $('[data-err]', sh.el);
    if (el) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, 30);
}
function emptyConsents() {
  return { pd: { date: '', photos: [] }, health: { date: '' }, procedure: { date: '', photos: [] } };
}
function normalizeConsents(cons) {
  const x = cons || {};
  return {
    pd: { date: (x.pd && x.pd.date) || '', photos: ((x.pd && x.pd.photos) || []).slice() },
    health: { date: (x.health && x.health.date) || '' },
    procedure: { date: (x.procedure && x.procedure.date) || '', photos: ((x.procedure && x.procedure.photos) || []).slice() },
  };
}

function consentEditor(d, k, label) {
  const cons = d.consents[k];
  const photos = k === 'health' ? '' : `<div class="photo-strip" style="margin-top:8px">${(cons.photos || []).map((id, i) => thumbHtml(id, 'del-consent-photo', `data-k="${k}" data-i="${i}"`)).join('')}<button type="button" class="photo-add" data-act="add-consent-photo" data-k="${k}" aria-label="Фото подписанного бланка">${icon('doc')}</button></div>`;
  return `<div class="field"><span class="field-label"><span>${esc(label)}</span>${k === 'health' ? '' : '<span class="opt">дата и фото бланка</span>'}</span>
    <div class="inline-actions"><input class="input" type="date" data-bind="consents.${k}.date" value="${esc(cons.date)}" max="${todayISO()}" aria-label="${esc(label)}: дата"><button type="button" class="btn btn-secondary" data-act="consent-today" data-k="${k}">Сегодня</button></div>${photos}</div>`;
}
// Общие действия для редакторов согласий (в форме карты и в отдельной шторке)
function consentActions(d, sh, newPhotos, removed) {
  return {
    'consent-today': (el) => { d.consents[el.dataset.k].date = todayISO(); sh.update(); },
    'add-consent-photo': (el) => pickPhotos((ids) => {
      d.consents[el.dataset.k].photos.push(...ids);
      newPhotos.push(...ids);
      sh.update();
    }),
    'del-consent-photo': (el) => {
      const arr = d.consents[el.dataset.k].photos;
      const [id] = arr.splice(Number(el.dataset.i), 1);
      if (newPhotos.includes(id)) PhotoDB.del(id); else removed.push(id);
      sh.update();
    },
  };
}

// ── Карта клиента: новая и изменение ──
function openClientForm({ clientId = null, prefill = '' } = {}) {
  const src = clientId ? IDX.client.get(clientId) : null;
  const d = src ? deepClone(src) : {
    id: null, cardNo: S.settings.nextCardNo, lastName: '', firstName: '', middleName: '', phone: '',
    contact: { kind: 'vk', handle: '' }, birth: '', source: '', tags: [], facePhoto: '', notes: '',
    consents: emptyConsents(), health: null, reminded: {}, createdAt: todayISO(),
  };
  d.consents = normalizeConsents(d.consents);
  d.contact = d.contact || { kind: 'phone', handle: '' };
  if (!src && prefill) {
    if (/^[\d\s()+\-]+$/.test(prefill)) d.phone = prefill.trim();
    else {
      const [a, b] = prefill.trim().split(/\s+/);
      d.firstName = cap(a || '');
      d.lastName = cap(b || '');
    }
  }
  if (src) d.phone = fmtPhone(d.phone);
  const newPhotos = [];
  const removed = [];
  const sh = openSheet({
    errors: {},
    render: (s) => clientFormHtml(d, s),
    onInput(path, v) {
      setPath(d, path, v);
      if (path === 'phone') { const box = $('#dup-box', this.el); if (box) box.innerHTML = dupHtml(d); }
    },
    onChange(path, v) { setPath(d, path, v); },
    onCancel(s) { newPhotos.forEach((id) => PhotoDB.del(id)); s.close('cancel'); },
    actions: {
      'contact-kind': (el) => { d.contact.kind = el.dataset.v; sh.update(); },
      source: (el) => { d.source = d.source === el.dataset.v ? '' : el.dataset.v; sh.update(); },
      tag: (el) => {
        const t = el.dataset.v;
        d.tags = d.tags.includes(t) ? d.tags.filter((x) => x !== t) : d.tags.concat(t);
        sh.update();
      },
      'add-face': () => pickPhotos((ids) => { d.facePhoto = ids[0]; newPhotos.push(ids[0]); sh.update(); }, false),
      'del-face': () => {
        if (newPhotos.includes(d.facePhoto)) PhotoDB.del(d.facePhoto); else removed.push(d.facePhoto);
        d.facePhoto = '';
        sh.update();
      },
      'open-dup': (el) => { newPhotos.forEach((id) => PhotoDB.del(id)); sh.close('cancel'); go(`/client/${el.dataset.id}`); },
      save: () => save(false),
      'save-proc': () => save(true),
    },
  });
  Object.assign(sh.actions, consentActions(d, sh, newPhotos, removed));

  async function save(startProc) {
    const errors = {};
    if (!String(d.firstName).trim()) errors.firstName = 'Укажите имя';
    const phone = normPhone(d.phone);
    if (!phone || phone.length !== 12) errors.phone = 'Нужен номер из 11 цифр';
    const no = parseInt(String(d.cardNo).replace(/\D/g, ''), 10);
    if (!no || no < 1) errors.cardNo = 'Номер карты — целое число';
    else if (S.clients.some((x) => x.cardNo === no && x.id !== d.id)) errors.cardNo = `Карта № ${no} уже есть`;
    if (d.birth && d.birth > todayISO()) errors.birth = 'Дата рождения в будущем';
    sh.errors = errors;
    if (Object.keys(errors).length) {
      sh.update();
      scrollToError(sh);
      toast('Проверьте выделенные поля');
      return;
    }
    const dup = findByPhone(phone, d.id);
    if (dup && !src) {
      const ok = await confirmDialog({ title: 'Номер уже есть в базе', text: `${esc(fullName(dup))}, карта № ${dup.cardNo}. Всё равно создать ещё одну карту?`, ok: 'Создать', danger: false });
      if (!ok) return;
    }
    const rec = {
      ...d,
      phone,
      cardNo: no,
      firstName: cap(String(d.firstName).trim()),
      lastName: cap(String(d.lastName).trim()),
      middleName: cap(String(d.middleName || '').trim()),
      notes: String(d.notes || '').trim(),
      contact: { kind: d.contact.kind, handle: d.contact.kind === 'phone' || d.contact.kind === 'wa' ? '' : String(d.contact.handle || '').trim() },
    };
    if (src) Object.assign(src, rec);
    else { rec.id = uid('c'); S.clients.push(rec); }
    S.settings.nextCardNo = Math.max(S.settings.nextCardNo, no + 1);
    removed.forEach((id) => PhotoDB.del(id));
    saveState();
    sh.close('ok');
    if (src) { toast('Данные сохранены'); render(); }
    else {
      toast(`Карта № ${no} создана`);
      go(`/client/${rec.id}`);
    }
    if (startProc) setTimeout(() => openProcForm({ clientId: rec.id }), 320);
  }
}

function dupHtml(d) {
  const dup = findByPhone(d.phone, d.id);
  if (!dup) return '';
  return `<div class="dup">${icon('info', 'i-sm')}<span>Этот номер уже есть: ${esc(fullName(dup))}, карта № ${dup.cardNo}</span><button type="button" class="btn btn-sm btn-secondary" data-act="open-dup" data-id="${dup.id}">Открыть</button></div>`;
}

function clientFormHtml(d, sh) {
  const e = sh.errors || {};
  const isNew = !d.id;
  const handle = d.contact.kind !== 'phone' && d.contact.kind !== 'wa';
  return `${sheetHead(isNew ? 'Новая карта' : 'Изменить карту', { right: 'Готово', rightAct: 'save' })}
  <div class="sheet-scroll">
    <div class="form-card">
      ${field('Номер карты', `<input class="input" inputmode="numeric" data-bind="cardNo" value="${esc(d.cardNo)}">`, e.cardNo, isNew ? 'присваивается сам' : '')}
      <div class="grid-2">${field('Имя', `<input class="input" data-bind="firstName" value="${esc(d.firstName)}" autocomplete="off" autocapitalize="words">`, e.firstName)}${field('Фамилия', `<input class="input" data-bind="lastName" value="${esc(d.lastName)}" autocomplete="off" autocapitalize="words">`)}</div>
      ${field('Отчество', `<input class="input" data-bind="middleName" value="${esc(d.middleName)}" autocomplete="off" autocapitalize="words">`, '', 'необязательно')}
      ${field('Телефон', `<input class="input" type="tel" inputmode="tel" data-bind="phone" value="${esc(d.phone)}" placeholder="+7 900 000-00-00" autocomplete="off">`, e.phone)}
      <div id="dup-box">${dupHtml(d)}</div>
      <div class="field"><span class="field-label">Где переписываемся</span><div class="chips">${CONTACT_KINDS.map((k) => chip(k.label, d.contact.kind === k.id, `data-act="contact-kind" data-v="${k.id}"`)).join('')}</div></div>
      ${handle ? field('Ник или ссылка', `<input class="input" data-bind="contact.handle" value="${esc(d.contact.handle)}" autocomplete="off" autocapitalize="none" placeholder="например, anna.smirnova">`) : ''}
      ${field('Дата рождения', `<input class="input" type="date" data-bind="birth" value="${esc(d.birth)}" max="${todayISO()}">`, e.birth, 'для поздравлений')}
    </div>
    <div class="form-title">Откуда пришла</div>
    <div class="chips">${S.lists.sources.map((s) => chip(s, d.source === s, `data-act="source" data-v="${esc(s)}"`)).join('')}</div>
    <div class="form-title">Метки</div>
    <div class="chips">${S.lists.tags.map((t) => chip(t, d.tags.includes(t), `data-act="tag" data-v="${esc(t)}"`)).join('')}</div>
    <div class="form-title">Фото для узнавания <span style="font-weight:400">необязательно</span></div>
    <div class="photo-strip">${d.facePhoto ? thumbHtml(d.facePhoto, 'del-face') : `<button type="button" class="photo-add" data-act="add-face" aria-label="Добавить фото">${icon('camera')}</button>`}</div>
    <div class="form-title">Согласия</div>
    <div class="form-card">
      ${consentEditor(d, 'pd', 'На обработку персональных данных')}
      ${consentEditor(d, 'procedure', 'На процедуру')}
      <p class="hint">Бланки готовит юрист. Здесь хранятся дата и фото подписанного бланка. Согласие на данные о здоровье заполняется в анкете здоровья.</p>
    </div>
    <div class="form-title">Заметки</div>
    <textarea class="textarea" data-bind="notes" placeholder="Предпочтения, о чём договорились">${esc(d.notes)}</textarea>
  </div>
  <div class="sheet-foot">${isNew ? '<button class="btn btn-primary" data-act="save-proc">Сохранить и начать процедуру</button>' : '<button class="btn btn-primary" data-act="save">Сохранить</button>'}</div>`;
}

// ── Согласия (из карты) ──
function openConsentsForm(clientId, onDone) {
  const c = IDX.client.get(clientId);
  const d = { consents: normalizeConsents(c.consents) };
  const newPhotos = [];
  const removed = [];
  const sh = openSheet({
    render: () => `${sheetHead('Согласия', { right: 'Готово', rightAct: 'save' })}
      <div class="sheet-scroll">
        <div class="sheet-client">${avatarHtml(c, 'avatar--sm')}<div><div class="t">${esc(fullName(c))}</div><div class="s">Карта № ${c.cardNo}</div></div></div>
        <div class="form-card">
          ${consentEditor(d, 'pd', 'На обработку персональных данных')}
          ${consentEditor(d, 'procedure', 'На процедуру')}
          ${consentEditor(d, 'health', 'На обработку данных о здоровье')}
        </div>
        <p class="hint" style="margin-top:12px">Согласие на данные о здоровье нужно, только если в анкете есть отметки. Юридическую сторону (тексты бланков, уведомление Роскомнадзора) уточняет юрист.</p>
      </div>
      <div class="sheet-foot"><button class="btn btn-primary" data-act="save">Сохранить</button></div>`,
    onInput(path, v) { setPath(d, path, v); },
    onChange(path, v) { setPath(d, path, v); },
    onCancel(s) { newPhotos.forEach((id) => PhotoDB.del(id)); s.close('cancel'); },
    actions: {
      save: () => {
        c.consents = d.consents;
        removed.forEach((id) => PhotoDB.del(id));
        saveState();
        sh.close('ok');
        toast('Согласия сохранены');
        if (onDone) onDone(); else render();
      },
    },
  });
  Object.assign(sh.actions, consentActions(d, sh, newPhotos, removed));
}

// ── Анкета здоровья ──
function openHealthForm(clientId, onDone) {
  const c = IDX.client.get(clientId);
  const h = c.health ? deepClone(c.health) : { filledAt: '', flags: {}, allergies: [], meds: '', other: '' };
  h.flags = h.flags || {};
  h.allergies = h.allergies || [];
  const d = { h, consent: (c.consents && c.consents.health && c.consents.health.date) || '', allergyInput: '' };
  const sh = openSheet({
    render: () => `${sheetHead('Анкета здоровья', { right: 'Готово', rightAct: 'save' })}
      <div class="sheet-scroll">
        <div class="sheet-client">${avatarHtml(c, 'avatar--sm')}<div><div class="t">${esc(fullName(c))}</div><div class="s">Карта № ${c.cardNo}${h.filledAt ? ` · заполнена ${esc(fmtDate(h.filledAt, true))}` : ''}</div></div></div>
        <div class="warn-box" style="margin-bottom:6px"><div class="warn">${icon('shield', 'i-sm')}<div>Это данные о здоровье. Для них нужно отдельное письменное согласие клиентки. В списках и таблицах они не показываются.</div></div></div>
        <div class="form-title">Отметки</div>
        <div class="form-card" style="padding:2px 14px">${HEALTH_FLAGS.map((f) => `<label class="check"><input type="checkbox" data-bind="h.flags.${f.id}" ${h.flags[f.id] ? 'checked' : ''}><span>${esc(f.label)}</span></label>`).join('')}</div>
        <div class="form-title">Аллергии</div>
        <div class="chips" style="margin-bottom:10px">${h.allergies.length ? h.allergies.map((a, i) => `<button type="button" class="chip on" data-act="del-allergy" data-i="${i}" aria-label="Убрать: ${esc(a)}">${esc(a)} ${icon('close', 'i-sm')}</button>`).join('') : '<span class="muted" style="font-size:14px">Не отмечены</span>'}</div>
        <div class="inline-actions" style="margin-bottom:10px"><input class="input" data-bind="allergyInput" id="allergy-input" placeholder="Вещество или материал" value="${esc(d.allergyInput)}" autocomplete="off" aria-label="Новая аллергия"><button type="button" class="btn btn-secondary" data-act="add-allergy">Добавить</button></div>
        <div class="chips">${ALLERGY_SUGGEST.filter((a) => !h.allergies.includes(a)).map((a) => chip(`+ ${a}`, false, `data-act="add-allergy-s" data-v="${esc(a)}"`)).join('')}</div>
        <div class="form-title">Принимает препараты</div>
        <textarea class="textarea" data-bind="h.meds" placeholder="Какие и как давно">${esc(h.meds)}</textarea>
        <div class="form-title">Другое</div>
        <textarea class="textarea" data-bind="h.other" placeholder="Что важно знать перед процедурой">${esc(h.other)}</textarea>
        <div class="form-title">Согласие на обработку данных о здоровье</div>
        <div class="inline-actions"><input class="input" type="date" data-bind="consent" value="${esc(d.consent)}" max="${todayISO()}" aria-label="Дата согласия"><button type="button" class="btn btn-secondary" data-act="consent-today">Сегодня</button></div>
      </div>
      <div class="sheet-foot"><button class="btn btn-primary" data-act="save">Сохранить анкету</button></div>`,
    onInput(path, v) { setPath(d, path, v); },
    onChange(path, v) { setPath(d, path, v); },
    actions: {
      'add-allergy': () => {
        const v = norm(d.allergyInput);
        if (v && !h.allergies.includes(v)) h.allergies.push(v);
        d.allergyInput = '';
        sh.update();
      },
      'add-allergy-s': (el) => {
        if (!h.allergies.includes(el.dataset.v)) h.allergies.push(el.dataset.v);
        sh.update();
      },
      'del-allergy': (el) => { h.allergies.splice(Number(el.dataset.i), 1); sh.update(); },
      'consent-today': () => { d.consent = todayISO(); sh.update(); },
      save: () => {
        const extra = norm(d.allergyInput);
        if (extra && !h.allergies.includes(extra)) h.allergies.push(extra);
        h.filledAt = todayISO();
        h.meds = String(h.meds || '').trim();
        h.other = String(h.other || '').trim();
        c.health = h;
        c.consents = normalizeConsents(c.consents);
        c.consents.health = { date: d.consent || '' };
        saveState();
        sh.close('ok');
        toast(hasHealthData(c) && !d.consent ? 'Анкета сохранена. Нет согласия на данные о здоровье' : 'Анкета сохранена');
        if (onDone) onDone(); else render();
      },
    },
  });
}

// ── Процедура ──
function serviceOptions(d) {
  const list = S.services.filter((s) => s.active || s.id === d.serviceId);
  const opt = (s) => ({ value: s.id, label: `${s.name} · ${fmtMoney(s.price)}` });
  const groups = [];
  for (const z of S.zones) {
    const items = list.filter((s) => s.zones.length === 1 && s.zones[0] === z.id);
    if (items.length) groups.push({ group: z.name, items: items.map(opt) });
  }
  const multi = list.filter((s) => s.zones.length !== 1);
  if (multi.length) groups.push({ group: 'Для нескольких зон', items: multi.map(opt) });
  return groups;
}
function anestOptions(stage, current) {
  return S.anesthetics.filter((a) => a.stage === stage && (a.active || a.id === current)).map((a) => ({ value: a.id, label: a.name }));
}
function pigmentOptions(d, current) {
  const removal = d.type === 'removal';
  const all = S.pigments.filter((p) => (p.active || p.id === current) && (removal ? p.kind === 'Ремувер' : p.kind !== 'Ремувер'));
  const opt = (p) => ({ value: p.id, label: `${p.name} (${p.brand})` });
  const forZone = all.filter((p) => !d.zone || p.zones.includes(d.zone));
  const others = all.filter((p) => d.zone && !p.zones.includes(d.zone));
  const groups = [];
  if (forZone.length) groups.push({ group: d.zone ? `Для зоны «${zoneName(d.zone)}»` : 'Пигменты', items: forZone.map(opt) });
  if (others.length) groups.push({ group: 'Остальные', items: others.map(opt) });
  return groups;
}
function pigmentRowHtml(d, g, i) {
  const p = IDX.pigment.get(g.pigmentId);
  const lots = p ? p.lots : [];
  const lotOpts = lots.map((l) => ({ value: l.no, label: `${l.no}${l.exp && l.exp < d.date ? ' · просрочена' : ''}` }));
  const lot = lotInfo(g.pigmentId, g.lot);
  let lotNote = '';
  if (lot && lot.exp) lotNote = lot.exp < d.date ? `<span class="dot dot--alert"></span> Партия просрочена: годна до ${fmtMonthNum(lot.exp)}` : `Партия годна до ${fmtMonthNum(lot.exp)}`;
  return `<div class="pg-row">
    <div class="pg-top"><span class="swatch" style="background:${p ? esc(p.hex) : 'transparent'}"></span>${selectHtml(`pigments.${i}.pigmentId`, pigmentOptions(d, g.pigmentId), g.pigmentId, { placeholder: 'Выберите пигмент', attrs: 'aria-label="Пигмент"' })}<button type="button" class="icon-btn" data-act="pg-del" data-i="${i}" aria-label="Убрать пигмент">${icon('trash')}</button></div>
    <div class="pg-bottom">${selectHtml(`pigments.${i}.lot`, lotOpts, g.lot, { placeholder: lots.length ? 'Партия' : 'Партий нет', attrs: 'aria-label="Партия"' })}<input class="input" data-bind="pigments.${i}.ratio" value="${esc(g.ratio || '')}" placeholder="Доля в смеси" aria-label="Доля в смеси" autocomplete="off"></div>
    ${lotNote ? `<div class="note" style="margin:6px 2px 0">${lotNote}</div>` : ''}
  </div>`;
}
function warningsHtml(d) {
  const w = procWarnings(d);
  if (!w.length) return '';
  return `<div class="warn-box" style="margin-bottom:12px">${w.map((x) => `<div class="warn ${x.level === 'danger' ? 'warn--danger' : ''}"><span class="dot ${x.level === 'danger' ? 'dot--alert' : x.level === 'info' ? 'dot--muted' : 'dot--ink'}"></span><div>${esc(x.text)}${x.act ? `<div><button type="button" class="btn-link" data-act="${x.act}">${esc(x.btn)}</button></div>` : ''}</div></div>`).join('')}</div>`;
}
function totalSub(d) {
  const disc = discountAmount(parseMoney(d.price), d.discount);
  if (!disc) return 'без скидки';
  return `скидка ${fmtMoney(disc)}${d.discount.mode === 'pct' ? ` (${d.discount.value}${NBSP}%)` : ''}`;
}
function certField(d, e) {
  const list = availableCerts(d);
  if (!list.length) return '<p class="hint" style="margin-top:0">Нет действующих сертификатов. Их добавляют в разделе «Ещё → Сертификаты».</p>';
  const cert = IDX.cert.get(d.certificateId);
  return `<div class="field ${e.cert ? 'err' : ''}" ${e.cert ? 'data-err="1"' : ''}><span class="field-label">Сертификат</span>${selectHtml('certificateId', list.map((x) => ({ value: x.id, label: `№ ${x.no} · ${fmtMoney(x.amount)}${x.recipient ? ` · ${x.recipient}` : ''}` })), d.certificateId, { placeholder: 'Выберите сертификат' })}${e.cert ? errHtml(e.cert) : ''}${cert ? `<p class="hint" id="cert-hint" style="margin:8px 2px 0">${esc(certPayText(cert, totalOf(d)))}</p>` : ''}</div>`;
}

function procFormHtml(sh) {
  const { d, c } = sh;
  const e = sh.errors || {};
  const zd = IDX.zone.get(d.zone);
  const removal = d.type === 'removal';
  const svc = IDX.service.get(d.serviceId);
  const allowed = svc ? svc.zones : null;
  const prev = !d.id ? uniq(procsOf(c.id).filter((p) => p.status === 'done' && p.type !== 'removal').map((p) => p.zone)).map((z) => lastInZone(c.id, z)).filter(Boolean) : [];
  const ph = d.prevHealing;
  const phProc = ph ? IDX.proc.get(ph.procId) : null;
  const needles = S.needles.filter((n) => n.active || d.needles.includes(n.id));
  return `${sheetHead(d.id ? 'Изменить процедуру' : 'Новая процедура', { right: 'Сохранить', rightAct: 'save' })}
  <div class="sheet-scroll">
    <div class="sheet-client">${avatarHtml(c, 'avatar--sm')}<div><div class="t">${esc(fullName(c))}</div><div class="s">Карта № ${c.cardNo}${d.repeatedFrom ? ' · заполнено как в прошлый раз' : ''}</div></div></div>
    ${prev.length ? `<div class="form-title" style="margin-top:0">Заполнить как в прошлый раз</div><div class="quick-fill">${prev.map((p) => `<button type="button" class="chip ${d.repeatedFrom === p.id ? 'on' : ''}" data-act="quick-fill" data-id="${p.id}">${icon('repeat', 'i-sm')} ${esc(zoneName(p.zone))} · ${esc(fmtDateShort(p.date))}</button>`).join('')}</div>` : ''}
    ${warningsHtml(d)}
    <div class="form-card">
      ${field('Дата', `<input class="input" type="date" data-bind="date" value="${esc(d.date)}">`, e.date)}
      <div class="field ${e.service ? 'err' : ''}" ${e.service ? 'data-err="1"' : ''}><span class="field-label"><span>Услуга</span><span class="opt">цена подставится сама</span></span>${selectHtml('serviceId', serviceOptions(d), d.serviceId, { placeholder: 'Выберите услугу', attrs: 'aria-label="Услуга"' })}${e.service ? errHtml(e.service) : ''}</div>
      <div class="field"><span class="field-label">Тип визита</span><div class="chips">${VISIT_TYPES.map((t) => chip(t.label, d.type === t.id, `data-act="type" data-v="${t.id}"`)).join('')}</div></div>
      <div class="field ${e.zone ? 'err' : ''}" ${e.zone ? 'data-err="1"' : ''}><span class="field-label">Зона</span><div class="chips">${S.zones.map((z) => chip(z.name, d.zone === z.id, `data-act="zone" data-v="${z.id}"`)).join('')}</div>${e.zone ? errHtml(e.zone) : ''}${allowed && d.zone && !allowed.includes(d.zone) ? '<p class="hint" style="margin:8px 2px 0">Выбранная услуга не для этой зоны</p>' : ''}</div>
      ${zd && !removal && zd.techniques.length ? `<div class="field"><span class="field-label">Техника</span><div class="chips">${zd.techniques.map((t) => chip(t, d.technique === t, `data-act="tech" data-v="${esc(t)}"`)).join('')}</div></div>` : ''}
    </div>
    ${ph && phProc ? `<div class="form-title">Как зажила процедура ${esc(fmtDate(phProc.date, true))}</div>
      <div class="form-card">
        <div class="chips" style="margin-bottom:12px">${HEALING.map((x) => chip(x.label, ph.status === x.id, `data-act="prev-healing" data-v="${x.id}"`)).join('')}</div>
        ${field('Комментарий', `<input class="input" data-bind="prevHealing.note" value="${esc(ph.note)}" placeholder="Например, левая бровь светлее" autocomplete="off">`, '', 'сохранится в той процедуре')}
      </div>` : ''}
    <div class="form-title">Анестезия</div>
    <div class="form-card">
      ${field('Первичная', selectHtml('anesthesia.primary', anestOptions('primary', d.anesthesia.primary), d.anesthesia.primary, { placeholder: 'Без анестезии' }), '', '', 'div')}
      ${field('Вторичная', selectHtml('anesthesia.secondary', anestOptions('secondary', d.anesthesia.secondary), d.anesthesia.secondary, { placeholder: 'Без вторичной' }), '', '', 'div')}
    </div>
    <div class="form-title">${removal ? 'Ремувер' : 'Пигменты'}${d.pigments.length > 1 ? ' <span style="font-weight:400">смесь</span>' : ''}</div>
    ${d.pigments.map((g, i) => pigmentRowHtml(d, g, i)).join('')}
    <button type="button" class="btn btn-outline btn-block" data-act="pg-add">${icon('plus')} ${removal ? 'Добавить ремувер' : d.pigments.length ? 'Добавить пигмент в смесь' : 'Добавить пигмент'}</button>
    <div class="form-title">Игла</div>
    <div class="chips">${needles.map((n) => chip(n.name, d.needles.includes(n.id), `data-act="needle" data-v="${n.id}"`)).join('')}</div>
    <div class="form-title">Фото</div>
    <div class="form-card" style="padding-bottom:14px">${PHOTO_STAGES.map((st) => `<div class="photo-stage"><div class="photo-stage-label"><span>${st.label}</span>${st.id === 'month' ? '<span>можно добавить позже</span>' : ''}</div><div class="photo-strip">${(d.photos[st.id] || []).map((id, i) => thumbHtml(id, 'photo-del', `data-stage="${st.id}" data-i="${i}"`, `data-act="view-draft-photo" data-stage="${st.id}" data-i="${i}" aria-label="Открыть фото"`)).join('')}<button type="button" class="photo-add" data-act="photo-add" data-stage="${st.id}" aria-label="Добавить фото: ${esc(st.label)}">${icon('camera')}</button></div></div>`).join('')}
      <p class="hint" style="margin:12px 2px 0">Геометка и данные камеры удаляются из фото автоматически</p></div>
    ${d.id ? `<div class="form-title">Заживление этой процедуры</div><div class="form-card"><div class="chips" style="margin-bottom:12px">${HEALING.map((x) => chip(x.label, d.healing.status === x.id, `data-act="own-healing" data-v="${x.id}"`)).join('')}</div>${field('Комментарий', `<input class="input" data-bind="healing.note" value="${esc(d.healing.note)}" autocomplete="off">`)}</div>` : ''}
    <div class="form-title">Оплата</div>
    <div class="form-card">
      ${field('Стоимость', `<div class="affix"><input class="input" inputmode="numeric" data-bind="price" value="${d.price ? esc(d.price) : ''}" placeholder="0" autocomplete="off"><span>₽</span></div>`, e.price)}
      <div class="field ${e.discount ? 'err' : ''}" ${e.discount ? 'data-err="1"' : ''}><span class="field-label"><span>Скидка</span><span class="opt">в процентах или рублях</span></span>
        <div class="discount-row"><div class="seg" role="group" aria-label="Скидка в"><button type="button" class="${d.discount.mode === 'pct' ? 'on' : ''}" data-act="disc-mode" data-v="pct" aria-pressed="${d.discount.mode === 'pct'}">%</button><button type="button" class="${d.discount.mode === 'rub' ? 'on' : ''}" data-act="disc-mode" data-v="rub" aria-pressed="${d.discount.mode === 'rub'}">₽</button></div><input class="input" inputmode="numeric" data-bind="discount.value" value="${d.discount.value ? esc(d.discount.value) : ''}" placeholder="0" aria-label="Размер скидки" autocomplete="off"></div>
        ${e.discount ? errHtml(e.discount) : ''}
        <div class="chips" style="margin-top:10px">${S.lists.discountReasons.map((r) => chip(r, d.discount.reason === r, `data-act="disc-reason" data-v="${esc(r)}"`)).join('')}</div>
      </div>
      <div class="switch-row"><div><div class="t">Работа на модели</div><div class="s">Для учёта моделей на обучении</div></div><input type="checkbox" class="switch" data-bind="model.on" ${d.model.on ? 'checked' : ''} aria-label="Работа на модели"></div>
      ${d.model.on ? field('Курс', selectHtml('model.courseId', S.courses.map((co) => ({ value: co.id, label: co.name })), d.model.courseId, { placeholder: S.courses.length ? 'Выберите курс' : 'Курсов нет, добавьте в справочнике' }), '', '', 'div') : ''}
      <div class="total-box"><div><div class="l">Итого к оплате</div><div class="s" id="total-sub">${esc(totalSub(d))}</div></div><div class="v" id="total-val">${fmtMoney(totalOf({ price: parseMoney(d.price), discount: d.discount }))}</div></div>
      <div class="field"><span class="field-label">Способ оплаты</span><div class="chips">${PAYMENTS.map((pm) => chip(pm.label, d.payment === pm.id, `data-act="payment" data-v="${pm.id}"`)).join('')}</div></div>
      ${d.payment === 'cert' ? certField(d, e) : ''}
      <div class="field"><span class="field-label">Статус</span><div class="chips">${STATUSES.map((s) => chip(s.label, d.status === s.id, `data-act="status" data-v="${s.id}"`)).join('')}</div>${d.status !== 'done' ? '<p class="hint" style="margin:8px 2px 0">Не пойдёт в выручку, но останется в истории</p>' : ''}</div>
    </div>
    <div class="form-title">Примечание</div>
    <textarea class="textarea" data-bind="note" placeholder="Настройки аппарата, особенности кожи, о чём договорились">${esc(d.note)}</textarea>
    ${!d.id ? '<button type="button" class="btn btn-ghost btn-block" style="margin-top:14px" data-act="save-next">Сохранить и добавить ещё одну зону</button>' : ''}
  </div>
  <div class="sheet-foot"><button class="btn btn-primary" data-act="save">Сохранить процедуру</button></div>`;
}

function applyService(d) {
  const svc = IDX.service.get(d.serviceId);
  if (!svc) return;
  d.type = svc.type;
  if (svc.zones.length === 1) d.zone = svc.zones[0];
  else if (!svc.zones.includes(d.zone)) d.zone = '';
  applyZoneDefaults(d, svc);
  d.price = svc.price;
}
function applyZoneDefaults(d, svc) {
  const zd = IDX.zone.get(d.zone);
  if (d.type === 'removal') {
    d.technique = '';
    d.pigments = d.pigments.filter((g) => IDX.pigment.get(g.pigmentId) && IDX.pigment.get(g.pigmentId).kind === 'Ремувер');
    if (!d.pigments.length) {
      const rem = S.pigments.find((p) => p.active && p.kind === 'Ремувер');
      if (rem) d.pigments = [{ pigmentId: rem.id, lot: defaultLot(rem.id, d.date), ratio: '' }];
    }
  } else {
    d.pigments = d.pigments.filter((g) => !IDX.pigment.get(g.pigmentId) || IDX.pigment.get(g.pigmentId).kind !== 'Ремувер');
    if (svc && svc.technique) d.technique = svc.technique;
    else if (zd && !zd.techniques.includes(d.technique)) d.technique = '';
    if (!d.technique && d.zone) {
      const last = lastInZone(d.clientId, d.zone, d.id);
      if (last && last.technique && zd && zd.techniques.includes(last.technique)) d.technique = last.technique;
    }
  }
  syncPrevHealing(d);
}
function pickServiceFor(d) {
  const cur = IDX.service.get(d.serviceId);
  if (cur && cur.type === d.type && cur.zones.includes(d.zone)) return;
  const s = d.zone ? findService(d.zone, d.type) : null;
  if (s) { d.serviceId = s.id; d.price = s.price; } else if (cur && (!cur.zones.includes(d.zone) || cur.type !== d.type)) d.serviceId = '';
}

function openProcForm({ clientId = null, procId = null, draft = null } = {}) {
  const orig = procId ? IDX.proc.get(procId) : null;
  const c = IDX.client.get(clientId || (orig && orig.clientId));
  if (!c) return;
  const d = draft || (orig ? draftFromProc(orig) : newProcDraft(c.id));
  d.photos = d.photos || { before: [], after: [], month: [] };
  const initial = JSON.stringify(d);
  const newPhotos = [];
  const removedPhotos = [];
  const refreshTotal = (s) => {
    const tv = $('#total-val', s.el);
    const ts = $('#total-sub', s.el);
    if (tv) tv.textContent = fmtMoney(totalOf({ price: parseMoney(d.price), discount: d.discount }));
    if (ts) ts.textContent = totalSub(d);
    const ch = $('#cert-hint', s.el);
    const cert = IDX.cert.get(d.certificateId);
    if (ch && cert) ch.textContent = certPayText(cert, totalOf({ price: parseMoney(d.price), discount: d.discount }));
  };
  const sh = openSheet({
    d, c, errors: {},
    render: (s) => procFormHtml(s),
    onInput(path, v) {
      if (path === 'price') { d.price = parseMoney(v); refreshTotal(this); return; }
      if (path === 'discount.value') { d.discount.value = parseMoney(v); refreshTotal(this); return; }
      setPath(d, path, v);
    },
    onChange(path, v) {
      if (path === 'price' || path === 'discount.value') return;
      setPath(d, path, v);
      if (path === 'serviceId') applyService(d);
      else if (/^pigments\.\d+\.pigmentId$/.test(path)) {
        const i = Number(path.split('.')[1]);
        d.pigments[i].lot = defaultLot(v, d.date);
      } else if (path === 'date') syncPrevHealing(d);
      else if (path === 'model.on' && v && !d.discount.reason) {
        d.discount.reason = 'Модель';
        if (!d.model.courseId && S.courses.length) d.model.courseId = S.courses[S.courses.length - 1].id;
      }
      if (/\.ratio$|^note$|\.note$/.test(path)) return;
      this.update();
    },
    onCancel: async (s) => {
      if (JSON.stringify(d) !== initial) {
        const ok = await confirmDialog({ title: 'Закрыть без сохранения?', text: 'Введённые данные не сохранятся.', ok: 'Закрыть', cancel: 'Остаться' });
        if (!ok) return;
      }
      newPhotos.forEach((id) => PhotoDB.del(id));
      s.close('cancel');
    },
    actions: {
      type: (el) => { d.type = el.dataset.v; pickServiceFor(d); applyZoneDefaults(d, IDX.service.get(d.serviceId)); sh.update(); },
      zone: (el) => { d.zone = el.dataset.v; pickServiceFor(d); applyZoneDefaults(d, IDX.service.get(d.serviceId)); sh.update(); },
      tech: (el) => { d.technique = d.technique === el.dataset.v ? '' : el.dataset.v; sh.update(); },
      needle: (el) => {
        const id = el.dataset.v;
        d.needles = d.needles.includes(id) ? d.needles.filter((x) => x !== id) : d.needles.concat(id);
        sh.update();
      },
      'pg-add': () => {
        if (d.type === 'removal') {
          const rem = S.pigments.find((p) => p.active && p.kind === 'Ремувер');
          d.pigments.push({ pigmentId: rem ? rem.id : '', lot: rem ? defaultLot(rem.id, d.date) : '', ratio: '' });
        } else d.pigments.push({ pigmentId: '', lot: '', ratio: '' });
        sh.update();
      },
      'pg-del': (el) => { d.pigments.splice(Number(el.dataset.i), 1); sh.update(); },
      'photo-add': (el) => {
        const st = el.dataset.stage;
        pickPhotos((ids) => { d.photos[st] = (d.photos[st] || []).concat(ids); newPhotos.push(...ids); sh.update(); });
      },
      'photo-del': (el) => {
        const [id] = d.photos[el.dataset.stage].splice(Number(el.dataset.i), 1);
        if (newPhotos.includes(id)) PhotoDB.del(id); else removedPhotos.push(id);
        sh.update();
      },
      'view-draft-photo': (el) => {
        const items = [];
        let start = 0;
        for (const st of PHOTO_STAGES) {
          (d.photos[st.id] || []).forEach((id, i) => {
            if (st.id === el.dataset.stage && i === Number(el.dataset.i)) start = items.length;
            items.push({ src: photoSrc(id), title: st.label, sub: fmtDate(d.date, true) });
          });
        }
        openViewer(items, start);
      },
      'disc-mode': (el) => { d.discount.mode = el.dataset.v; sh.update(); },
      'disc-reason': (el) => { d.discount.reason = d.discount.reason === el.dataset.v ? '' : el.dataset.v; sh.update(); },
      payment: (el) => { d.payment = el.dataset.v; if (d.payment !== 'cert') d.certificateId = ''; sh.update(); },
      status: (el) => { d.status = el.dataset.v; sh.update(); },
      'prev-healing': (el) => { d.prevHealing.status = d.prevHealing.status === el.dataset.v ? '' : el.dataset.v; sh.update(); },
      'own-healing': (el) => { d.healing.status = d.healing.status === el.dataset.v ? '' : el.dataset.v; sh.update(); },
      'quick-fill': (el) => {
        const base = IDX.proc.get(el.dataset.id);
        const nd = repeatDraft(c.id, base.zone, base.id);
        for (const k of Object.keys(nd)) {
          if (!['id', 'clientId', 'date', 'photos', 'note', 'status', 'payment', 'certificateId', 'discount', 'model'].includes(k)) d[k] = nd[k];
        }
        syncPrevHealing(d);
        sh.update();
        toast(`Заполнено по процедуре от ${fmtDate(base.date, true)}`);
      },
      'open-health': () => openHealthForm(c.id, () => sh.update()),
      'open-consents': () => openConsentsForm(c.id, () => sh.update()),
      save: () => saveProc(false),
      'save-next': () => saveProc(true),
    },
  });

  async function saveProc(andNext) {
    const e = {};
    const price = parseMoney(d.price);
    if (!isISO(d.date)) e.date = 'Укажите дату';
    if (!d.serviceId) e.service = 'Выберите услугу';
    if (!d.zone) e.zone = 'Выберите зону';
    if (d.discount.mode === 'pct' && d.discount.value > 100) e.discount = 'Скидка больше 100 %';
    if (d.discount.mode === 'rub' && d.discount.value > price) e.discount = 'Скидка больше стоимости';
    if (d.payment === 'cert' && d.status === 'done' && !d.certificateId && availableCerts(d).length) e.cert = 'Выберите сертификат';
    sh.errors = e;
    if (Object.keys(e).length) {
      sh.update();
      scrollToError(sh);
      toast('Проверьте выделенные поля');
      return;
    }
    const dangers = procWarnings(d).filter((w) => w.level === 'danger');
    if (dangers.length) {
      const ok = await confirmDialog({ title: 'Проверьте перед сохранением', text: dangers.map((w) => esc(w.text)).join('<br><br>'), ok: 'Сохранить', cancel: 'Вернуться', danger: false });
      if (!ok) return;
    }
    const isNew = !d.id;
    const rec = {
      id: d.id || uid('p'),
      clientId: d.clientId,
      date: d.date,
      serviceId: d.serviceId,
      type: d.type,
      zone: d.zone,
      technique: d.type === 'removal' ? '' : d.technique,
      anesthesia: { primary: d.anesthesia.primary || '', secondary: d.anesthesia.secondary || '' },
      pigments: d.pigments.filter((g) => g.pigmentId).map((g) => ({ pigmentId: g.pigmentId, lot: g.lot || '', ratio: String(g.ratio || '').trim() })),
      needles: d.needles.slice(),
      photos: deepClone(d.photos),
      healing: { status: d.healing.status || '', note: String(d.healing.note || '').trim() },
      note: String(d.note || '').trim(),
      price,
      discount: { mode: d.discount.mode, value: Number(d.discount.value) || 0, reason: d.discount.value ? d.discount.reason : '' },
      payment: d.payment,
      certificateId: d.payment === 'cert' ? d.certificateId : '',
      status: d.status,
      model: d.model.on ? { on: true, courseId: d.model.courseId || '' } : { on: false, courseId: '' },
      createdAt: orig ? orig.createdAt : new Date().toISOString(),
    };
    if (orig) Object.assign(orig, rec); else S.procedures.push(rec);
    for (const cert of S.certificates) {
      if (cert.usedProcId === rec.id && (cert.id !== rec.certificateId || rec.status !== 'done')) { cert.usedProcId = ''; cert.usedAt = ''; }
    }
    if (rec.certificateId && rec.status === 'done') {
      const cert = S.certificates.find((x) => x.id === rec.certificateId);
      if (cert) { cert.usedProcId = rec.id; cert.usedAt = rec.date; }
    }
    if (d.prevHealing) {
      const t = S.procedures.find((p) => p.id === d.prevHealing.procId);
      if (t) t.healing = { status: d.prevHealing.status || '', note: String(d.prevHealing.note || '').trim() };
    }
    if (rec.model.on && !(c.tags || []).includes('Модель')) c.tags = (c.tags || []).concat('Модель');
    removedPhotos.forEach((id) => PhotoDB.del(id));
    saveState();
    sh.close('ok');
    let msg = 'Процедура сохранена';
    if (isNew && rec.status === 'done' && (rec.type === 'primary' || rec.type === 'cover')) {
      msg = `Сохранено. Окно коррекции: ${fmtDateShort(addDays(rec.date, S.settings.corrFrom))} – ${fmtDateShort(addDays(rec.date, S.settings.corrTo))}`;
    }
    toast(msg);
    render();
    if (andNext) setTimeout(() => openProcForm({ clientId: rec.clientId, draft: newProcDraft(rec.clientId, rec.date) }), 320);
  }
}

// ── Заживление (из карточки процедуры) ──
function openHealingForm(procId) {
  const p = IDX.proc.get(procId);
  const st = { status: (p.healing && p.healing.status) || '', note: (p.healing && p.healing.note) || '' };
  const sh = openSheet({
    auto: true,
    render: () => `${sheetHead('Как зажило', { right: 'Готово', rightAct: 'save' })}
      <div class="sheet-scroll">
        <p class="note" style="margin:0 0 12px">${esc(serviceName(p.serviceId))}, ${esc(fmtDate(p.date, true))}</p>
        <div class="chips" style="margin-bottom:14px">${HEALING.map((h) => chip(h.label, st.status === h.id, `data-act="h" data-v="${h.id}"`)).join('')}</div>
        ${field('Комментарий', `<textarea class="textarea" data-bind="note" placeholder="Например, левая бровь светлее">${esc(st.note)}</textarea>`)}
        ${st.status === 'reaction' ? '<p class="hint">При следующем выборе этого пигмента приложение напомнит о реакции.</p>' : ''}
      </div>
      <div class="sheet-foot"><button class="btn btn-primary" data-act="save">Сохранить</button></div>`,
    onInput(path, v) { st[path] = v; },
    actions: {
      h: (el) => { st.status = st.status === el.dataset.v ? '' : el.dataset.v; sh.update(); },
      save: () => {
        p.healing = { status: st.status, note: String(st.note || '').trim() };
        saveState();
        sh.close('ok');
        toast('Сохранено');
        render();
      },
    },
  });
}

// ── Сообщение по шаблону ──
function openMessage(c, kindIn, keyIn) {
  const inf = clientInfo(c);
  let kind = kindIn;
  if (!kind) kind = inf.corr.length ? 'corr' : inf.upd.length ? 'upd' : inf.bday && inf.bday.inDays <= 14 ? 'bday' : inf.lost ? 'lost' : 'free';
  const st = { kind, it: null, key: '', text: '', mark: true };
  const itemFor = (k) => {
    if (k === 'corr') return inf.corr.find((x) => x.key === keyIn) || inf.corr[0] || null;
    if (k === 'upd') return inf.upd.find((x) => x.key === keyIn) || inf.upd[0] || null;
    if (k === 'lost' && inf.last) return { kind: 'lost', zone: inf.last.zone, proc: inf.last, key: `lost:${inf.last.id}` };
    if (k === 'bday' && inf.bday) return { kind: 'bday', key: inf.bday.key };
    return null;
  };
  const fill = () => {
    st.it = itemFor(st.kind);
    st.key = st.it ? st.it.key : '';
    st.text = fillTemplate(S.settings.templates[st.kind], c, st.it);
  };
  fill();
  const kindCh = c.contact && c.contact.kind !== 'phone' ? c.contact.kind : 'sms';
  const channel = kindCh === 'sms' ? 'СМС' : CONTACT_LABEL[kindCh];
  const sh = openSheet({
    render: () => `${sheetHead('Сообщение', { left: 'Закрыть' })}
      <div class="sheet-scroll">
        <div class="sheet-client">${avatarHtml(c, 'avatar--sm')}<div><div class="t">${esc(fullName(c))}</div><div class="s">${esc(channel)}${c.contact && c.contact.handle ? `: ${esc(c.contact.handle)}` : ''} · ${esc(fmtPhone(c.phone))}</div></div></div>
        <div class="form-title" style="margin-top:0">Шаблон</div>
        <div class="chips" style="margin-bottom:14px">${TEMPLATE_DEFS.map((t) => chip(t.label, st.kind === t.id, `data-act="tpl" data-v="${t.id}"`)).join('')}</div>
        <textarea class="textarea" data-bind="text" style="min-height:150px" aria-label="Текст сообщения">${esc(st.text)}</textarea>
        ${st.key ? `<label class="check" style="border:0"><input type="checkbox" data-bind="mark" ${st.mark ? 'checked' : ''}><span>Отметить «напомнили». Клиентка уйдёт вниз списка на две недели</span></label>` : ''}
        <p class="hint" style="margin-top:6px">Приложение не отправляет сообщения само: текст копируется, мастер вставляет его в ${esc(channel)} и отправляет вручную. Шаблоны меняются в настройках.</p>
      </div>
      <div class="sheet-foot"><button class="btn btn-secondary" data-act="copy">${icon('copy')} Скопировать</button><button class="btn btn-primary" data-act="open-chat">Открыть ${esc(channel)}</button></div>`,
    onInput(path, v) { st[path] = v; },
    onChange(path, v) { st[path] = v; },
    actions: {
      tpl: (el) => { st.kind = el.dataset.v; fill(); sh.update(); },
      copy: async () => {
        if (await copyText(st.text)) finish('Текст скопирован');
        else copyFailed();
      },
      'open-chat': async () => {
        if (await copyText(st.text)) finish(`Текст скопирован. Здесь откроется ${channel}, в заглушке ник выдуманный`);
        else copyFailed();
      },
    },
  });
  function copyFailed() {
    const ta = $('[data-bind="text"]', sh.el);
    if (ta) { ta.focus(); ta.select(); }
    toast('Браузер не дал скопировать. Текст выделен, скопируйте его вручную');
  }
  function finish(msg) {
    if (st.mark && st.key) { markReminded(c, st.key); saveState(); }
    sh.close('ok');
    toast(msg);
    render();
  }
}

// ── Выбор клиента для новой процедуры ──
function pickListHtml(q) {
  const res = q.trim() ? searchClients(q) : sortClientItems(S.clients.map((c) => ({ c, inf: clientInfo(c) })), 'recent').slice(0, 30);
  if (!res.length) return '<div class="empty"><p>Никого не нашли</p></div>';
  return `${q.trim() ? '' : '<div class="list-head"><span>Недавние</span></div>'}<div class="list">${res.slice(0, 50).map(({ c }) => `<button class="row" data-act="pick" data-id="${c.id}">${avatarHtml(c)}<div class="row-main"><div class="row-title">${esc(fullName(c))}</div><div class="row-sub">№${NBSP}${c.cardNo} · ${esc(fmtPhone(c.phone))}</div></div></button>`).join('')}</div>`;
}
function openClientPicker(onPick) {
  const st = { q: '' };
  const sh = openSheet({
    render: () => `${sheetHead('Кому процедура')}
      <div class="sheet-scroll" style="padding-top:12px">
        <label class="search" style="margin-bottom:12px">${icon('search', 'i-sm')}<input type="search" data-bind="q" placeholder="Имя, телефон или № карты" autocomplete="off" value="${esc(st.q)}" aria-label="Поиск клиента"><button type="button" class="search-clear" data-act="clear" aria-label="Очистить">${icon('close', 'i-sm')}</button></label>
        <button type="button" class="btn btn-secondary btn-block" data-act="new" style="margin-bottom:6px">${icon('plus')} Новая карта</button>
        <div id="pick-list">${pickListHtml(st.q)}</div>
      </div>`,
    onInput(path, v) { st.q = v; $('#pick-list', this.el).innerHTML = pickListHtml(st.q); },
    actions: {
      pick: (el) => { sh.close('ok'); setTimeout(() => onPick(el.dataset.id), 260); },
      new: () => { sh.close('ok'); setTimeout(() => openClientForm({ prefill: st.q }), 260); },
      clear: () => {
        st.q = '';
        const inp = $('input[data-bind="q"]', sh.el);
        if (inp) { inp.value = ''; inp.focus(); }
        $('#pick-list', sh.el).innerHTML = pickListHtml('');
      },
    },
  });
}
