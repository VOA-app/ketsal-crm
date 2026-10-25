// Согласия из карты клиента: на ПД, на процедуру, на данные о здоровье.
import { useState } from 'react';
import { fullName } from '../../domain/search';
import { ru } from '../../i18n/ru';
import { Avatar } from '../components/ClientBits';
import { SheetBody, SheetFoot, SheetHead, useSheet } from '../components/Sheet';
import { useData } from '../store';
import { ui } from '../ui';
import { ConsentEditor, normalizeConsents, type Consents } from './ClientForm';
import { usePhotoDraft } from './photos';

const F = ru.clientForm;

function ConsentsForm({ clientId }: { clientId: string }) {
  const c = useData((s) => s.idx.client.get(clientId));
  const photos = usePhotoDraft();
  const [cons, setCons] = useState<Consents>(() => normalizeConsents(c?.consents));
  const sheet = useSheet((close) => {
    photos.discard();
    close();
  });
  if (!c) return null;
  const set = (k: keyof Consents, patch: object) => setCons((x) => ({ ...x, [k]: { ...x[k], ...patch } }));
  const add = async (k: 'pd' | 'procedure') => {
    const refs = await photos.add();
    if (refs.length) setCons((x) => ({ ...x, [k]: { ...x[k], photos: [...x[k].photos, ...refs] } }));
  };
  const del = (k: 'pd' | 'procedure', i: number) => {
    photos.remove(cons[k].photos[i]);
    set(k, { photos: cons[k].photos.filter((_, j) => j !== i) });
  };
  const save = () => {
    const removed = photos.removedIds();
    useData.getState().apply((tx) => {
      tx.put('clients', { ...c, consents: cons });
      tx.dropBlobs(removed);
    });
    sheet.close();
    ui().toast(ru.consents.saved);
  };
  return (
    <>
      <SheetHead title={ru.consents.title} right={ru.common.done} onRight={save} />
      <SheetBody>
        <div className="sheet-client">
          <Avatar c={c} size="avatar--sm" />
          <div>
            <div className="t">{fullName(c)}</div>
            <div className="s">{ru.card.title(c.cardNo)}</div>
          </div>
        </div>
        <div className="form-card">
          <ConsentEditor
            label={F.consentPd}
            date={cons.pd.date}
            photos={cons.pd.photos}
            onDate={(v) => set('pd', { date: v })}
            onAddPhoto={() => add('pd')}
            onDelPhoto={(i) => del('pd', i)}
          />
          <ConsentEditor
            label={F.consentProc}
            date={cons.procedure.date}
            photos={cons.procedure.photos}
            onDate={(v) => set('procedure', { date: v })}
            onAddPhoto={() => add('procedure')}
            onDelPhoto={(i) => del('procedure', i)}
          />
          <ConsentEditor label={F.consentHealth} date={cons.health.date} onDate={(v) => set('health', { date: v })} />
        </div>
        <p className="hint mt-12">{ru.consents.hint}</p>
      </SheetBody>
      <SheetFoot>
        <button type="button" className="btn btn-primary" onClick={save}>
          {ru.common.save}
        </button>
      </SheetFoot>
    </>
  );
}

export function openConsentsForm(clientId: string) {
  ui().openSheet(() => <ConsentsForm clientId={clientId} />);
}
