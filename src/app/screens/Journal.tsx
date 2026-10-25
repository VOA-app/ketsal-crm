// Журнал процедур по дням с итогом периода и поиском по клиенту, услуге, пигменту, партии.
import { addDays, addMonths, endOfMonth, startOfMonth } from '../../domain/dates';
import { byDateDesc } from '../../domain/indexing';
import { sum } from '../../domain/money';
import { norm } from '../../domain/text';
import type { Entity, Procedure } from '../../domain/types';
import { dayHeader, fmtMoney } from '../../i18n/format';
import { ru } from '../../i18n/ru';
import { ProcItem } from '../components/ClientBits';
import { Icon } from '../components/Icon';
import { Chip, Empty, Fab, ScrollChips, SearchBox } from '../components/kit';
import { openProcForm } from '../forms/ProcForm';
import { openClientPicker } from '../forms/SmallForms';
import { pigmentFull, procDiscount, procTotal, serviceName, zoneName } from '../names';
import { useData } from '../store';
import { useView, type ProcPeriod } from '../view';

const J = ru.journal;
const PERIODS: ProcPeriod[] = ['today', 'week', 'month', 'prev', 'all'];

export function periodRange(id: ProcPeriod, T: string): [string, string] {
  if (id === 'today') return [T, T];
  if (id === 'week') return [addDays(T, -6), T];
  if (id === 'month') return [startOfMonth(T), endOfMonth(T)];
  if (id === 'prev') {
    const m = addMonths(startOfMonth(T), -1);
    return [m, endOfMonth(m)];
  }
  return ['0000-01-01', '9999-12-31'];
}

const newProc = () => openClientPicker((clientId) => openProcForm({ clientId }));

export function Journal() {
  const idx = useData((s) => s.idx);
  const { procPeriod, procSearch, set } = useView();
  const [a, b] = periodRange(procPeriod, idx.today);
  const words = norm(procSearch).split(/\s+/).filter(Boolean);
  let list = idx.data.procedures.filter((p) => p.date >= a && p.date <= b);
  if (words.length) {
    list = list.filter((p) => {
      const c = idx.client.get(p.clientId);
      const hay = norm(
        `${c ? `${c.firstName} ${c.lastName}` : ''} ${serviceName(idx, p.serviceId)} ${zoneName(idx, p.zone)} ${p.technique} ${p.pigments
          .map((g) => `${pigmentFull(idx, g.pigmentId)} ${g.lot}`)
          .join(' ')} ${p.note}`,
      );
      return words.every((w) => hay.includes(w));
    });
  }
  list = list.slice().sort(byDateDesc);
  const done = list.filter((p) => p.status === 'done');
  const missed = list.length - done.length;
  const groups: { date: string; items: Entity<Procedure>[] }[] = [];
  for (const p of list) {
    let g = groups[groups.length - 1];
    if (!g || g.date !== p.date) {
      g = { date: p.date, items: [] };
      groups.push(g);
    }
    g.items.push(p);
  }
  return (
    <div className="screen">
      <header className="topbar">
        <div className="topbar-row">
          <h1 className="display title-lg">{J.title}</h1>
        </div>
        <SearchBox value={procSearch} onChange={(v) => set({ procSearch: v })} placeholder={J.search} label={J.searchLabel} />
        <ScrollChips label={J.period}>
          {PERIODS.map((p) => (
            <Chip
              key={p}
              label={J.periods[p]}
              on={procPeriod === p}
              onClick={() => {
                set({ procPeriod: p });
                document.querySelector('.scroller')?.scrollTo({ top: 0 });
              }}
            />
          ))}
        </ScrollChips>
      </header>
      <div className="scroller">
        <div className="card card--mint my-summary">
          <div className="row-between baseline">
            <span className="fw-600">{J.count(done.length)}</span>
            <span className="sum-big">{fmtMoney(sum(done, procTotal))}</span>
          </div>
          <div className="note mt-2">
            {J.discounts(fmtMoney(sum(done, procDiscount)))}
            {missed ? J.missed(missed) : ''}
          </div>
        </div>
        {!list.length ? (
          <Empty text={words.length ? J.nothing : procPeriod === 'today' ? J.noneToday : J.noneInPeriod}>
            <button type="button" className="btn btn-primary" onClick={newProc}>
              <Icon name="plus" /> {J.newProc}
            </button>
          </Empty>
        ) : (
          groups.map((g) => (
            <div key={g.date}>
              <div className="section-title">
                <span>{dayHeader(g.date, idx.today)}</span>
                <span className="num">{fmtMoney(sum(g.items.filter((p) => p.status === 'done'), procTotal))}</span>
              </div>
              <div className="list">
                {g.items.map((p) => (
                  <ProcItem key={p.id} p={p} withClient />
                ))}
              </div>
            </div>
          ))
        )}
      </div>
      <Fab label={J.newProc} onClick={newProc} />
    </div>
  );
}
