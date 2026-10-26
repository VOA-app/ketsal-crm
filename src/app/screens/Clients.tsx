// Экран «Клиенты»: поиск, виды списка (коррекция, обновление, именинники…), сортировка.
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { CLIENT_VIEWS, type ClientView } from '../../domain/constants';
import type { CorrItem, ClientInfo, UpdItem } from '../../domain/client';
import { daysBetween } from '../../domain/dates';
import { recentlyReminded, remindedAt, viewItems, type ViewItem } from '../../domain/reminders';
import { fullName, nextCardNo, searchClients } from '../../domain/search';
import { lc } from '../../domain/text';
import type { Client, Entity } from '../../domain/types';
import { fmtDate, fmtDateShort, relDay } from '../../i18n/format';
import { VISIT_TYPE, ru } from '../../i18n/ru';
import { Avatar } from '../components/ClientBits';
import { SyncButton } from '../components/SyncCard';
import { Icon } from '../components/Icon';
import { Empty, Fab, ScrollChips, SearchBox } from '../components/kit';
import { actionSheet } from '../components/Sheet';
import { openClientForm } from '../forms/ClientForm';
import { openMessage } from '../forms/MessageSheet';
import { zoneName } from '../names';
import { useData } from '../store';
import { useView } from '../view';

const R = ru.clients;

export const dueDot = (it: CorrItem | UpdItem) =>
  it.state === 'late' ? 'dot--alert' : it.state === 'soon' ? 'dot--muted' : '';

export function dueState(it: CorrItem | UpdItem, today: string): string {
  if (it.kind === 'corr') {
    if (it.state === 'soon') return R.windowFrom(fmtDateShort(it.winFrom));
    if (it.state === 'now') return R.windowTo(fmtDateShort(it.winTo));
    return R.lateBy(daysBetween(it.winTo, today));
  }
  return R.monthsPassed(it.months);
}

function RowBadge({ inf, view }: { inf: ClientInfo; view: ClientView }) {
  if (view === 'noconsent') {
    return (
      <span className="pill">
        <span className="dot dot--ink" />
        {inf.consentMissing ? R.badgeNoConsent : R.badgeNoHealthConsent}
      </span>
    );
  }
  if (view === 'models') {
    const p = inf.done.find((x) => x.model?.on);
    return p ? <span className="pill pill--line">{fmtDateShort(p.date)}</span> : null;
  }
  const corr = inf.corr.find((x) => x.state !== 'soon') || inf.corr[0];
  if (corr) {
    return (
      <span className="pill">
        <span className={`dot ${dueDot(corr)}`} />
        {corr.state === 'soon' ? R.badgeCorrSoon : R.badgeCorr}
      </span>
    );
  }
  if (inf.upd.length) {
    return (
      <span className="pill">
        <span className="dot" />
        {R.badgeUpd}
      </span>
    );
  }
  if (inf.bday && inf.bday.inDays <= 7) {
    const when = inf.bday.inDays === 0 ? R.today : inf.bday.inDays === 1 ? R.tomorrow : fmtDateShort(inf.bday.date);
    return <span className="pill pill--line">{R.badgeBday(when)}</span>;
  }
  return null;
}

function ClientRow({ c, inf, view }: { c: Entity<Client>; inf: ClientInfo; view: ClientView }) {
  const navigate = useNavigate();
  const idx = useData((s) => s.idx);
  const bits = [R.card(c.cardNo)];
  if (inf.zones.length) bits.push(inf.zones.map((z) => lc(zoneName(idx, z))).join(', '));
  bits.push(inf.last ? fmtDateShort(inf.last.date) : R.noProcs);
  const badge = <RowBadge inf={inf} view={view} />;
  return (
    <button type="button" className="row" onClick={() => navigate(`/client/${c.id}`)}>
      <Avatar c={c} />
      <div className="row-main">
        <div className="row-title">{fullName(c)}</div>
        <div className="row-sub">{bits.join(' · ')}</div>
      </div>
      <div className="row-side">{badge}</div>
    </button>
  );
}

function ActionRow({ x, view }: { x: ViewItem; view: 'corr' | 'upd' | 'bday' | 'lost' }) {
  const navigate = useNavigate();
  const idx = useData((s) => s.idx);
  const { c, inf } = x;
  const it = x.it!;
  const reminded = remindedAt(c, it.key);
  let sub: string;
  let sub2: ReactNode;
  let btn = R.write;
  if (view === 'corr' || view === 'upd') {
    const d = it as CorrItem | UpdItem;
    sub = `${zoneName(idx, d.zone)} · ${lc(VISIT_TYPE[d.proc.type])} ${fmtDateShort(d.proc.date)}`;
    sub2 = (
      <>
        <span className={`dot ${dueDot(d)}`} /> {dueState(d, idx.today)}
        {reminded ? ` · ${R.reminded(relDay(reminded, idx.today))}` : ''}
      </>
    );
  } else if (view === 'bday') {
    const b = inf.bday!;
    sub = R.bdaySub(fmtDate(b.date, false), b.age);
    sub2 = `${b.inDays === 0 ? R.today : b.inDays === 1 ? R.tomorrow : R.inDays(b.inDays)}${reminded ? ` · ${R.congratulated}` : ''}`;
    btn = R.congratulate;
  } else {
    sub = R.lastVisit(fmtDate(inf.last!.date, true), lc(zoneName(idx, inf.last!.zone)));
    sub2 = reminded ? R.wrote(relDay(reminded, idx.today)) : null;
  }
  return (
    <div className="row-wrap">
      <button type="button" className="row" onClick={() => navigate(`/client/${c.id}`)}>
        <Avatar c={c} />
        <div className="row-main">
          <div className="row-title">{fullName(c)}</div>
          <div className="row-sub">{sub}</div>
          {sub2 && <div className="row-sub2">{sub2}</div>}
        </div>
      </button>
      <button
        type="button"
        className="btn btn-secondary btn-sm row-act"
        onClick={() => openMessage(c.id, it.kind, it.key)}
      >
        {btn}
      </button>
    </div>
  );
}

function ClientList() {
  const idx = useData((s) => s.idx);
  const { clientView: view, clientSearch, clientSort, set } = useView();
  const q = clientSearch.trim();
  const settings = idx.data.settings;

  if (q) {
    const res = searchClients(idx, q);
    if (!res.length) {
      return (
        <Empty title={ru.common.nothingFound} text={R.notFoundText}>
          <button type="button" className="btn btn-primary" onClick={() => openClientForm({ prefill: q })}>
            <Icon name="plus" /> {R.newCard}
          </button>
        </Empty>
      );
    }
    return (
      <>
        <div className="list-head">
          <span>{R.found(res.length)}</span>
        </div>
        <div className="list">
          {res.map((x) => (
            <ClientRow key={x.c.id} c={x.c} inf={x.inf} view="all" />
          ))}
        </div>
      </>
    );
  }

  if (!idx.data.clients.length) {
    return (
      <Empty title={R.emptyTitle} text={R.emptyText(nextCardNo(idx.data))}>
        <button type="button" className="btn btn-primary" onClick={() => openClientForm({})}>
          <Icon name="plus" /> {R.newCard}
        </button>
      </Empty>
    );
  }

  const items = viewItems(idx, view, clientSort);
  const hint =
    view === 'corr'
      ? R.hint.corr(settings.corrFrom, settings.corrTo)
      : view === 'upd'
        ? R.hint.upd(settings.updFrom, settings.lostAfter)
        : view === 'lost'
          ? R.hint.lost(settings.lostAfter)
          : view === 'all'
            ? ''
            : R.hint[view];

  const pickSort = async () => {
    const v = await actionSheet(
      R.sortTitle,
      (Object.keys(R.sort) as (keyof typeof R.sort)[]).map((value) => ({
        value,
        label: R.sort[value],
        on: clientSort === value,
      })),
    );
    if (v) set({ clientSort: v });
  };

  return (
    <>
      <div className="list-head">
        {view === 'all' ? (
          <>
            <span>{R.count(items.length)}</span>
            <button type="button" className="sort-btn" onClick={pickSort}>
              <Icon name="sort" /> {R.sort[clientSort]}
            </button>
          </>
        ) : (
          <span>{hint}</span>
        )}
      </div>
      {!items.length ? (
        <Empty text={view === 'all' ? '' : R.empty[view]} />
      ) : (
        <div className="list">
          {items.map((x) =>
            view === 'corr' || view === 'upd' || view === 'bday' || view === 'lost' ? (
              <ActionRow key={`${x.c.id}:${x.it?.key}`} x={x} view={view} />
            ) : (
              <ClientRow key={x.c.id} c={x.c} inf={x.inf} view={view} />
            ),
          )}
        </div>
      )}
    </>
  );
}

export function Clients() {
  const idx = useData((s) => s.idx);
  const { clientView, clientSearch, set } = useView();
  const corrItems = viewItems(idx, 'corr');
  const hasLate = corrItems.some(
    (x) => (x.it as CorrItem).state === 'late' && !recentlyReminded(x.c, x.it!.key, idx.today),
  );
  return (
    <div className="screen">
      <header className="topbar">
        <div className="topbar-row">
          <h1 className="display title-lg">{R.title}</h1>
          <div className="topbar-actions">
            <SyncButton />
            <button type="button" className="icon-btn" aria-label={R.lock} onClick={() => useData.getState().lock()}>
              <Icon name="lock" />
            </button>
          </div>
        </div>
        <SearchBox
          value={clientSearch}
          onChange={(v) => set({ clientSearch: v })}
          placeholder={R.search}
          label={R.searchLabel}
        />
        <ScrollChips label={R.viewsLabel}>
          {CLIENT_VIEWS.map((v) => {
            const n = v === 'all' ? 0 : viewItems(idx, v).length;
            const on = !clientSearch.trim() && clientView === v;
            return (
              <button
                type="button"
                key={v}
                role="tab"
                className={`chip ${on ? 'on' : ''}`}
                aria-selected={on}
                onClick={() => {
                  set({ clientView: v, clientSearch: '' });
                  document.querySelector('.scroller')?.scrollTo({ top: 0 });
                }}
              >
                {v === 'corr' && hasLate && <span className="dot dot--alert" aria-hidden="true" />}
                {R.views[v]}
                {n > 0 && <span className="n">{n}</span>}
              </button>
            );
          })}
        </ScrollChips>
      </header>
      <div className="scroller">
        <ClientList />
      </div>
      <Fab label={R.newCard} onClick={() => openClientForm({})} />
    </div>
  );
}
