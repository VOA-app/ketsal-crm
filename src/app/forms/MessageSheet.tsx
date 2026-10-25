// Сообщение по шаблону: текст копируется, мастер отправляет его сама; клиентка помечается «напомнили».
import { useState } from 'react';
import { clientInfo } from '../../domain/client';
import { TEMPLATE_IDS } from '../../domain/constants';
import { withReminded } from '../../domain/reminders';
import { fullName } from '../../domain/search';
import { fmtPhone } from '../../domain/phone';
import { fillTemplate } from '../../domain/templates';
import type { Procedure, TemplateId } from '../../domain/types';
import { fmtDate } from '../../i18n/format';
import { CONTACT, TEMPLATE, ru } from '../../i18n/ru';
import { Avatar } from '../components/ClientBits';
import { Icon } from '../components/Icon';
import { Check, Chip, Chips } from '../components/kit';
import { SheetBody, SheetFoot, SheetHead, useSheet } from '../components/Sheet';
import { zoneName } from '../names';
import { useData } from '../store';
import { ui } from '../ui';

const M = ru.message;

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** Ссылка на переписку с клиенткой; для MAX ссылки нет — только копирование. */
export function chatLink(contact: { kind: string; handle: string } | undefined, phone: string): string {
  const handle = (contact?.handle || '').trim().replace(/^@/, '');
  const digits = phone.replace(/\D/g, '');
  const safe = encodeURIComponent(handle.replace(/^https?:\/\/[^/]+\//, ''));
  switch (contact?.kind) {
    case 'vk':
      return handle ? `https://vk.com/${safe}` : '';
    case 'tg':
      return handle ? `https://t.me/${safe}` : '';
    case 'wa':
      return digits ? `https://wa.me/${digits}` : '';
    case 'phone':
      return digits ? `sms:+${digits}` : '';
    default:
      return '';
  }
}

interface Target {
  zone?: string;
  proc?: Procedure;
  key: string;
}

function MessageSheet({ clientId, kind: kindIn, keyIn }: { clientId: string; kind: string; keyIn: string }) {
  const idx = useData((s) => s.idx);
  const c = idx.client.get(clientId)!;
  const inf = clientInfo(idx, c);
  const sheet = useSheet();
  const target = (k: TemplateId): Target | null => {
    if (k === 'corr') return inf.corr.find((x) => x.key === keyIn) || inf.corr[0] || null;
    if (k === 'upd') return inf.upd.find((x) => x.key === keyIn) || inf.upd[0] || null;
    if (k === 'lost' && inf.last) return { zone: inf.last.zone, proc: inf.last, key: `lost:${inf.last.id}` };
    if (k === 'bday' && inf.bday) return { key: inf.bday.key };
    return null;
  };
  const textFor = (k: TemplateId) => {
    const t = target(k);
    return fillTemplate(idx.data.settings.templates[k], c, {
      zoneName: t?.zone ? zoneName(idx, t.zone) : undefined,
      proc: t?.proc,
      today: idx.today,
      fmtDate: (iso) => fmtDate(iso, true),
      noZone: M.noZone,
    });
  };
  const initialKind: TemplateId = (TEMPLATE_IDS as string[]).includes(kindIn)
    ? (kindIn as TemplateId)
    : inf.corr.length
      ? 'corr'
      : inf.upd.length
        ? 'upd'
        : inf.bday && inf.bday.inDays <= 14
          ? 'bday'
          : inf.lost
            ? 'lost'
            : 'free';
  const [kind, setKind] = useState<TemplateId>(initialKind);
  const [text, setText] = useState(() => textFor(initialKind));
  const [mark, setMark] = useState(true);
  const key = target(kind)?.key ?? '';
  const channel = c.contact && c.contact.kind !== 'phone' ? CONTACT[c.contact.kind] : M.sms;

  const chat = chatLink(c.contact, c.phone);

  const finish = async (open: boolean) => {
    const ok = await copyText(text);
    if (!ok) {
      const ta = document.querySelector<HTMLTextAreaElement>('.msg-text');
      ta?.focus();
      ta?.select();
      ui().toast(M.copyFailed);
      return;
    }
    if (mark && key) {
      const cur = useData.getState().idx.client.get(clientId)!;
      useData.getState().apply((tx) => tx.put('clients', { ...cur, reminded: withReminded(cur, key, idx.today) }));
    }
    sheet.close();
    ui().toast(M.copied);
    // Текст в ссылку не подставляем (SPEC §10.1): мастер вставляет его сама
    if (open && chat) window.open(chat, '_blank', 'noopener');
  };

  return (
    <>
      <SheetHead title={M.title} left={ru.common.close} />
      <SheetBody>
        <div className="sheet-client">
          <Avatar c={c} size="avatar--sm" />
          <div>
            <div className="t">{fullName(c)}</div>
            <div className="s">
              {channel}
              {c.contact?.handle ? `: ${c.contact.handle}` : ''} · {fmtPhone(c.phone)}
            </div>
          </div>
        </div>
        <div className="form-title mt-0">{M.template}</div>
        <Chips className="mb-14">
          {TEMPLATE_IDS.map((t) => (
            <Chip
              key={t}
              label={TEMPLATE[t]}
              on={kind === t}
              onClick={() => {
                setKind(t);
                setText(textFor(t));
              }}
            />
          ))}
        </Chips>
        <textarea className="textarea msg-text" value={text} onChange={(e) => setText(e.target.value)} aria-label={M.text} />
        {key && (
          <Check checked={mark} onChange={setMark} className="check--plain">
            {M.mark}
          </Check>
        )}
        <p className="hint mt-6">{M.hint(channel)}</p>
      </SheetBody>
      <SheetFoot>
        <button type="button" className={`btn ${chat ? 'btn-secondary' : 'btn-primary'}`} onClick={() => finish(false)}>
          <Icon name="copy" /> {M.copy}
        </button>
        {chat && (
          <button type="button" className="btn btn-primary" onClick={() => finish(true)}>
            {M.openChat(channel)}
          </button>
        )}
      </SheetFoot>
    </>
  );
}

export function openMessage(clientId: string, kind = '', key = '') {
  ui().openSheet(() => <MessageSheet clientId={clientId} kind={kind} keyIn={key} />);
}
