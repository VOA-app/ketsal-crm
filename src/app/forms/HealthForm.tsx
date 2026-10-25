// Анкета здоровья (SPEC §1.3): отметки, аллергии, препараты, согласие на данные о здоровье.
import { useState } from 'react';
import { hasHealthData } from '../../domain/client';
import { ALLERGY_SUGGEST, HEALTH_FLAGS } from '../../domain/constants';
import { todayISO } from '../../domain/dates';
import { fullName } from '../../domain/search';
import { norm } from '../../domain/text';
import type { Health } from '../../domain/types';
import { fmtDate } from '../../i18n/format';
import { HEALTH_FLAG, ru } from '../../i18n/ru';
import { Avatar } from '../components/ClientBits';
import { Icon } from '../components/Icon';
import { Check, Chip, Chips } from '../components/kit';
import { SheetBody, SheetFoot, SheetHead, useSheet } from '../components/Sheet';
import { normalizeConsents } from './ClientForm';
import { useData } from '../store';
import { ui } from '../ui';

const H = ru.healthForm;

function HealthForm({ clientId }: { clientId: string }) {
  const c = useData((s) => s.idx.client.get(clientId));
  const sheet = useSheet();
  const [h, setH] = useState<Health>(() =>
    c?.health
      ? { ...c.health, flags: { ...c.health.flags }, allergies: c.health.allergies.slice() }
      : { filledAt: '', flags: {}, allergies: [], meds: '', other: '' },
  );
  const [consent, setConsent] = useState(c?.consents?.health?.date || '');
  const [allergyInput, setAllergyInput] = useState('');
  if (!c) return null;
  const up = (patch: Partial<Health>) => setH((x) => ({ ...x, ...patch }));
  const addAllergy = (v: string) => {
    const a = norm(v);
    if (a && !h.allergies.includes(a)) up({ allergies: [...h.allergies, a] });
  };
  const save = () => {
    const extra = norm(allergyInput);
    const health: Health = {
      ...h,
      allergies: extra && !h.allergies.includes(extra) ? [...h.allergies, extra] : h.allergies,
      filledAt: todayISO(),
      meds: h.meds.trim(),
      other: h.other.trim(),
    };
    const consents = { ...normalizeConsents(c.consents), health: { date: consent || '' } };
    const next = { ...c, health, consents };
    useData.getState().apply((tx) => tx.put('clients', next));
    sheet.close();
    ui().toast(hasHealthData(next) && !consent ? H.savedNoConsent : H.saved);
  };
  return (
    <>
      <SheetHead title={H.title} right={ru.common.done} onRight={save} />
      <SheetBody>
        <div className="sheet-client">
          <Avatar c={c} size="avatar--sm" />
          <div>
            <div className="t">{fullName(c)}</div>
            <div className="s">
              {ru.card.title(c.cardNo)}
              {h.filledAt ? ` · ${H.filled(fmtDate(h.filledAt, true))}` : ''}
            </div>
          </div>
        </div>
        <div className="warn-box mb-6">
          <div className="warn">
            <Icon name="shield" className="i-sm" />
            <div>{H.notice}</div>
          </div>
        </div>
        <div className="form-title">{H.flags}</div>
        <div className="form-card form-card--checks">
          {HEALTH_FLAGS.map((f) => (
            <Check key={f.id} checked={!!h.flags[f.id]} onChange={(v) => up({ flags: { ...h.flags, [f.id]: v } })}>
              {HEALTH_FLAG[f.id]}
            </Check>
          ))}
        </div>
        <div className="form-title">{H.allergies}</div>
        <Chips className="mb-10">
          {h.allergies.length ? (
            h.allergies.map((a, i) => (
              <Chip
                key={a}
                on
                ariaLabel={H.removeAllergy(a)}
                onClick={() => up({ allergies: h.allergies.filter((_, j) => j !== i) })}
              >
                {a} <Icon name="close" className="i-sm" />
              </Chip>
            ))
          ) : (
            <span className="muted fs-14">{H.noAllergies}</span>
          )}
        </Chips>
        <div className="inline-actions mb-10">
          <input
            className="input"
            value={allergyInput}
            onChange={(e) => setAllergyInput(e.target.value)}
            placeholder={H.allergyPlaceholder}
            autoComplete="off"
            aria-label={H.allergyNew}
          />
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => {
              addAllergy(allergyInput);
              setAllergyInput('');
            }}
          >
            {ru.common.add}
          </button>
        </div>
        <Chips>
          {ALLERGY_SUGGEST.filter((a) => !h.allergies.includes(a)).map((a) => (
            <Chip key={a} label={`+ ${a}`} onClick={() => addAllergy(a)} />
          ))}
        </Chips>
        <div className="form-title">{H.meds}</div>
        <textarea
          className="textarea"
          value={h.meds}
          onChange={(e) => up({ meds: e.target.value })}
          placeholder={H.medsPlaceholder}
        />
        <div className="form-title">{H.other}</div>
        <textarea
          className="textarea"
          value={h.other}
          onChange={(e) => up({ other: e.target.value })}
          placeholder={H.otherPlaceholder}
        />
        <div className="form-title">{H.consent}</div>
        <div className="inline-actions">
          <input
            className="input"
            type="date"
            value={consent}
            max={todayISO()}
            onChange={(e) => setConsent(e.target.value)}
            aria-label={H.consentDate}
          />
          <button type="button" className="btn btn-secondary" onClick={() => setConsent(todayISO())}>
            {ru.common.today}
          </button>
        </div>
      </SheetBody>
      <SheetFoot>
        <button type="button" className="btn btn-primary" onClick={save}>
          {H.save}
        </button>
      </SheetFoot>
    </>
  );
}

export function openHealthForm(clientId: string) {
  ui().openSheet(() => <HealthForm clientId={clientId} />);
}
