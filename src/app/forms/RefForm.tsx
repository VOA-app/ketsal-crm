// Формы справочников. Используемое не удаляется, а убирается из выбора (SPEC §10.1).
import { useState, type ReactNode } from 'react';
import { PIGMENT_KINDS, VISIT_TYPES, ZONE_GROUPS } from '../../domain/constants';
import { addMonths, todayISO } from '../../domain/dates';
import { ulid } from '../../domain/ids';
import { parseMoney } from '../../domain/money';
import { cap, norm, uniq } from '../../domain/text';
import type { Anesthetic, Course, Entity, Needle, Pigment, Service, Zone } from '../../domain/types';
import { fmtMonthNum } from '../../i18n/format';
import { VISIT_TYPE, ZONE_GROUP, ru } from '../../i18n/ru';
import { Icon } from '../components/Icon';
import { Chip, Chips, Field, SwitchRow, scrollToError } from '../components/kit';
import { SheetBody, SheetFoot, SheetHead, useSheet } from '../components/Sheet';
import type { Coll } from '../../db/kinds';
import { usageCount } from '../screens/Refs';
import { useData } from '../store';
import { ui } from '../ui';
import type { RefKind } from '../view';

const F = ru.refs;

type AnyRef = Entity<Service> | Entity<Pigment> | Entity<Needle> | Entity<Anesthetic> | Entity<Zone> | Entity<Course>;
type Draft = Record<string, unknown> & { id: string; createdAt: string };

function blank(kind: RefKind): Draft {
  const base = { id: ulid(), createdAt: todayISO() };
  if (kind === 'services')
    return { ...base, name: '', zones: [], type: 'primary', technique: '', price: 0, duration: 120, active: true };
  if (kind === 'pigments')
    return {
      ...base,
      brand: '',
      name: '',
      kind: 'Органический',
      zones: [],
      hex: '#8C6A55',
      lots: [{ no: '', exp: addMonths(todayISO(), 12) }],
      active: true,
    };
  if (kind === 'needles') return { ...base, name: '', note: '', active: true };
  if (kind === 'anesthetics') return { ...base, name: '', stage: 'primary', substances: [], active: true };
  if (kind === 'zones') return { ...base, name: '', group: 'pmu', techniques: [], update: true };
  return { ...base, name: '', start: todayISO(), note: '' };
}

function RefForm({ kind, id }: { kind: RefKind; id: string | null }) {
  const data = useData((s) => s.data);
  const coll = data[kind] as AnyRef[];
  const src = id ? coll.find((x) => x.id === id) : undefined;
  const sheet = useSheet();
  const [d, setD] = useState<Draft>(() => {
    const x = src ? (structuredClone(src) as unknown as Draft) : blank(kind);
    if (kind === 'anesthetics') x.substancesText = (x.substances as string[]).join(', ');
    if (kind === 'zones') x.techniquesText = (x.techniques as string[]).join(', ');
    return x;
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const up = (patch: Record<string, unknown>) => setD((x) => ({ ...x, ...patch }));
  const str = (k: string) => String(d[k] ?? '');
  const zones = (d.zones as string[]) ?? [];
  const lots = (d.lots as { no: string; exp: string }[]) ?? [];
  const used = src ? usageCount(data, kind, src.id) : 0;
  const T = todayISO();

  const toggleZone = (z: string) => {
    const next = zones.includes(z) ? zones.filter((x) => x !== z) : [...zones, z];
    up({ zones: next, ...(kind === 'services' && next.length !== 1 ? { technique: '' } : null) });
  };
  const zoneChips = (
    <Chips>
      {data.zones.map((z) => (
        <Chip key={z.id} label={z.name} on={zones.includes(z.id)} onClick={() => toggleZone(z.id)} />
      ))}
    </Chips>
  );
  const activeSwitch = 'active' in d && (
    <SwitchRow title={F.active} sub={F.activeSub} checked={!!d.active} onChange={(v) => up({ active: v })} />
  );
  const nameInput = (placeholder?: string) => (
    <Field label={kind === 'needles' ? F.needleName : kind === 'pigments' ? F.color : F.name} err={errors.name}>
      <input
        className="input"
        value={str('name')}
        onChange={(e) => up({ name: e.target.value })}
        placeholder={placeholder}
        autoComplete="off"
      />
    </Field>
  );

  const del = async () => {
    const ok = await ui().confirm({ title: F.delTitle, text: str('name') || F.noName });
    if (!ok || !src) return;
    useData.getState().apply((tx) => tx.del(kind as Coll, src.id));
    sheet.close();
    ui().toast(ru.common.deleted);
  };

  const save = () => {
    const e: Record<string, string> = {};
    if (!str('name').trim()) e.name = F.errName;
    if (kind === 'services' && !zones.length) e.zones = F.errZones;
    if (kind === 'pigments' && !str('brand').trim()) e.brand = F.errBrand;
    setErrors(e);
    if (Object.keys(e).length) {
      scrollToError();
      return;
    }
    const rec: Draft = { ...d, name: str('name').trim() };
    if (kind === 'anesthetics') {
      rec.substances = str('substancesText').split(',').map(norm).filter(Boolean);
      delete rec.substancesText;
    }
    if (kind === 'zones') {
      rec.techniques = uniq(
        str('techniquesText')
          .split(',')
          .map((t) => cap(t.trim()))
          .filter(Boolean),
      );
      delete rec.techniquesText;
    }
    if (kind === 'pigments') {
      rec.brand = str('brand').trim();
      rec.lots = lots.filter((l) => l.no.trim()).map((l) => ({ no: l.no.trim(), exp: l.exp || '' }));
    }
    useData.getState().apply((tx) => tx.put(kind as Coll, rec as unknown as AnyRef));
    sheet.close();
    ui().toast(src ? ru.common.saved : F.added);
  };

  let body: ReactNode;
  if (kind === 'services') {
    const oneZone = zones.length === 1 ? data.zones.find((z) => z.id === zones[0]) : undefined;
    body = (
      <div className="form-card">
        {nameInput()}
        <div className="grid-2">
          <Field label={F.price}>
            <div className="affix">
              <input
                className="input"
                inputMode="numeric"
                value={d.price ? String(d.price) : ''}
                placeholder="0"
                onChange={(e) => up({ price: parseMoney(e.target.value) })}
              />
              <span>₽</span>
            </div>
          </Field>
          <Field label={F.duration}>
            <div className="affix">
              <input
                className="input"
                inputMode="numeric"
                value={d.duration ? String(d.duration) : ''}
                onChange={(e) => up({ duration: parseMoney(e.target.value) })}
              />
              <span>{F.minUnit}</span>
            </div>
          </Field>
        </div>
        <Field label={F.zones} err={errors.zones} as="div">
          {zoneChips}
        </Field>
        <Field label={F.type} as="div">
          <Chips>
            {VISIT_TYPES.map((t) => (
              <Chip key={t} label={VISIT_TYPE[t]} on={d.type === t} onClick={() => up({ type: t })} />
            ))}
          </Chips>
        </Field>
        {oneZone && oneZone.techniques.length > 0 && (
          <Field label={F.defaultTech} opt={ru.common.optional} as="div">
            <Chips>
              {oneZone.techniques.map((t) => (
                <Chip
                  key={t}
                  label={t}
                  on={d.technique === t}
                  onClick={() => up({ technique: d.technique === t ? '' : t })}
                />
              ))}
            </Chips>
          </Field>
        )}
        {activeSwitch}
      </div>
    );
  } else if (kind === 'pigments') {
    body = (
      <>
        <div className="form-card">
          <div className="grid-2">
            <Field label={F.brand} err={errors.brand}>
              <input
                className="input"
                value={str('brand')}
                onChange={(e) => up({ brand: e.target.value })}
                autoComplete="off"
              />
            </Field>
            {nameInput()}
          </div>
          <Field label={F.pigmentKind} as="div">
            <Chips>
              {PIGMENT_KINDS.map((k) => (
                <Chip key={k} label={k} on={d.kind === k} onClick={() => up({ kind: k })} />
              ))}
            </Chips>
          </Field>
          <Field label={F.forZones} as="div">
            {zoneChips}
          </Field>
          <Field label={F.swatch} opt={F.swatchOpt} as="div">
            <div className="inline-actions">
              <input
                type="color"
                className="color-input"
                value={str('hex')}
                onChange={(e) => up({ hex: e.target.value })}
                aria-label={F.swatch}
              />
              <span className="muted fs-14">{F.swatchHint}</span>
            </div>
          </Field>
          {activeSwitch}
        </div>
        <div className="form-title">{F.lots}</div>
        {lots.map((l, i) => (
          <div className="pg-row" key={i}>
            <div className="grid-2b">
              <input
                className="input"
                value={l.no}
                placeholder={F.lotNo}
                aria-label={F.lotNo}
                autoComplete="off"
                onChange={(e) => up({ lots: lots.map((x, j) => (j === i ? { ...x, no: e.target.value } : x)) })}
              />
              <input
                className="input"
                type="date"
                value={l.exp}
                aria-label={F.lotExp}
                onChange={(e) => up({ lots: lots.map((x, j) => (j === i ? { ...x, exp: e.target.value } : x)) })}
              />
            </div>
            <div className="row-between mt-6">
              <span className="muted fs-13">
                {l.exp && l.exp < T ? (
                  <>
                    <span className="dot dot--alert" /> {F.lotExpired}
                  </>
                ) : l.exp ? (
                  F.lotValid(fmtMonthNum(l.exp))
                ) : (
                  F.lotNoExp
                )}
              </span>
              <button type="button" className="btn-link" onClick={() => up({ lots: lots.filter((_, j) => j !== i) })}>
                {ru.common.delete}
              </button>
            </div>
          </div>
        ))}
        <button
          type="button"
          className="btn btn-outline btn-block"
          onClick={() => up({ lots: [{ no: '', exp: addMonths(todayISO(), 12) }, ...lots] })}
        >
          <Icon name="plus" /> {F.addLot}
        </button>
        <p className="hint mt-10">{F.lotHint}</p>
      </>
    );
  } else if (kind === 'needles') {
    body = (
      <div className="form-card">
        {nameInput(F.needlePlaceholder)}
        <Field label={F.note} opt={ru.common.optional}>
          <input
            className="input"
            value={str('note')}
            onChange={(e) => up({ note: e.target.value })}
            autoComplete="off"
          />
        </Field>
        {activeSwitch}
      </div>
    );
  } else if (kind === 'anesthetics') {
    body = (
      <div className="form-card">
        {nameInput()}
        <Field label={F.stage} as="div">
          <Chips>
            <Chip label={F.primary} on={d.stage === 'primary'} onClick={() => up({ stage: 'primary' })} />
            <Chip label={F.secondary} on={d.stage === 'secondary'} onClick={() => up({ stage: 'secondary' })} />
          </Chips>
        </Field>
        <Field label={F.substances} opt={F.substancesOpt}>
          <input
            className="input"
            value={str('substancesText')}
            placeholder={F.substancesPlaceholder}
            onChange={(e) => up({ substancesText: e.target.value })}
            autoComplete="off"
          />
        </Field>
        {activeSwitch}
      </div>
    );
  } else if (kind === 'zones') {
    const st = data.settings;
    body = (
      <div className="form-card">
        {nameInput()}
        <Field label={F.group} as="div">
          <Chips>
            {ZONE_GROUPS.map((g) => (
              <Chip key={g} label={ZONE_GROUP[g]} on={d.group === g} onClick={() => up({ group: g })} />
            ))}
          </Chips>
        </Field>
        <Field label={F.techniques} opt={F.commaList}>
          <input
            className="input"
            value={str('techniquesText')}
            placeholder={F.commaList}
            onChange={(e) => up({ techniquesText: e.target.value })}
            autoComplete="off"
          />
        </Field>
        <SwitchRow
          title={F.remindUpdateSwitch}
          sub={F.remindUpdateSub(st.updFrom, st.updTo)}
          checked={!!d.update}
          onChange={(v) => up({ update: v })}
        />
      </div>
    );
  } else {
    body = (
      <div className="form-card">
        {nameInput(F.courseName)}
        <Field label={F.courseStart}>
          <input className="input" type="date" value={str('start')} onChange={(e) => up({ start: e.target.value })} />
        </Field>
        <Field label={F.note} opt={ru.common.optional}>
          <textarea className="textarea" value={str('note')} onChange={(e) => up({ note: e.target.value })} />
        </Field>
      </div>
    );
  }

  return (
    <>
      <SheetHead title={F.titles[kind][src ? 1 : 0]} right={ru.common.done} onRight={save} />
      <SheetBody>
        {body}
        {src && (
          <>
            <p className="hint mt-14">{used ? F.used(used) : F.unused}</p>
            {!used && (
              <button type="button" className="btn btn-danger btn-block" onClick={del}>
                {ru.common.delete}
              </button>
            )}
          </>
        )}
      </SheetBody>
      <SheetFoot>
        <button type="button" className="btn btn-primary" onClick={save}>
          {ru.common.save}
        </button>
      </SheetFoot>
    </>
  );
}

export function openRefForm(kind: RefKind, id: string | null) {
  ui().openSheet(() => <RefForm kind={kind} id={id} />);
}
