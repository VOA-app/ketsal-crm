// Короткие шторки: заживление процедуры и выбор клиентки для новой процедуры.
import { useState } from 'react';
import { clientInfo } from '../../domain/client';
import { HEALING as HEALING_IDS } from '../../domain/constants';
import { fmtPhone } from '../../domain/phone';
import { fullName, searchClients } from '../../domain/search';
import { sortClientItems } from '../../domain/reminders';
import type { HealingStatus } from '../../domain/types';
import { fmtDate, NBSP } from '../../i18n/format';
import { HEALING, ru } from '../../i18n/ru';
import { Avatar } from '../components/ClientBits';
import { Icon } from '../components/Icon';
import { Chip, Chips, Empty, Field, SearchBox } from '../components/kit';
import { SheetBody, SheetFoot, SheetHead, useSheet } from '../components/Sheet';
import { serviceName } from '../names';
import { useData } from '../store';
import { ui } from '../ui';
import { openClientForm } from './ClientForm';

function HealingForm({ procId }: { procId: string }) {
  const idx = useData((s) => s.idx);
  const p = idx.proc.get(procId);
  const sheet = useSheet();
  const [status, setStatus] = useState<HealingStatus | ''>(p?.healing?.status || '');
  const [note, setNote] = useState(p?.healing?.note || '');
  if (!p) return null;
  const save = () => {
    useData.getState().apply((tx) => tx.put('procedures', { ...p, healing: { status, note: note.trim() } }));
    sheet.close();
    ui().toast(ru.common.saved);
  };
  return (
    <>
      <SheetHead title={ru.healing.title} right={ru.common.done} onRight={save} />
      <SheetBody>
        <p className="note mt-0 mb-12">
          {serviceName(idx, p.serviceId)}, {fmtDate(p.date, true)}
        </p>
        <Chips className="mb-14">
          {HEALING_IDS.map((h) => (
            <Chip key={h} label={HEALING[h]} on={status === h} onClick={() => setStatus(status === h ? '' : h)} />
          ))}
        </Chips>
        <Field label={ru.procForm.healingComment}>
          <textarea
            className="textarea"
            value={note}
            placeholder={ru.procForm.healingPlaceholder}
            onChange={(e) => setNote(e.target.value)}
          />
        </Field>
        {status === 'reaction' && <p className="hint">{ru.healing.reactionHint}</p>}
      </SheetBody>
      <SheetFoot>
        <button type="button" className="btn btn-primary" onClick={save}>
          {ru.common.save}
        </button>
      </SheetFoot>
    </>
  );
}

export function openHealingForm(procId: string) {
  ui().openSheet(() => <HealingForm procId={procId} />, { auto: true });
}

function ClientPicker({ onPick }: { onPick: (clientId: string) => void }) {
  const idx = useData((s) => s.idx);
  const sheet = useSheet();
  const [q, setQ] = useState('');
  const res = q.trim()
    ? searchClients(idx, q)
    : sortClientItems(
        idx.data.clients.map((c) => ({ c, inf: clientInfo(idx, c) })),
        'recent',
      ).slice(0, 30);
  const pick = (id: string) => {
    sheet.close();
    setTimeout(() => onPick(id), 260);
  };
  return (
    <>
      <SheetHead title={ru.picker.title} />
      <SheetBody className="pt-12">
        <SearchBox
          value={q}
          onChange={setQ}
          placeholder={ru.clients.search}
          label={ru.picker.search}
          className="mb-12"
        />
        <button
          type="button"
          className="btn btn-secondary btn-block mb-6"
          onClick={() => {
            sheet.close();
            setTimeout(() => openClientForm({ prefill: q }), 260);
          }}
        >
          <Icon name="plus" /> {ru.clients.newCard}
        </button>
        {!res.length ? (
          <Empty text={ru.common.nothingFound} />
        ) : (
          <>
            {!q.trim() && (
              <div className="list-head">
                <span>{ru.picker.recent}</span>
              </div>
            )}
            <div className="list">
              {res.slice(0, 50).map(({ c }) => (
                <button type="button" className="row" key={c.id} onClick={() => pick(c.id)}>
                  <Avatar c={c} />
                  <div className="row-main">
                    <div className="row-title">{fullName(c)}</div>
                    <div className="row-sub">
                      №{NBSP}
                      {c.cardNo} · {fmtPhone(c.phone)}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </>
        )}
      </SheetBody>
    </>
  );
}

export function openClientPicker(onPick: (clientId: string) => void) {
  ui().openSheet(() => <ClientPicker onPick={onPick} />);
}
