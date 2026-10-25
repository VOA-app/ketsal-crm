// Форма процедуры (SPEC §10.1): порядок полей как в прототипе, предупреждения, «как в прошлый раз».
import { useMemo, useRef, useState } from 'react';
import { availableCerts, relinkCertificates } from '../../domain/certificates';
import { HEALING as HEALING_IDS, PAYMENTS, PHOTO_STAGES, STATUSES, VISIT_TYPES, MODEL_TAG } from '../../domain/constants';
import { addDays, isISO, todayISO } from '../../domain/dates';
import { ulid } from '../../domain/ids';
import type { DomainIndex } from '../../domain/indexing';
import { procsOf } from '../../domain/indexing';
import { discountAmount, parseMoney, totalOf } from '../../domain/money';
import {
  defaultLot,
  draftFromProc,
  findService,
  lastInZone,
  lotInfo,
  newProcDraft,
  repeatDraft,
  withPrevHealing,
  type ProcDraft,
} from '../../domain/procedures';
import { fullName } from '../../domain/search';
import { uniq } from '../../domain/text';
import type { Entity, PhotoStage, Procedure, Service } from '../../domain/types';
import { procWarnings } from '../../domain/warnings';
import { fmtDate, fmtDateShort, fmtMoney, fmtMonthNum, NBSP } from '../../i18n/format';
import { HEALING, PAYMENT, PHOTO_STAGE, STATUS, VISIT_TYPE, ru } from '../../i18n/ru';
import { Avatar } from '../components/ClientBits';
import { Icon } from '../components/Icon';
import { Chip, Chips, Field, Select, SwitchRow, Swatch, scrollToError, type SelectGroup } from '../components/kit';
import { PhotoAdd, Thumb } from '../components/Photo';
import { SheetBody, SheetFoot, SheetHead, useSheet } from '../components/Sheet';
import { certPayText, warningText, zoneName } from '../names';
import { useData } from '../store';
import { ui, type ViewerItem } from '../ui';
import { openConsentsForm } from './ConsentsForm';
import { openHealthForm } from './HealthForm';
import { usePhotoDraft } from './photos';

const P = ru.procForm;

function serviceOptions(idx: DomainIndex, d: ProcDraft): SelectGroup[] {
  const list = idx.data.services.filter((s) => s.active || s.id === d.serviceId);
  const opt = (s: Entity<Service>) => ({ value: s.id, label: `${s.name} · ${fmtMoney(s.price)}` });
  const groups: SelectGroup[] = [];
  for (const z of idx.data.zones) {
    const items = list.filter((s) => s.zones.length === 1 && s.zones[0] === z.id);
    if (items.length) groups.push({ group: z.name, items: items.map(opt) });
  }
  const multi = list.filter((s) => s.zones.length !== 1);
  if (multi.length) groups.push({ group: P.multiZone, items: multi.map(opt) });
  return groups;
}

const anestOptions = (idx: DomainIndex, stage: 'primary' | 'secondary', current: string) =>
  idx.data.anesthetics.filter((a) => a.stage === stage && (a.active || a.id === current)).map((a) => ({ value: a.id, label: a.name }));

function pigmentOptions(idx: DomainIndex, d: ProcDraft, current: string): SelectGroup[] {
  const removal = d.type === 'removal';
  const all = idx.data.pigments.filter((p) => (p.active || p.id === current) && (removal ? p.kind === 'Ремувер' : p.kind !== 'Ремувер'));
  const opt = (p: (typeof all)[number]) => ({ value: p.id, label: `${p.name} (${p.brand})` });
  const forZone = all.filter((p) => !d.zone || p.zones.includes(d.zone));
  const others = all.filter((p) => d.zone && !p.zones.includes(d.zone));
  const groups: SelectGroup[] = [];
  if (forZone.length) groups.push({ group: d.zone ? P.pigmentsForZone(zoneName(idx, d.zone)) : P.pigments, items: forZone.map(opt) });
  if (others.length) groups.push({ group: P.pigmentsOther, items: others.map(opt) });
  return groups;
}

/** После смены услуги, типа или зоны: техника, ремувер, прошлое заживление. Меняет черновик на месте. */
function applyZoneDefaults(idx: DomainIndex, d: ProcDraft, svc: Service | undefined) {
  const zd = idx.zone.get(d.zone);
  const kindOf = (id: string) => idx.pigment.get(id)?.kind;
  if (d.type === 'removal') {
    d.technique = '';
    d.pigments = d.pigments.filter((g) => kindOf(g.pigmentId) === 'Ремувер');
    if (!d.pigments.length) {
      const rem = idx.data.pigments.find((p) => p.active && p.kind === 'Ремувер');
      if (rem) d.pigments = [{ pigmentId: rem.id, lot: defaultLot(idx, rem.id, d.date), ratio: '' }];
    }
  } else {
    d.pigments = d.pigments.filter((g) => kindOf(g.pigmentId) !== 'Ремувер');
    if (svc && svc.technique) d.technique = svc.technique;
    else if (zd && !zd.techniques.includes(d.technique)) d.technique = '';
    if (!d.technique && d.zone) {
      const last = lastInZone(idx, d.clientId, d.zone, d.id);
      if (last?.technique && zd?.techniques.includes(last.technique)) d.technique = last.technique;
    }
  }
}

function applyService(idx: DomainIndex, d: ProcDraft) {
  const svc = idx.service.get(d.serviceId);
  if (!svc) return;
  d.type = svc.type;
  if (svc.zones.length === 1) d.zone = svc.zones[0];
  else if (!svc.zones.includes(d.zone)) d.zone = '';
  applyZoneDefaults(idx, d, svc);
  d.price = svc.price;
}

function pickServiceFor(idx: DomainIndex, d: ProcDraft) {
  const cur = idx.service.get(d.serviceId);
  if (cur && cur.type === d.type && cur.zones.includes(d.zone)) return;
  const s = d.zone ? findService(idx, d.zone, d.type) : null;
  if (s) {
    d.serviceId = s.id;
    d.price = s.price;
  } else if (cur && (!cur.zones.includes(d.zone) || cur.type !== d.type)) d.serviceId = '';
}

function totalSub(d: ProcDraft): string {
  const disc = discountAmount(d.price, d.discount);
  if (!disc) return P.noDiscount;
  return P.discountSub(fmtMoney(disc), d.discount.mode === 'pct' ? ` (${d.discount.value}${NBSP}%)` : '');
}

function ProcForm({ clientId, procId, draft }: { clientId?: string; procId?: string; draft?: ProcDraft }) {
  const idx = useData((s) => s.idx);
  const data = idx.data;
  const orig = procId ? idx.proc.get(procId) : undefined;
  const c = idx.client.get(clientId || orig?.clientId || '')!;
  const photos = usePhotoDraft();
  const [d, setD] = useState<ProcDraft>(() => draft ?? (orig ? draftFromProc(idx, orig) : newProcDraft(c.id, todayISO())));
  const initial = useRef(JSON.stringify(d));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const sheet = useSheet(async () => {
    if (JSON.stringify(d) !== initial.current) {
      const ok = await ui().confirm({ title: P.discardTitle, text: P.discardText, ok: P.discardOk, cancel: P.discardStay });
      if (!ok) return;
    }
    photos.discard();
    sheet.close();
  });

  /** Изменить черновик: копия, правка, пересчёт «как зажила». */
  const mut = (fn: (x: ProcDraft) => void) =>
    setD((cur) => {
      const x = structuredClone(cur);
      fn(x);
      return withPrevHealing(useData.getState().idx, x);
    });

  const warnings = useMemo(() => procWarnings(idx, d), [idx, d]);
  const zd = idx.zone.get(d.zone);
  const removal = d.type === 'removal';
  const svc = idx.service.get(d.serviceId);
  const prev = !d.id
    ? uniq(procsOf(idx, c.id).filter((p) => p.status === 'done' && p.type !== 'removal').map((p) => p.zone))
        .map((z) => lastInZone(idx, c.id, z))
        .filter((p): p is Entity<Procedure> => !!p)
    : [];
  const ph = d.prevHealing;
  const phProc = ph ? idx.proc.get(ph.procId) : undefined;
  const needles = data.needles.filter((n) => n.active || d.needles.includes(n.id));
  const total = totalOf(d);
  const certs = availableCerts(idx, d);
  const cert = d.certificateId ? idx.cert.get(d.certificateId) : undefined;

  const quickFill = (base: Entity<Procedure>) => {
    const nd = repeatDraft(idx, c.id, base.zone, idx.today, base.id);
    mut((x) => {
      const keep = ['id', 'clientId', 'date', 'photos', 'note', 'status', 'payment', 'certificateId', 'discount', 'model', 'createdAt'];
      for (const k of Object.keys(nd) as (keyof ProcDraft)[]) if (!keep.includes(k)) (x as unknown as Record<string, unknown>)[k] = nd[k];
    });
    ui().toast(P.quickFilled(fmtDate(base.date, true)));
  };

  const viewDraftPhoto = (stage: PhotoStage, i: number) => {
    const items: ViewerItem[] = [];
    let start = 0;
    for (const st of PHOTO_STAGES) {
      d.photos[st].forEach((photo, j) => {
        if (st === stage && j === i) start = items.length;
        items.push({ photo, title: PHOTO_STAGE[st], sub: fmtDate(d.date, true) });
      });
    }
    ui().openViewer(items, start);
  };

  async function save(andNext: boolean) {
    const e: Record<string, string> = {};
    if (!isISO(d.date)) e.date = P.errDate;
    if (!d.serviceId) e.service = P.errService;
    if (!d.zone) e.zone = P.errZone;
    if (d.discount.mode === 'pct' && d.discount.value > 100) e.discount = P.errPct;
    if (d.discount.mode === 'rub' && d.discount.value > d.price) e.discount = P.errRub;
    if (d.payment === 'cert' && d.status === 'done' && !d.certificateId && certs.length) e.cert = P.errCert;
    setErrors(e);
    if (Object.keys(e).length) {
      scrollToError();
      ui().toast(ru.common.checkFields);
      return;
    }
    const dangers = warnings.filter((w) => w.level === 'danger');
    if (dangers.length) {
      const ok = await ui().confirm({
        title: P.confirmTitle,
        text: dangers.map((w) => warningText(idx, w)).join('\n\n'),
        ok: P.confirmOk,
        cancel: P.confirmBack,
        danger: false,
      });
      if (!ok) return;
    }
    const isNew = !d.id;
    const rec: Entity<Procedure> = {
      id: d.id || ulid(),
      createdAt: orig?.createdAt || new Date().toISOString(),
      clientId: d.clientId,
      date: d.date,
      serviceId: d.serviceId,
      type: d.type,
      zone: d.zone,
      technique: d.type === 'removal' ? '' : d.technique,
      anesthesia: { primary: d.anesthesia.primary || '', secondary: d.anesthesia.secondary || '' },
      pigments: d.pigments.filter((g) => g.pigmentId).map((g) => ({ pigmentId: g.pigmentId, lot: g.lot || '', ratio: g.ratio.trim() })),
      needles: d.needles.slice(),
      photos: structuredClone(d.photos),
      healing: { status: d.healing.status || '', note: d.healing.note.trim() },
      note: d.note.trim(),
      price: d.price,
      discount: { mode: d.discount.mode, value: Number(d.discount.value) || 0, reason: d.discount.value ? d.discount.reason : '' },
      payment: d.payment,
      certificateId: d.payment === 'cert' ? d.certificateId : '',
      status: d.status,
      model: d.model.on ? { on: true, courseId: d.model.courseId || '' } : { on: false, courseId: '' },
    };
    const removed = photos.removedIds();
    useData.getState().apply((tx) => {
      tx.put('procedures', rec);
      const certsNow = tx.data.certificates;
      relinkCertificates(certsNow, rec, rec.id).forEach((x, i) => {
        if (x !== certsNow[i]) tx.put('certificates', x);
      });
      if (d.prevHealing) {
        const t = tx.data.procedures.find((p) => p.id === d.prevHealing!.procId);
        if (t) tx.put('procedures', { ...t, healing: { status: d.prevHealing.status || '', note: d.prevHealing.note.trim() } });
      }
      const cl = tx.data.clients.find((x) => x.id === rec.clientId);
      if (cl && rec.model.on && !cl.tags.includes(MODEL_TAG)) tx.put('clients', { ...cl, tags: [...cl.tags, MODEL_TAG] });
      tx.dropBlobs(removed);
    });
    sheet.close();
    const st = data.settings;
    ui().toast(
      isNew && rec.status === 'done' && (rec.type === 'primary' || rec.type === 'cover')
        ? P.savedWindow(fmtDateShort(addDays(rec.date, st.corrFrom)), fmtDateShort(addDays(rec.date, st.corrTo)))
        : P.saved,
    );
    if (andNext) setTimeout(() => openProcForm({ clientId: rec.clientId, draft: newProcDraft(rec.clientId, rec.date) }), 320);
  }

  return (
    <>
      <SheetHead title={d.id ? P.editTitle : P.newTitle} right={ru.common.save} onRight={() => save(false)} />
      <SheetBody>
        <div className="sheet-client">
          <Avatar c={c} size="avatar--sm" />
          <div>
            <div className="t">{fullName(c)}</div>
            <div className="s">
              {ru.card.title(c.cardNo)}
              {d.repeatedFrom ? P.repeated : ''}
            </div>
          </div>
        </div>
        {prev.length > 0 && (
          <>
            <div className="form-title mt-0">{P.quickFill}</div>
            <div className="quick-fill">
              {prev.map((p) => (
                <Chip key={p.id} on={d.repeatedFrom === p.id} onClick={() => quickFill(p)}>
                  <Icon name="repeat" className="i-sm" /> {zoneName(idx, p.zone)} · {fmtDateShort(p.date)}
                </Chip>
              ))}
            </div>
          </>
        )}
        {warnings.length > 0 && (
          <div className="warn-box mb-12">
            {warnings.map((w, i) => (
              <div key={i} className={`warn ${w.level === 'danger' ? 'warn--danger' : ''}`}>
                <span className={`dot ${w.level === 'danger' ? 'dot--alert' : w.level === 'info' ? 'dot--muted' : 'dot--ink'}`} />
                <div>
                  {warningText(idx, w)}
                  {'act' in w && (
                    <div>
                      <button
                        type="button"
                        className="btn-link"
                        onClick={() => (w.act === 'health' ? openHealthForm(c.id) : openConsentsForm(c.id))}
                      >
                        {w.code === 'healthMissing' ? ru.warnings.btnFill : w.code === 'healthOld' ? ru.warnings.btnUpdate : ru.warnings.btnAdd}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="form-card">
          <Field label={P.date} err={errors.date}>
            <input className="input" type="date" value={d.date} onChange={(e) => mut((x) => void (x.date = e.target.value))} />
          </Field>
          <Field label={P.service} opt={P.serviceOpt} err={errors.service} as="div">
            <Select
              value={d.serviceId}
              options={serviceOptions(idx, d)}
              placeholder={P.servicePick}
              ariaLabel={P.service}
              onChange={(v) =>
                mut((x) => {
                  x.serviceId = v;
                  applyService(idx, x);
                })
              }
            />
          </Field>
          <Field label={P.type} as="div">
            <Chips>
              {VISIT_TYPES.map((t) => (
                <Chip
                  key={t}
                  label={VISIT_TYPE[t]}
                  on={d.type === t}
                  onClick={() =>
                    mut((x) => {
                      x.type = t;
                      pickServiceFor(idx, x);
                      applyZoneDefaults(idx, x, idx.service.get(x.serviceId));
                    })
                  }
                />
              ))}
            </Chips>
          </Field>
          <Field label={P.zone} err={errors.zone} as="div">
            <Chips>
              {data.zones.map((z) => (
                <Chip
                  key={z.id}
                  label={z.name}
                  on={d.zone === z.id}
                  onClick={() =>
                    mut((x) => {
                      x.zone = z.id;
                      pickServiceFor(idx, x);
                      applyZoneDefaults(idx, x, idx.service.get(x.serviceId));
                    })
                  }
                />
              ))}
            </Chips>
            {svc && d.zone && !svc.zones.includes(d.zone) && <p className="hint mt-8 mb-0">{P.serviceNotForZone}</p>}
          </Field>
          {zd && !removal && zd.techniques.length > 0 && (
            <Field label={P.technique} as="div">
              <Chips>
                {zd.techniques.map((t) => (
                  <Chip key={t} label={t} on={d.technique === t} onClick={() => mut((x) => void (x.technique = x.technique === t ? '' : t))} />
                ))}
              </Chips>
            </Field>
          )}
        </div>

        {ph && phProc && (
          <>
            <div className="form-title">{P.prevHealing(fmtDate(phProc.date, true))}</div>
            <div className="form-card">
              <Chips className="mb-12">
                {HEALING_IDS.map((h) => (
                  <Chip
                    key={h}
                    label={HEALING[h]}
                    on={ph.status === h}
                    onClick={() => mut((x) => void (x.prevHealing!.status = x.prevHealing!.status === h ? '' : h))}
                  />
                ))}
              </Chips>
              <Field label={P.healingComment} opt={P.healingSaved}>
                <input
                  className="input"
                  value={ph.note}
                  placeholder={P.healingPlaceholder}
                  autoComplete="off"
                  onChange={(e) => mut((x) => void (x.prevHealing!.note = e.target.value))}
                />
              </Field>
            </div>
          </>
        )}

        <div className="form-title">{P.anesthesia}</div>
        <div className="form-card">
          <Field label={P.primary} as="div">
            <Select
              value={d.anesthesia.primary}
              options={anestOptions(idx, 'primary', d.anesthesia.primary)}
              placeholder={P.noAnesthesia}
              ariaLabel={P.primary}
              onChange={(v) => mut((x) => void (x.anesthesia.primary = v))}
            />
          </Field>
          <Field label={P.secondary} as="div">
            <Select
              value={d.anesthesia.secondary}
              options={anestOptions(idx, 'secondary', d.anesthesia.secondary)}
              placeholder={P.noSecondary}
              ariaLabel={P.secondary}
              onChange={(v) => mut((x) => void (x.anesthesia.secondary = v))}
            />
          </Field>
        </div>

        <div className="form-title">
          {removal ? P.remover : P.pigments}
          {d.pigments.length > 1 && <span className="fw-400"> {P.mix}</span>}
        </div>
        {d.pigments.map((g, i) => {
          const p = idx.pigment.get(g.pigmentId);
          const lots = p ? p.lots : [];
          const lot = lotInfo(idx, g.pigmentId, g.lot);
          return (
            <div className="pg-row" key={i}>
              <div className="pg-top">
                <Swatch hex={p?.hex} />
                <Select
                  value={g.pigmentId}
                  options={pigmentOptions(idx, d, g.pigmentId)}
                  placeholder={P.pigmentPick}
                  ariaLabel={P.pigments}
                  onChange={(v) =>
                    mut((x) => {
                      x.pigments[i].pigmentId = v;
                      x.pigments[i].lot = defaultLot(idx, v, x.date);
                    })
                  }
                />
                <button type="button" className="icon-btn" aria-label={P.removePigment} onClick={() => mut((x) => void x.pigments.splice(i, 1))}>
                  <Icon name="trash" />
                </button>
              </div>
              <div className="pg-bottom">
                <Select
                  value={g.lot}
                  options={lots.map((l) => ({ value: l.no, label: `${l.no}${l.exp && l.exp < d.date ? P.lotExpiredMark : ''}` }))}
                  placeholder={lots.length ? P.lot : P.noLots}
                  ariaLabel={P.lot}
                  onChange={(v) => mut((x) => void (x.pigments[i].lot = v))}
                />
                <input
                  className="input"
                  value={g.ratio}
                  placeholder={P.ratio}
                  aria-label={P.ratio}
                  autoComplete="off"
                  onChange={(e) => mut((x) => void (x.pigments[i].ratio = e.target.value))}
                />
              </div>
              {lot?.exp && (
                <div className="note mt-6 mx-2">
                  {lot.exp < d.date ? (
                    <>
                      <span className="dot dot--alert" /> {P.lotExpired(fmtMonthNum(lot.exp))}
                    </>
                  ) : (
                    P.lotValid(fmtMonthNum(lot.exp))
                  )}
                </div>
              )}
            </div>
          );
        })}
        <button
          type="button"
          className="btn btn-outline btn-block"
          onClick={() =>
            mut((x) => {
              if (x.type === 'removal') {
                const rem = data.pigments.find((p) => p.active && p.kind === 'Ремувер');
                x.pigments.push({ pigmentId: rem?.id ?? '', lot: rem ? defaultLot(idx, rem.id, x.date) : '', ratio: '' });
              } else x.pigments.push({ pigmentId: '', lot: '', ratio: '' });
            })
          }
        >
          <Icon name="plus" /> {removal ? P.addRemover : d.pigments.length ? P.addToMix : P.addPigment}
        </button>

        <div className="form-title">{P.needle}</div>
        <Chips>
          {needles.map((n) => (
            <Chip
              key={n.id}
              label={n.name}
              on={d.needles.includes(n.id)}
              onClick={() => mut((x) => void (x.needles = x.needles.includes(n.id) ? x.needles.filter((y) => y !== n.id) : [...x.needles, n.id]))}
            />
          ))}
        </Chips>

        <div className="form-title">{P.photos}</div>
        <div className="form-card pb-14">
          {PHOTO_STAGES.map((st) => (
            <div className="photo-stage" key={st}>
              <div className="photo-stage-label">
                <span>{PHOTO_STAGE[st]}</span>
                {st === 'month' && <span>{P.later}</span>}
              </div>
              <div className="photo-strip">
                {d.photos[st].map((photo, i) => (
                  <Thumb
                    key={photo.blobId}
                    photo={photo}
                    onOpen={() => viewDraftPhoto(st, i)}
                    onDelete={() => {
                      photos.remove(photo);
                      mut((x) => void x.photos[st].splice(i, 1));
                    }}
                  />
                ))}
                <PhotoAdd
                  label={ru.common.addPhoto(PHOTO_STAGE[st])}
                  onClick={async () => {
                    const refs = await photos.add();
                    if (refs.length) mut((x) => void x.photos[st].push(...refs));
                  }}
                />
              </div>
            </div>
          ))}
          <p className="hint mt-12 mb-0">{P.exifNote}</p>
        </div>

        {d.id && (
          <>
            <div className="form-title">{P.ownHealing}</div>
            <div className="form-card">
              <Chips className="mb-12">
                {HEALING_IDS.map((h) => (
                  <Chip key={h} label={HEALING[h]} on={d.healing.status === h} onClick={() => mut((x) => void (x.healing.status = x.healing.status === h ? '' : h))} />
                ))}
              </Chips>
              <Field label={P.healingComment}>
                <input className="input" value={d.healing.note} autoComplete="off" onChange={(e) => mut((x) => void (x.healing.note = e.target.value))} />
              </Field>
            </div>
          </>
        )}

        <div className="form-title">{P.payment}</div>
        <div className="form-card">
          <Field label={P.price}>
            <div className="affix">
              <input
                className="input"
                inputMode="numeric"
                value={d.price ? String(d.price) : ''}
                placeholder="0"
                autoComplete="off"
                onChange={(e) => mut((x) => void (x.price = parseMoney(e.target.value)))}
              />
              <span>₽</span>
            </div>
          </Field>
          <Field label={P.discount} opt={P.discountOpt} err={errors.discount} as="div">
            <div className="discount-row">
              <div className="seg" role="group" aria-label={P.discountIn}>
                {(['pct', 'rub'] as const).map((m) => (
                  <button key={m} type="button" className={d.discount.mode === m ? 'on' : ''} aria-pressed={d.discount.mode === m} onClick={() => mut((x) => void (x.discount.mode = m))}>
                    {m === 'pct' ? '%' : '₽'}
                  </button>
                ))}
              </div>
              <input
                className="input"
                inputMode="numeric"
                value={d.discount.value ? String(d.discount.value) : ''}
                placeholder="0"
                aria-label={P.discountSize}
                autoComplete="off"
                onChange={(e) => mut((x) => void (x.discount.value = parseMoney(e.target.value)))}
              />
            </div>
            <Chips className="mt-10">
              {data.lists.discountReasons.map((r) => (
                <Chip key={r} label={r} on={d.discount.reason === r} onClick={() => mut((x) => void (x.discount.reason = x.discount.reason === r ? '' : r))} />
              ))}
            </Chips>
          </Field>
          <SwitchRow
            title={P.model}
            sub={P.modelSub}
            checked={d.model.on}
            onChange={(v) =>
              mut((x) => {
                x.model.on = v;
                if (v && !x.discount.reason) {
                  x.discount.reason = MODEL_TAG;
                  if (!x.model.courseId && data.courses.length) x.model.courseId = data.courses[data.courses.length - 1].id;
                }
              })
            }
          />
          {d.model.on && (
            <Field label={P.course} as="div">
              <Select
                value={d.model.courseId}
                options={data.courses.map((co) => ({ value: co.id, label: co.name }))}
                placeholder={data.courses.length ? P.coursePick : P.noCourses}
                onChange={(v) => mut((x) => void (x.model.courseId = v))}
              />
            </Field>
          )}
          <div className="total-box">
            <div>
              <div className="l">{P.total}</div>
              <div className="s">{totalSub(d)}</div>
            </div>
            <div className="v">{fmtMoney(total)}</div>
          </div>
          <Field label={P.payMethod} as="div">
            <Chips>
              {PAYMENTS.map((pm) => (
                <Chip
                  key={pm}
                  label={PAYMENT[pm]}
                  on={d.payment === pm}
                  onClick={() =>
                    mut((x) => {
                      x.payment = pm;
                      if (pm !== 'cert') x.certificateId = '';
                    })
                  }
                />
              ))}
            </Chips>
          </Field>
          {d.payment === 'cert' &&
            (certs.length ? (
              <Field label={P.cert} err={errors.cert} as="div">
                <Select
                  value={d.certificateId}
                  options={certs.map((x) => ({ value: x.id, label: `№ ${x.no} · ${fmtMoney(x.amount)}${x.recipient ? ` · ${x.recipient}` : ''}` }))}
                  placeholder={P.certPick}
                  onChange={(v) => mut((x) => void (x.certificateId = v))}
                />
                {cert && <p className="hint mt-8 mb-0">{certPayText(cert, total)}</p>}
              </Field>
            ) : (
              <p className="hint mt-0">{P.noCerts}</p>
            ))}
          <Field label={P.status} as="div">
            <Chips>
              {STATUSES.map((s) => (
                <Chip key={s} label={STATUS[s]} on={d.status === s} onClick={() => mut((x) => void (x.status = s))} />
              ))}
            </Chips>
            {d.status !== 'done' && <p className="hint mt-8 mb-0">{P.notRevenue}</p>}
          </Field>
        </div>

        <div className="form-title">{P.note}</div>
        <textarea className="textarea" value={d.note} placeholder={P.notePlaceholder} onChange={(e) => mut((x) => void (x.note = e.target.value))} />
        {!d.id && (
          <button type="button" className="btn btn-ghost btn-block mt-14" onClick={() => save(true)}>
            {P.saveNext}
          </button>
        )}
      </SheetBody>
      <SheetFoot>
        <button type="button" className="btn btn-primary" onClick={() => save(false)}>
          {P.saveProc}
        </button>
      </SheetFoot>
    </>
  );
}

export function openProcForm(opts: { clientId?: string; procId?: string; draft?: ProcDraft }) {
  const idx = useData.getState().idx;
  const cid = opts.clientId || (opts.procId ? idx.proc.get(opts.procId)?.clientId : '');
  if (!cid || !idx.client.get(cid)) return;
  ui().openSheet(() => <ProcForm {...opts} clientId={cid} />);
}
