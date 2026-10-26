// Карта клиента: шапка, напоминания, итоги, вкладки «История», «Фото», «Данные».
import type { ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router';
import { clientInfo, hasHealthData, type ClientInfo, type CorrItem, type UpdItem } from '../../domain/client';
import { PHOTO_STAGES } from '../../domain/constants';
import { ageOn } from '../../domain/dates';
import { procsOf } from '../../domain/indexing';
import { remindedAt } from '../../domain/reminders';
import { formalName, fullName } from '../../domain/search';
import { fmtPhone } from '../../domain/phone';
import { lc, uniq } from '../../domain/text';
import type { Client, Entity, PhotoRef, PhotoStage, Procedure } from '../../domain/types';
import { fmtDate, fmtDateShort, fmtMoney, relDay } from '../../i18n/format';
import { CONTACT, PHOTO_STAGE, VISIT_TYPE, ru } from '../../i18n/ru';
import { Avatar, ProcItem } from '../components/ClientBits';
import { Icon } from '../components/Icon';
import { Chip, Chips, Empty, Kv, NavBar, Notice, Seg } from '../components/kit';
import { PhotoImg } from '../components/Photo';
import { actionSheet } from '../components/Sheet';
import { openClientForm } from '../forms/ClientForm';
import { openConsentsForm } from '../forms/ConsentsForm';
import { openHealthForm } from '../forms/HealthForm';
import { openMessage } from '../forms/MessageSheet';
import { openProcForm } from '../forms/ProcForm';
import { repeatDraft } from '../../domain/procedures';
import { healthMarks, zoneName } from '../names';
import { allBlobIds, useData } from '../store';
import { ui, type ViewerItem } from '../ui';
import { useView, type ClientTab } from '../view';
import { dueDot, dueState } from './Clients';

const C = ru.card;

export function NotFound({ text }: { text: string }) {
  return (
    <div className="screen">
      <NavBar title="" />
      <div className="scroller">
        <Empty title={text} text={ru.common.notFound} />
      </div>
    </div>
  );
}

function ReminderCard({ c, it }: { c: Entity<Client>; it: CorrItem | UpdItem }) {
  const idx = useData((s) => s.idx);
  const p = it.proc;
  const reminded = remindedAt(c, it.key);
  const zone = lc(zoneName(idx, it.zone));
  const sub = [
    `${VISIT_TYPE[p.type]} ${fmtDate(p.date)}`,
    p.technique ? lc(p.technique) : '',
    it.kind === 'corr' ? C.window(fmtDateShort(it.winFrom), fmtDateShort(it.winTo)) : '',
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <div className="rem rem--accent">
      <div className="rem-head">
        <span className={`dot ${dueDot(it)}`} />
        <span>{it.kind === 'corr' ? C.corrTitle(zone) : C.updTitle(zone)}</span>
        <span className="rem-state">{dueState(it, idx.today)}</span>
      </div>
      <div className="rem-sub">{sub}</div>
      {reminded && <div className="rem-note">{C.remindedAt(relDay(reminded, idx.today))}</div>}
      <div className="rem-actions">
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={() =>
            openProcForm({ clientId: c.id, draft: repeatDraft(useData.getState().idx, c.id, it.zone, idx.today) })
          }
        >
          <Icon name="repeat" /> {C.repeat}
        </button>
        <button
          type="button"
          className="btn btn-outline btn-sm btn-icon"
          aria-label={C.writeReminder}
          onClick={() => openMessage(c.id, it.kind, it.key)}
        >
          <Icon name="message" />
        </button>
      </div>
    </div>
  );
}

function Alerts({ c, inf }: { c: Entity<Client>; inf: ClientInfo }) {
  const out: ReactNode[] = [];
  for (const it of [...inf.corr, ...inf.upd]) out.push(<ReminderCard key={it.key} c={c} it={it} />);
  if (inf.bday && inf.bday.inDays <= 14) {
    const when =
      inf.bday.inDays === 0
        ? ru.clients.today
        : inf.bday.inDays === 1
          ? ru.clients.tomorrow
          : fmtDate(inf.bday.date, false);
    out.push(
      <Notice
        key="bday"
        icon="gift"
        text={C.bday(when, inf.bday.age)}
        btn={ru.clients.congratulate}
        onClick={() => openMessage(c.id, 'bday', inf.bday!.key)}
      />,
    );
  }
  const missing = [
    inf.consentMissing && C.noConsentPd,
    inf.procConsentMissing && inf.procs.length > 0 && C.noConsentProc,
    inf.healthConsentMissing && C.noConsentHealth,
  ].filter((x): x is string => !!x);
  if (missing.length)
    out.push(
      <Notice
        key="cons"
        icon="doc"
        text={C.noConsent(missing)}
        btn={ru.common.add}
        onClick={() => openConsentsForm(c.id)}
      />,
    );
  if (inf.healthMissing)
    out.push(
      <Notice
        key="health"
        icon="health"
        text={C.healthMissing}
        btn={ru.common.fill}
        onClick={() => openHealthForm(c.id)}
      />,
    );
  return out.length ? <div className="alerts">{out}</div> : null;
}

interface ZonePhoto {
  photo: PhotoRef;
  p: Entity<Procedure>;
  stage: PhotoStage;
}

function zonePhotos(procs: Entity<Procedure>[], zone: string): ZonePhoto[] {
  const out: ZonePhoto[] = [];
  for (const p of procs
    .filter((x) => x.zone === zone)
    .slice()
    .reverse()) {
    for (const st of PHOTO_STAGES) for (const photo of p.photos?.[st] || []) out.push({ photo, p, stage: st });
  }
  return out;
}

function Photos({ c }: { c: Entity<Client> }) {
  const idx = useData((s) => s.idx);
  const { photoZone, set } = useView();
  const procs = procsOf(idx, c.id);
  const zones = uniq(procs.filter((p) => PHOTO_STAGES.some((st) => (p.photos?.[st] || []).length)).map((p) => p.zone));
  if (!zones.length) return <Empty text={C.noPhotos} />;
  const zone = zones.includes(photoZone[c.id]) ? photoZone[c.id] : zones[0];
  const items = zonePhotos(procs, zone);
  const toViewer = (x: ZonePhoto): ViewerItem => ({
    photo: x.photo,
    title: PHOTO_STAGE[x.stage],
    sub: `${fmtDate(x.p.date, true)} · ${VISIT_TYPE[x.p.type]} · ${zoneName(idx, x.p.zone)}`,
  });
  const groups: { p: Entity<Procedure>; items: (ZonePhoto & { i: number })[] }[] = [];
  items.forEach((x, i) => {
    let g = groups[groups.length - 1];
    if (!g || g.p.id !== x.p.id) {
      g = { p: x.p, items: [] };
      groups.push(g);
    }
    g.items.push({ ...x, i });
  });
  const compare = () => {
    const withMonth = items.filter((x) => x.stage === 'month').pop();
    let a: ZonePhoto | undefined;
    let b: ZonePhoto | undefined;
    if (withMonth) {
      a =
        items.find((x) => x.p.id === withMonth.p.id && x.stage === 'before') || items.find((x) => x.stage === 'before');
      b = withMonth;
    } else {
      a = items.find((x) => x.stage === 'before');
      b = items.filter((x) => x.stage !== 'before').pop();
    }
    if (!a || !b) {
      ui().toast(C.compareNeed);
      return;
    }
    const cap = (x: ZonePhoto): ViewerItem => ({
      photo: x.photo,
      title: PHOTO_STAGE[x.stage],
      sub: `${x.stage === 'before' ? '' : C.afterProc}${fmtDate(x.p.date, true)}`,
    });
    ui().openCompare(cap(a), cap(b));
  };
  return (
    <>
      <Chips className="mb-12">
        {zones.map((z) => (
          <Chip
            key={z}
            label={zoneName(idx, z)}
            on={z === zone}
            onClick={() => set({ photoZone: { ...photoZone, [c.id]: z } })}
          />
        ))}
      </Chips>
      <button type="button" className="btn btn-secondary btn-sm mb-16" onClick={compare}>
        <Icon name="compare" /> {C.compare}
      </button>
      {groups.map((g) => (
        <div className="timeline-group" key={g.p.id}>
          <div className="timeline-head">
            <b>{fmtDate(g.p.date, true)}</b> · {VISIT_TYPE[g.p.type]}
            {g.p.technique ? ` · ${lc(g.p.technique)}` : ''}
          </div>
          <div className="photo-grid">
            {g.items.map((x) => (
              <button
                type="button"
                className="ph"
                key={x.photo.blobId}
                onClick={() => ui().openViewer(items.map(toViewer), x.i)}
              >
                <PhotoImg photo={x.photo} alt={`${PHOTO_STAGE[x.stage]}, ${fmtDate(x.p.date, true)}`} />
                <div className="ph-cap">
                  <b>{PHOTO_STAGE[x.stage]}</b>
                </div>
              </button>
            ))}
          </div>
        </div>
      ))}
    </>
  );
}

function ConsentRow({
  label,
  date,
  photos,
  notNeeded,
}: {
  label: string;
  date?: string;
  photos?: PhotoRef[];
  notNeeded?: boolean;
}) {
  let v: ReactNode;
  if (date) {
    v = (
      <>
        {fmtDate(date, true)}
        {photos && photos.length > 0 && (
          <>
            {' · '}
            <button
              type="button"
              className="btn-link btn-link--inline"
              onClick={() =>
                ui().openViewer(
                  photos.map((photo, i) => ({
                    photo,
                    title: label,
                    sub: photos.length > 1 ? ru.photo.of(i + 1, photos.length) : '',
                  })),
                )
              }
            >
              {C.form}
            </button>
          </>
        )}
      </>
    );
  } else if (notNeeded) v = <span className="muted">{C.notNeeded}</span>;
  else
    v = (
      <>
        <span className="dot dot--alert" /> {C.no}
      </>
    );
  return <Kv k={label}>{v}</Kv>;
}

function HealthBlock({ c }: { c: Entity<Client> }) {
  const { healthShown, set } = useView();
  const h = c.health;
  if (!h || !h.filledAt) return <div className="muted fs-15">{C.healthNotFilled}</div>;
  const marks = healthMarks(c);
  const head = C.healthHead(fmtDate(h.filledAt, true), marks.length);
  if (!marks.length) return <div className="fs-15">{head}</div>;
  const toggle = () => set({ healthShown: { ...healthShown, [c.id]: !healthShown[c.id] } });
  if (!healthShown[c.id]) {
    return (
      <div className="row-between">
        <span className="fs-15">{head}</span>
        <button type="button" className="btn btn-sm btn-secondary" onClick={toggle}>
          <Icon name="eye" className="i-sm" /> {ru.common.show}
        </button>
      </div>
    );
  }
  return (
    <>
      <div className="fs-15 mb-8">{head}</div>
      <ul className="marks">
        {marks.map((m) => (
          <li key={m}>{m}</li>
        ))}
      </ul>
      <button type="button" className="btn-link" onClick={toggle}>
        {ru.common.hide}
      </button>
    </>
  );
}

function DataTab({ c, inf, onPurge }: { c: Entity<Client>; inf: ClientInfo; onPurge: () => void }) {
  const today = useData((s) => s.idx.today);
  const ct =
    c.contact && c.contact.kind !== 'phone'
      ? `${CONTACT[c.contact.kind]}${c.contact.handle ? `: ${c.contact.handle}` : ''}`
      : C.onlyCall;
  const cons = c.consents;
  return (
    <>
      <div className="section-title mt-4">
        {C.contacts}
        <button type="button" className="btn-link" onClick={() => openClientForm({ clientId: c.id })}>
          {ru.common.change}
        </button>
      </div>
      <div className="card">
        <Kv k={C.fio}>{formalName(c)}</Kv>
        <Kv k={C.phone}>{fmtPhone(c.phone)}</Kv>
        <Kv k={C.where}>{ct}</Kv>
        <Kv k={C.birth}>{c.birth ? `${fmtDate(c.birth, true)}, ${C.age(ageOn(c.birth, today))}` : ru.common.none}</Kv>
        <Kv k={C.source}>{c.source || ru.common.none}</Kv>
        <Kv k={C.firstVisit}>{inf.first ? fmtDate(inf.first.date, true) : ru.common.none}</Kv>
        {c.notes && (
          <div className="kv kv--block">
            <div className="k">{C.notes}</div>
            <div className="pre-wrap">{c.notes}</div>
          </div>
        )}
      </div>
      <div className="section-title">
        {C.consents}
        <button type="button" className="btn-link" onClick={() => openConsentsForm(c.id)}>
          {ru.common.change}
        </button>
      </div>
      <div className="card">
        <ConsentRow label={C.consentPd} date={cons?.pd?.date} photos={cons?.pd?.photos} />
        <ConsentRow label={C.consentProc} date={cons?.procedure?.date} photos={cons?.procedure?.photos} />
        <ConsentRow label={C.consentHealth} date={cons?.health?.date} notNeeded={!hasHealthData(c)} />
      </div>
      <div className="section-title">
        {C.health}
        <button type="button" className="btn-link" onClick={() => openHealthForm(c.id)}>
          {c.health?.filledAt ? ru.common.change : ru.common.fill}
        </button>
      </div>
      <div className="card">
        <HealthBlock c={c} />
      </div>
      <div className="section-title">{C.totals}</div>
      <div className="card">
        <Kv k={C.procCount}>{String(inf.visits)}</Kv>
        <Kv k={C.spentTotal}>{fmtMoney(inf.spent)}</Kv>
        <Kv k={C.discounts}>{fmtMoney(inf.discounts)}</Kv>
        <Kv k={C.avg}>{inf.visits ? fmtMoney(Math.round(inf.spent / inf.visits)) : ru.common.none}</Kv>
      </div>
      <div className="btn-stack mt-18">
        <button type="button" className="btn btn-outline" onClick={() => ui().openPrint(c.id)}>
          <Icon name="print" /> {C.print}
        </button>
        <button type="button" className="btn btn-danger" onClick={onPurge}>
          <Icon name="trash" /> {C.purge}
        </button>
      </div>
    </>
  );
}

export function ClientCard() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const idx = useData((s) => s.idx);
  const { clientTab, set } = useView();
  const c = idx.client.get(id);
  if (!c) return <NotFound text={C.notFound} />;
  const inf = clientInfo(idx, c);
  const tab: ClientTab = clientTab[c.id] || 'history';

  const purge = async () => {
    const n = procsOf(idx, c.id).length;
    const ok = await ui().confirm({
      title: C.purgeTitle,
      text: C.purgeText(c.cardNo, n),
      ok: C.purgeOk,
      requireWord: C.purgeWord,
    });
    if (!ok) return;
    const procs = procsOf(useData.getState().idx, c.id);
    useData.getState().apply((tx) => {
      // Фото клиентки и её процедур стираются физически; сертификат остаётся использованным
      const blobIds = allBlobIds({ ...tx.data, clients: [c], procedures: procs });
      for (const p of procs) {
        tx.purge('procedures', p.id);
        for (const cert of tx.data.certificates)
          if (cert.usedProcId === p.id) tx.put('certificates', { ...cert, usedProcId: 'deleted' });
      }
      tx.purge('clients', c.id);
      tx.dropBlobs(blobIds);
    });
    ui().closeAllSheets();
    navigate('/clients', { replace: true });
    ui().toast(C.purged(c.cardNo));
  };

  const menu = async () => {
    const v = await actionSheet('', [
      { value: 'edit', label: C.menuEdit, icon: 'edit' as const },
      { value: 'health', label: C.menuHealth, icon: 'health' as const },
      { value: 'consents', label: C.menuConsents, icon: 'doc' as const },
      { value: 'print', label: C.print, icon: 'print' as const },
      { value: 'purge', label: C.purge, icon: 'trash' as const, danger: true },
    ]);
    if (v === 'edit') openClientForm({ clientId: c.id });
    else if (v === 'health') openHealthForm(c.id);
    else if (v === 'consents') openConsentsForm(c.id);
    else if (v === 'print') ui().openPrint(c.id);
    else if (v === 'purge') void purge();
  };

  return (
    <div className="screen">
      <NavBar
        title={C.title(c.cardNo)}
        backTo="/clients"
        right={
          <button type="button" className="icon-btn icon-btn--accent" aria-label={C.actions} onClick={menu}>
            <Icon name="dots" />
          </button>
        }
      />
      <div className="scroller scroller--bar">
        <section className="profile">
          <Avatar c={c} size="avatar--xl" />
          <h1 className="display profile-name">{fullName(c)}</h1>
          <div className="profile-meta">
            {fmtPhone(c.phone)}
            {inf.first ? ` · ${C.since(fmtDate(inf.first.date, true))}` : ''}
          </div>
          {c.tags.length > 0 && (
            <div className="profile-tags">
              {c.tags.map((t) => (
                <span className="tag" key={t}>
                  {t}
                </span>
              ))}
            </div>
          )}
          <div className="quick">
            <a href={`tel:${c.phone}`} className="quick-btn">
              <Icon name="phone" />
              {C.call}
            </a>
            <button type="button" className="quick-btn" onClick={() => openMessage(c.id)}>
              <Icon name="message" />
              {C.write}
            </button>
            <button type="button" className="quick-btn" onClick={() => ui().openPrint(c.id)}>
              <Icon name="print" />
              {C.pdf}
            </button>
          </div>
        </section>
        <Alerts c={c} inf={inf} />
        <div className="stats">
          <div className="stat">
            <div className="stat-v">{inf.visits}</div>
            <div className="stat-l">{C.visits(inf.visits)}</div>
          </div>
          <div className="stat">
            <div className="stat-v">{fmtMoney(inf.spent)}</div>
            <div className="stat-l">{C.spent}</div>
          </div>
          <div className="stat">
            <div className="stat-v">{inf.last ? fmtDateShort(inf.last.date) : ru.common.none}</div>
            <div className="stat-l">{C.lastVisit}</div>
          </div>
        </div>
        <Seg
          className="seg--card"
          value={tab}
          onChange={(v) => set({ clientTab: { ...clientTab, [c.id]: v } })}
          options={[
            ['history', C.tabs.history],
            ['photos', C.tabs.photos],
            ['data', C.tabs.data],
          ]}
        />
        {tab === 'photos' ? (
          <Photos c={c} />
        ) : tab === 'data' ? (
          <DataTab c={c} inf={inf} onPurge={purge} />
        ) : inf.procs.length ? (
          <div className="list">
            {inf.procs.map((p) => (
              <ProcItem key={p.id} p={p} />
            ))}
          </div>
        ) : (
          <Empty text={C.noProcs} />
        )}
      </div>
      <div className="bottom-bar">
        <button type="button" className="btn btn-primary btn-block" onClick={() => openProcForm({ clientId: c.id })}>
          <Icon name="plus" /> {C.procedure}
        </button>
      </div>
    </div>
  );
}
