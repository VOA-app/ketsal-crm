// Печать и PDF карты клиента (SPEC §9.2): материалы, фото, здоровье — по галочкам.
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { clientInfo } from '../../domain/client';
import { PHOTO_STAGES } from '../../domain/constants';
import { formalName } from '../../domain/search';
import { fmtPhone } from '../../domain/phone';
import { lc } from '../../domain/text';
import { fmtDate, fmtDateNum, fmtMoney } from '../../i18n/format';
import { PHOTO_STAGE, STATUS, VISIT_TYPE, ru } from '../../i18n/ru';
import { Logo } from '../components/Brand';
import { Icon } from '../components/Icon';
import { PhotoImg } from '../components/Photo';
import { anestName, healthMarks, needleName, pigmentFull, procDiscount, procTotal, serviceName, zoneName } from '../names';
import { useData } from '../store';
import { useUi } from '../ui';

const PR = ru.print;

export function PrintCard() {
  const id = useUi((s) => s.printClientId);
  const close = useUi((s) => s.closePrint);
  const idx = useData((s) => s.idx);
  const [opts, setOpts] = useState({ materials: true, photos: true, health: false });
  const c = id ? idx.client.get(id) : undefined;
  if (!c) return null;
  const inf = clientInfo(idx, c);
  const procs = inf.procs.slice().reverse();
  const done = procs.filter((p) => p.status === 'done');
  const marks = healthMarks(c);
  const photos = opts.photos ? procs.flatMap((p) => PHOTO_STAGES.flatMap((st) => (p.photos?.[st] || []).map((photo) => ({ photo, p, st })))) : [];
  const opt = (k: keyof typeof opts, label: string) => (
    <label>
      <input type="checkbox" checked={opts[k]} onChange={(e) => setOpts({ ...opts, [k]: e.target.checked })} /> {label}
    </label>
  );
  const kv = (k: string, v: string) => (
    <div className="pp-kv">
      <span className="k">{k}</span>
      <span>{v}</span>
    </div>
  );
  return createPortal(
    <div className="print-root show">
      <div className="print-toolbar">
        <div className="row-gap">
          <button type="button" className="btn btn-outline btn-sm" onClick={close}>
            <Icon name="close" className="i-sm" /> {PR.close}
          </button>
          <b>{ru.card.title(c.cardNo)}</b>
        </div>
        <div className="print-opts">
          {opt('materials', PR.materials)}
          {opt('photos', PR.photos)}
          {opt('health', PR.health)}
        </div>
        <button type="button" className="btn btn-primary btn-sm" onClick={() => window.print()}>
          <Icon name="print" className="i-sm" /> {PR.go}
        </button>
      </div>
      <div className="print-page">
        <div className="pp-head">
          <div className="pp-logo">
            <Logo label="Кетсаль" />
          </div>
          <div className="pp-title">
            <div className="display">{PR.title}</div>
            <div className="no">{PR.no(c.cardNo)}</div>
            <div className="d">{PR.formed(fmtDate(idx.today, true))}</div>
          </div>
        </div>
        <div className="pp-sec">
          <h4>{PR.client}</h4>
          <div className="pp-grid">
            {kv(PR.fio, formalName(c))}
            {kv(PR.phone, fmtPhone(c.phone))}
            {kv(PR.birth, c.birth ? fmtDateNum(c.birth) : ru.common.none)}
            {kv(PR.firstVisit, inf.first ? fmtDateNum(inf.first.date) : ru.common.none)}
            {kv(PR.consentPd, c.consents?.pd?.date ? fmtDateNum(c.consents.pd.date) : PR.no2)}
            {kv(PR.consentProc, c.consents?.procedure?.date ? fmtDateNum(c.consents.procedure.date) : PR.no2)}
          </div>
        </div>
        {opts.health && (
          <div className="pp-sec pp-health">
            <h4>{PR.healthTitle(c.health?.filledAt ? fmtDateNum(c.health.filledAt) : '')}</h4>
            {marks.length ? (
              <ul>
                {marks.map((m) => (
                  <li key={m}>{m}</li>
                ))}
              </ul>
            ) : (
              <div>{PR.noMarks}</div>
            )}
            {c.consents?.health?.date && <div className="muted">{PR.healthConsent(fmtDateNum(c.consents.health.date))}</div>}
          </div>
        )}
        <div className="pp-sec">
          <h4>{PR.procs}</h4>
          {procs.length ? (
            <table className="pp-table">
              <thead>
                <tr>
                  <th>{PR.colDate}</th>
                  <th>{PR.colService}</th>
                  <th>{PR.colZone}</th>
                  {opts.materials && <th>{PR.colMaterials}</th>}
                  <th className="r">{PR.colPrice}</th>
                  <th className="r">{PR.colDiscount}</th>
                  <th className="r">{PR.colTotal}</th>
                </tr>
              </thead>
              <tbody>
                {procs.map((p) => {
                  const dim = p.status !== 'done';
                  const disc = procDiscount(p);
                  const an = [p.anesthesia.primary, p.anesthesia.secondary].filter(Boolean).map((a) => anestName(idx, a)).join('; ');
                  const pigs = p.pigments.map((g) => PR.lot(pigmentFull(idx, g.pigmentId), g.lot, g.ratio)).join(' + ');
                  const mats = [
                    an && PR.anesthesia(an),
                    pigs && (p.type === 'removal' ? PR.remover(pigs) : PR.pigments(pigs)),
                    p.needles.length > 0 && PR.needle(p.needles.map((n) => needleName(idx, n)).join(', ')),
                  ].filter(Boolean);
                  return (
                    <tr key={p.id}>
                      <td className="nowrap">{fmtDateNum(p.date)}</td>
                      <td>
                        {serviceName(idx, p.serviceId)}
                        <br />
                        <span className="muted">
                          {VISIT_TYPE[p.type]}
                          {dim ? `, ${lc(STATUS[p.status])}` : ''}
                        </span>
                      </td>
                      <td>
                        {zoneName(idx, p.zone)}
                        {p.technique && (
                          <>
                            <br />
                            <span className="muted">{p.technique}</span>
                          </>
                        )}
                      </td>
                      {opts.materials && <td className="pre-line">{mats.join('\n') || ru.common.none}</td>}
                      <td className="r">{dim ? ru.common.none : fmtMoney(p.price)}</td>
                      <td className="r">{disc && !dim ? `−${fmtMoney(disc)}` : ru.common.none}</td>
                      <td className="r">{dim ? ru.common.none : fmtMoney(procTotal(p))}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={opts.materials ? 6 : 5}>{PR.totalFor(done.length)}</td>
                  <td className="r">{fmtMoney(inf.spent)}</td>
                </tr>
              </tfoot>
            </table>
          ) : (
            <div>{PR.noProcs}</div>
          )}
        </div>
        {photos.length > 0 && (
          <div className="pp-sec">
            <h4>{PR.photos}</h4>
            <div className="pp-photos">
              {photos.slice(0, 16).map((x) => (
                <figure key={x.photo.blobId}>
                  <PhotoImg photo={x.photo} />
                  <figcaption>
                    {PHOTO_STAGE[x.st]} · {zoneName(idx, x.p.zone)} · {fmtDateNum(x.p.date)}
                  </figcaption>
                </figure>
              ))}
            </div>
          </div>
        )}
        <div className="pp-foot">
          <span>{PR.footAddress}</span>
          <span>{PR.footPhone}</span>
        </div>
      </div>
    </div>,
    document.body,
  );
}
