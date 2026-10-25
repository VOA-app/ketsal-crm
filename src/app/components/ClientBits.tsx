// Аватар клиентки и строка процедуры — используются на нескольких экранах.
import { useNavigate } from 'react-router';
import { initials, fullName } from '../../domain/search';
import { lc } from '../../domain/text';
import type { Client, Entity, Procedure } from '../../domain/types';
import { fmtDate, fmtMoney } from '../../i18n/format';
import { STATUS, VISIT_TYPE, ru } from '../../i18n/ru';
import { discountText, needleName, pigmentLabel, procDiscount, procTotal, serviceName } from '../names';
import { useData } from '../store';
import { PhotoImg } from './Photo';
import { Swatch } from './kit';

export function Avatar({ c, size = '' }: { c: Client; size?: '' | 'avatar--xl' | 'avatar--sm' }) {
  return (
    <span className={`avatar ${size}`} aria-hidden="true">
      {c.facePhoto ? <PhotoImg photo={c.facePhoto} /> : initials(c)}
    </span>
  );
}

export function ProcItem({ p, withClient = false }: { p: Entity<Procedure>; withClient?: boolean }) {
  const idx = useData((s) => s.idx);
  const navigate = useNavigate();
  const c = idx.client.get(p.clientId);
  const dim = p.status !== 'done';
  const disc = procDiscount(p);
  const title = withClient ? (c ? fullName(c) : ru.journal.clientDeleted) : serviceName(idx, p.serviceId);
  const meta = [
    withClient ? serviceName(idx, p.serviceId) : fmtDate(p.date, true),
    VISIT_TYPE[p.type],
    dim ? lc(STATUS[p.status]) : null,
  ]
    .filter(Boolean)
    .join(' · ');
  const pigments = p.pigments.filter((g) => g.pigmentId);
  const hasMats = !dim && (pigments.length > 0 || p.needles.length > 0);
  return (
    <button type="button" className={`proc-item ${dim ? 'proc-item--dim' : ''}`} onClick={() => navigate(`/proc/${p.id}`)}>
      <div className="proc-main">
        <div className="proc-title">{title}</div>
        <div className="proc-meta">{meta}</div>
        {hasMats && (
          <div className="proc-mat">
            {pigments.map((g, i) => (
              <span key={i}>
                <Swatch hex={idx.pigment.get(g.pigmentId)?.hex} />
                {pigmentLabel(idx, g.pigmentId)}
              </span>
            ))}
            {p.needles.length > 0 && <span>{p.needles.map((id) => needleName(idx, id)).join(', ')}</span>}
          </div>
        )}
      </div>
      <div className="proc-sum">
        {dim ? ru.common.none : fmtMoney(procTotal(p))}
        {disc > 0 && !dim && <small>{ru.journal.discountShort(discountText(p))}</small>}
      </div>
    </button>
  );
}
