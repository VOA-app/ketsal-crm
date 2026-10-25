// Подарочные сертификаты: продажа, срок действия, кто и когда использовал.
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { certStatus } from '../../domain/certificates';
import { PAYMENTS } from '../../domain/constants';
import { addMonths, todayISO } from '../../domain/dates';
import { ulid } from '../../domain/ids';
import { parseMoney } from '../../domain/money';
import { fullName } from '../../domain/search';
import type { Certificate, Entity } from '../../domain/types';
import { fmtDate, fmtMoney } from '../../i18n/format';
import { CERT_STATUS, PAYMENT, ru } from '../../i18n/ru';
import { Icon } from '../components/Icon';
import { Chip, Chips, Empty, Fab, Field, FieldError, NavBar, scrollToError } from '../components/kit';
import { SheetBody, SheetFoot, SheetHead, useSheet } from '../components/Sheet';
import { serviceName } from '../names';
import { useData } from '../store';
import { ui } from '../ui';
import { useView, type CertFilter } from '../view';

const S = ru.certs;
const PRESETS = [3000, 5000, 7000, 10000];

function CertForm({ id }: { id: string | null }) {
  const navigate = useNavigate();
  const idx = useData((s) => s.idx);
  const data = idx.data;
  const src = id ? idx.cert.get(id) : undefined;
  const sheet = useSheet();
  const T = todayISO();
  const [d, setD] = useState<Entity<Certificate>>(() =>
    src
      ? { ...src }
      : {
          id: ulid(),
          createdAt: T,
          no: `С-${String(data.settings.nextCertNo).padStart(3, '0')}`,
          amount: 5000,
          soldAt: T,
          validTo: addMonths(T, 6),
          buyer: '',
          recipient: '',
          payment: 'card',
          note: '',
          usedProcId: '',
          usedAt: '',
        },
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const up = (patch: Partial<Certificate>) => setD((x) => ({ ...x, ...patch }));
  const st = src ? certStatus(src, idx.today) : 'active';
  const p = src?.usedProcId ? idx.proc.get(src.usedProcId) : undefined;
  const c = p ? idx.client.get(p.clientId) : undefined;

  const save = () => {
    const e: Record<string, string> = {};
    if (!d.no.trim()) e.no = S.errNo;
    else if (data.certificates.some((x) => x.no === d.no.trim() && x.id !== d.id)) e.no = S.errNoTaken;
    if (!(d.amount > 0)) e.amount = S.errAmount;
    setErrors(e);
    if (Object.keys(e).length) {
      scrollToError();
      return;
    }
    const rec = { ...d, no: d.no.trim(), buyer: d.buyer.trim(), recipient: d.recipient.trim(), note: d.note.trim() };
    useData.getState().apply((tx) => {
      tx.put('certificates', rec);
      if (!src) tx.settings({ nextCertNo: tx.data.settings.nextCertNo + 1 });
    });
    sheet.close();
    ui().toast(src ? ru.common.saved : S.sold(rec.no));
  };
  const del = async () => {
    const ok = await ui().confirm({ title: S.delTitle, text: S.delText(d.no, fmtMoney(d.amount)) });
    if (!ok || !src) return;
    useData.getState().apply((tx) => tx.del('certificates', src.id));
    sheet.close();
    ui().toast(S.deleted);
  };

  return (
    <>
      <SheetHead title={src ? S.titleNo(d.no) : S.newTitle} right={ru.common.done} onRight={save} />
      <SheetBody>
        {src && (
          <div className="card card--mint mb-12">
            <div className="fw-600">{CERT_STATUS[st]}</div>
            {c && p && (
              <>
                <div className="note">{S.procLine(fmtDate(p.date, true), fullName(c), serviceName(idx, p.serviceId))}</div>
                <button
                  type="button"
                  className="btn-link"
                  onClick={() => {
                    sheet.close();
                    navigate(`/proc/${p.id}`);
                  }}
                >
                  {S.openProc}
                </button>
              </>
            )}
          </div>
        )}
        <div className="form-card">
          <Field label={S.no} err={errors.no}>
            <input className="input" value={d.no} onChange={(e) => up({ no: e.target.value })} autoComplete="off" />
          </Field>
          <div className="field" data-err={errors.amount ? '1' : undefined}>
            <span className="field-label">{S.amount}</span>
            <Chips className="mb-8">
              {PRESETS.map((v) => (
                <Chip key={v} label={fmtMoney(v)} on={d.amount === v} onClick={() => up({ amount: v })} />
              ))}
            </Chips>
            <div className="affix">
              <input className="input" inputMode="numeric" value={d.amount ? String(d.amount) : ''} onChange={(e) => up({ amount: parseMoney(e.target.value) })} aria-label={S.amount} />
              <span>₽</span>
            </div>
            <FieldError text={errors.amount} />
          </div>
          <div className="grid-2">
            <Field label={S.soldAt}>
              <input className="input" type="date" value={d.soldAt} onChange={(e) => up({ soldAt: e.target.value })} />
            </Field>
            <Field label={S.validToLabel}>
              <input className="input" type="date" value={d.validTo} onChange={(e) => up({ validTo: e.target.value })} />
            </Field>
          </div>
          <Field label={S.whoBought} opt={ru.common.optional}>
            <input className="input" value={d.buyer} onChange={(e) => up({ buyer: e.target.value })} autoComplete="off" />
          </Field>
          <Field label={S.forWhom} opt={ru.common.optional}>
            <input className="input" value={d.recipient} onChange={(e) => up({ recipient: e.target.value })} autoComplete="off" />
          </Field>
          <Field label={S.payment} as="div">
            <Chips>
              {PAYMENTS.filter((pm) => pm !== 'cert').map((pm) => (
                <Chip key={pm} label={PAYMENT[pm]} on={d.payment === pm} onClick={() => up({ payment: pm as Certificate['payment'] })} />
              ))}
            </Chips>
          </Field>
          <Field label={S.note} opt={ru.common.optional}>
            <textarea className="textarea" value={d.note} onChange={(e) => up({ note: e.target.value })} />
          </Field>
        </div>
        {src && !src.usedProcId && (
          <button type="button" className="btn btn-danger btn-block mt-14" onClick={del}>
            {S.del}
          </button>
        )}
      </SheetBody>
      <SheetFoot>
        <button type="button" className="btn btn-primary" onClick={save}>
          {src ? ru.common.save : S.sell}
        </button>
      </SheetFoot>
    </>
  );
}

const openCertForm = (id: string | null) => ui().openSheet(() => <CertForm id={id} />);

export function Certificates() {
  const idx = useData((s) => s.idx);
  const { certFilter: f, set } = useView();
  const counts = { active: 0, used: 0, expired: 0 };
  idx.data.certificates.forEach((x) => {
    counts[certStatus(x, idx.today)] += 1;
  });
  const list = idx.data.certificates
    .filter((x) => f === 'all' || certStatus(x, idx.today) === f)
    .sort((a, b) => (a.soldAt < b.soldAt ? 1 : -1));
  const filters: CertFilter[] = ['active', 'used', 'expired', 'all'];
  return (
    <div className="screen">
      <NavBar title={S.title} backTo="/more" />
      <div className="scroller">
        <Chips className="my-chips">
          {filters.map((id) => (
            <Chip key={id} on={f === id} onClick={() => set({ certFilter: id })}>
              {S.filters[id]}
              {id !== 'all' && counts[id] > 0 && <span className="n">{counts[id]}</span>}
            </Chip>
          ))}
        </Chips>
        <p className="note mx-4 mt-6">{S.note}</p>
        {list.length ? (
          <div className="list mt-12">
            {list.map((x) => {
              const st = certStatus(x, idx.today);
              let sub: string;
              if (st === 'active') sub = S.validTo(fmtDate(x.validTo, true));
              else if (st === 'expired') sub = S.expiredAt(fmtDate(x.validTo, true));
              else {
                const p = idx.proc.get(x.usedProcId);
                const c = p ? idx.client.get(p.clientId) : undefined;
                sub = `${S.usedAt(x.usedAt ? fmtDate(x.usedAt, true) : '')}${c ? ` · ${fullName(c)}` : x.usedProcId === 'deleted' ? S.cardDeleted : ''}`;
              }
              const who = [x.buyer && S.buyer(x.buyer), x.recipient && S.recipient(x.recipient)].filter(Boolean).join(' · ');
              return (
                <button type="button" key={x.id} className={`row ${st === 'active' ? '' : 'row--dim'}`} onClick={() => openCertForm(x.id)}>
                  <span className="avatar" aria-hidden="true">
                    <Icon name="gift" className="i-sm" />
                  </span>
                  <div className="row-main">
                    <div className="row-title">{S.rowTitle(x.no, fmtMoney(x.amount))}</div>
                    <div className="row-sub">{sub}</div>
                    {who && <div className="row-sub2">{who}</div>}
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          <Empty text={ru.common.empty} />
        )}
      </div>
      <Fab label={S.sell} onClick={() => openCertForm(null)} />
    </div>
  );
}
