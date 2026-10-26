// Карта клиента: новая и изменение. Согласия (дата и фото бланка) — здесь же.
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { CONTACT_KINDS } from '../../domain/constants';
import { todayISO } from '../../domain/dates';
import { ulid } from '../../domain/ids';
import { fmtPhone, normPhone } from '../../domain/phone';
import { findByPhone, fullName, nextCardNo } from '../../domain/search';
import { cap } from '../../domain/text';
import type { Client, Entity, PhotoRef } from '../../domain/types';
import { CONTACT, ru } from '../../i18n/ru';
import { Icon } from '../components/Icon';
import { Chip, Chips, Field, scrollToError } from '../components/kit';
import { PhotoAdd, Thumb } from '../components/Photo';
import { SheetBody, SheetFoot, SheetHead, useSheet } from '../components/Sheet';
import { useData } from '../store';
import { ui } from '../ui';
import { usePhotoDraft } from './photos';
import { openProcForm } from './ProcForm';

const F = ru.clientForm;

export type Consents = Client['consents'];

export const emptyConsents = (): Consents => ({
  pd: { date: '', photos: [] },
  procedure: { date: '', photos: [] },
  health: { date: '' },
});

export const normalizeConsents = (x?: Partial<Consents> | null): Consents => ({
  pd: { date: x?.pd?.date || '', photos: (x?.pd?.photos || []).slice() },
  procedure: { date: x?.procedure?.date || '', photos: (x?.procedure?.photos || []).slice() },
  health: { date: x?.health?.date || '' },
});

/** Дата согласия и фото бланка. */
export function ConsentEditor({
  label,
  date,
  photos,
  onDate,
  onAddPhoto,
  onDelPhoto,
}: {
  label: string;
  date: string;
  photos?: PhotoRef[];
  onDate: (d: string) => void;
  onAddPhoto?: () => void;
  onDelPhoto?: (i: number) => void;
}) {
  const today = todayISO();
  return (
    <div className="field">
      <span className="field-label">
        <span>{label}</span>
        {photos && <span className="opt">{F.consentOpt}</span>}
      </span>
      <div className="inline-actions">
        <input
          className="input"
          type="date"
          value={date}
          max={today}
          onChange={(e) => onDate(e.target.value)}
          aria-label={F.consentDate(label)}
        />
        <button type="button" className="btn btn-secondary" onClick={() => onDate(today)}>
          {ru.common.today}
        </button>
      </div>
      {photos && (
        <div className="photo-strip mt-8">
          {photos.map((p, i) => (
            <Thumb key={p.blobId} photo={p} onDelete={() => onDelPhoto?.(i)} />
          ))}
          <PhotoAdd icon="doc" label={F.consentPhoto} onClick={() => onAddPhoto?.()} />
        </div>
      )}
    </div>
  );
}

interface Draft {
  id: string | null;
  cardNo: string;
  lastName: string;
  firstName: string;
  middleName: string;
  phone: string;
  contact: Client['contact'];
  birth: string;
  source: string;
  tags: string[];
  facePhoto: PhotoRef | null;
  notes: string;
  consents: Consents;
}

function ClientForm({ clientId, prefill = '' }: { clientId?: string; prefill?: string }) {
  const navigate = useNavigate();
  const data = useData((s) => s.data);
  const idx = useData((s) => s.idx);
  const src = clientId ? idx.client.get(clientId) : undefined;
  const photos = usePhotoDraft();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [d, setD] = useState<Draft>(() => {
    const base: Draft = src
      ? {
          id: src.id,
          cardNo: String(src.cardNo),
          lastName: src.lastName,
          firstName: src.firstName,
          middleName: src.middleName,
          phone: fmtPhone(src.phone),
          contact: src.contact ? { ...src.contact } : { kind: 'phone', handle: '' },
          birth: src.birth,
          source: src.source,
          tags: src.tags.slice(),
          facePhoto: src.facePhoto,
          notes: src.notes,
          consents: normalizeConsents(src.consents),
        }
      : {
          id: null,
          cardNo: String(nextCardNo(data)),
          lastName: '',
          firstName: '',
          middleName: '',
          phone: '',
          contact: { kind: 'vk', handle: '' },
          birth: '',
          source: '',
          tags: [],
          facePhoto: null,
          notes: '',
          consents: emptyConsents(),
        };
    if (!src && prefill) {
      if (/^[\d\s()+-]+$/.test(prefill)) base.phone = prefill.trim();
      else {
        const [a, b] = prefill.trim().split(/\s+/);
        base.firstName = cap(a || '');
        base.lastName = cap(b || '');
      }
    }
    return base;
  });
  const sheet = useSheet((close) => {
    photos.discard();
    close();
  });
  const up = (patch: Partial<Draft>) => setD((x) => ({ ...x, ...patch }));
  const upConsent = (k: 'pd' | 'procedure', patch: Partial<Consents['pd']>) =>
    setD((x) => ({ ...x, consents: { ...x.consents, [k]: { ...x.consents[k], ...patch } } }));
  const isNew = !d.id;
  const withHandle = d.contact.kind !== 'phone' && d.contact.kind !== 'wa';
  const dup = findByPhone(idx, d.phone, d.id ?? undefined);

  const addConsentPhoto = async (k: 'pd' | 'procedure') => {
    const refs = await photos.add();
    if (refs.length)
      setD((x) => ({
        ...x,
        consents: { ...x.consents, [k]: { ...x.consents[k], photos: [...x.consents[k].photos, ...refs] } },
      }));
  };
  const delConsentPhoto = (k: 'pd' | 'procedure', i: number) => {
    const r = d.consents[k].photos[i];
    photos.remove(r);
    upConsent(k, { photos: d.consents[k].photos.filter((_, j) => j !== i) });
  };

  async function save(startProc: boolean) {
    const e: Record<string, string> = {};
    if (!d.firstName.trim()) e.firstName = F.errFirstName;
    const phone = normPhone(d.phone);
    if (!phone || phone.length !== 12) e.phone = F.errPhone;
    const no = parseInt(d.cardNo.replace(/\D/g, ''), 10);
    if (!no || no < 1) e.cardNo = F.errCardNo;
    else if (data.clients.some((x) => x.cardNo === no && x.id !== d.id)) e.cardNo = F.errCardTaken(no);
    if (d.birth && d.birth > todayISO()) e.birth = F.errBirth;
    setErrors(e);
    if (Object.keys(e).length) {
      scrollToError();
      ui().toast(ru.common.checkFields);
      return;
    }
    const twin = findByPhone(idx, phone, d.id ?? undefined);
    if (twin && !src) {
      const ok = await ui().confirm({
        title: F.dupTitle,
        text: F.dupText(fullName(twin), twin.cardNo),
        ok: F.dupOk,
        danger: false,
      });
      if (!ok) return;
    }
    const rec: Entity<Client> = {
      ...(src ?? { reminded: {}, health: null, createdAt: todayISO() }),
      id: d.id ?? ulid(),
      cardNo: no,
      firstName: cap(d.firstName.trim()),
      lastName: cap(d.lastName.trim()),
      middleName: cap(d.middleName.trim()),
      phone,
      contact: { kind: d.contact.kind, handle: withHandle ? d.contact.handle.trim() : '' },
      birth: d.birth,
      source: d.source,
      tags: d.tags,
      facePhoto: d.facePhoto,
      notes: d.notes.trim(),
      consents: { ...d.consents, health: src?.consents?.health ?? { date: '' } },
    } as Entity<Client>;
    const removed = photos.removedRefs();
    useData.getState().apply((tx) => {
      tx.put('clients', rec);
      tx.settings({ nextCardNo: Math.max(tx.data.settings.nextCardNo, no + 1) });
      tx.dropPhotos(removed);
    });
    photos.commit();
    sheet.close();
    if (src) ui().toast(F.saved);
    else {
      ui().toast(F.created(no));
      navigate(`/client/${rec.id}`);
    }
    if (startProc) setTimeout(() => openProcForm({ clientId: rec.id }), 320);
  }

  return (
    <>
      <SheetHead title={isNew ? F.newTitle : F.editTitle} right={ru.common.done} onRight={() => save(false)} />
      <SheetBody>
        <div className="form-card">
          <Field label={F.cardNo} opt={isNew ? F.cardNoAuto : ''} err={errors.cardNo}>
            <input
              className="input"
              inputMode="numeric"
              value={d.cardNo}
              onChange={(e) => up({ cardNo: e.target.value })}
            />
          </Field>
          <div className="grid-2">
            <Field label={F.firstName} err={errors.firstName}>
              <input
                className="input"
                value={d.firstName}
                onChange={(e) => up({ firstName: e.target.value })}
                autoComplete="off"
                autoCapitalize="words"
              />
            </Field>
            <Field label={F.lastName}>
              <input
                className="input"
                value={d.lastName}
                onChange={(e) => up({ lastName: e.target.value })}
                autoComplete="off"
                autoCapitalize="words"
              />
            </Field>
          </div>
          <Field label={F.middleName} opt={ru.common.optional}>
            <input
              className="input"
              value={d.middleName}
              onChange={(e) => up({ middleName: e.target.value })}
              autoComplete="off"
              autoCapitalize="words"
            />
          </Field>
          <Field label={F.phone} err={errors.phone}>
            <input
              className="input"
              type="tel"
              inputMode="tel"
              value={d.phone}
              onChange={(e) => up({ phone: e.target.value })}
              placeholder={F.phonePlaceholder}
              autoComplete="off"
            />
          </Field>
          {dup && (
            <div className="dup">
              <Icon name="info" className="i-sm" />
              <span>{F.dup(fullName(dup), dup.cardNo)}</span>
              <button
                type="button"
                className="btn btn-sm btn-secondary"
                onClick={() => {
                  photos.discard();
                  sheet.close();
                  navigate(`/client/${dup.id}`);
                }}
              >
                {ru.common.open}
              </button>
            </div>
          )}
          <Field label={F.where} as="div">
            <Chips>
              {CONTACT_KINDS.map((k) => (
                <Chip
                  key={k}
                  label={CONTACT[k]}
                  on={d.contact.kind === k}
                  onClick={() => up({ contact: { ...d.contact, kind: k } })}
                />
              ))}
            </Chips>
          </Field>
          {withHandle && (
            <Field label={F.handle}>
              <input
                className="input"
                value={d.contact.handle}
                onChange={(e) => up({ contact: { ...d.contact, handle: e.target.value } })}
                autoComplete="off"
                autoCapitalize="none"
                placeholder={F.handlePlaceholder}
              />
            </Field>
          )}
          <Field label={F.birth} opt={F.birthOpt} err={errors.birth}>
            <input
              className="input"
              type="date"
              value={d.birth}
              max={todayISO()}
              onChange={(e) => up({ birth: e.target.value })}
            />
          </Field>
        </div>
        <div className="form-title">{F.source}</div>
        <Chips>
          {data.lists.sources.map((s) => (
            <Chip key={s} label={s} on={d.source === s} onClick={() => up({ source: d.source === s ? '' : s })} />
          ))}
        </Chips>
        <div className="form-title">{F.tags}</div>
        <Chips>
          {data.lists.tags.map((t) => (
            <Chip
              key={t}
              label={t}
              on={d.tags.includes(t)}
              onClick={() => up({ tags: d.tags.includes(t) ? d.tags.filter((x) => x !== t) : [...d.tags, t] })}
            />
          ))}
        </Chips>
        <div className="form-title">
          {F.face} <span className="fw-400">{ru.common.optional}</span>
        </div>
        <div className="photo-strip">
          {d.facePhoto ? (
            <Thumb
              photo={d.facePhoto}
              onDelete={() => {
                photos.remove(d.facePhoto!);
                up({ facePhoto: null });
              }}
            />
          ) : (
            <PhotoAdd
              label={F.face}
              onClick={async () => {
                const [r] = await photos.add(false);
                if (r) up({ facePhoto: r });
              }}
            />
          )}
        </div>
        <div className="form-title">{F.consents}</div>
        <div className="form-card">
          <ConsentEditor
            label={F.consentPd}
            date={d.consents.pd.date}
            photos={d.consents.pd.photos}
            onDate={(v) => upConsent('pd', { date: v })}
            onAddPhoto={() => addConsentPhoto('pd')}
            onDelPhoto={(i) => delConsentPhoto('pd', i)}
          />
          <ConsentEditor
            label={F.consentProc}
            date={d.consents.procedure.date}
            photos={d.consents.procedure.photos}
            onDate={(v) => upConsent('procedure', { date: v })}
            onAddPhoto={() => addConsentPhoto('procedure')}
            onDelPhoto={(i) => delConsentPhoto('procedure', i)}
          />
          <p className="hint">{F.consentHint}</p>
        </div>
        <div className="form-title">{F.notes}</div>
        <textarea
          className="textarea"
          value={d.notes}
          onChange={(e) => up({ notes: e.target.value })}
          placeholder={F.notesPlaceholder}
        />
      </SheetBody>
      <SheetFoot>
        {isNew ? (
          <button type="button" className="btn btn-primary" onClick={() => save(true)}>
            {F.saveAndProc}
          </button>
        ) : (
          <button type="button" className="btn btn-primary" onClick={() => save(false)}>
            {ru.common.save}
          </button>
        )}
      </SheetFoot>
    </>
  );
}

export function openClientForm(opts: { clientId?: string; prefill?: string }) {
  ui().openSheet(() => <ClientForm {...opts} />);
}
