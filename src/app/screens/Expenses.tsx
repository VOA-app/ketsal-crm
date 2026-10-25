// Расходники: что купили, сколько стоило, когда. Итоги по категориям — в отчётах.
import { useState } from 'react';
import { addMonths, endOfMonth, isISO, startOfMonth, todayISO } from '../../domain/dates';
import { ulid } from '../../domain/ids';
import { parseMoney, sum } from '../../domain/money';
import type { Entity, Expense } from '../../domain/types';
import { fmtDate, fmtMoney, fmtMonthYear } from '../../i18n/format';
import { ru } from '../../i18n/ru';
import { Icon } from '../components/Icon';
import { Chip, Chips, Empty, Fab, Field, NavBar, scrollToError } from '../components/kit';
import { SheetBody, SheetFoot, SheetHead, useSheet } from '../components/Sheet';
import { useData } from '../store';
import { ui } from '../ui';
import { useView, type ExpPeriod } from '../view';

const E = ru.expenses;
const PERIODS: ExpPeriod[] = ['month', 'prev', 'year', 'all'];

function range(id: ExpPeriod, T: string): [string, string] {
  if (id === 'month') return [startOfMonth(T), endOfMonth(T)];
  if (id === 'prev') {
    const m = addMonths(startOfMonth(T), -1);
    return [m, endOfMonth(m)];
  }
  if (id === 'year') return [`${T.slice(0, 4)}-01-01`, `${T.slice(0, 4)}-12-31`];
  return ['0000-01-01', '9999-12-31'];
}

function ExpenseForm({ id }: { id: string | null }) {
  const data = useData((s) => s.data);
  const src = id ? data.expenses.find((x) => x.id === id) : undefined;
  const sheet = useSheet();
  const [d, setD] = useState<Entity<Expense>>(() =>
    src ? { ...src } : { id: ulid(), createdAt: todayISO(), category: data.lists.expenseCategories[0] || '', name: '', amount: 0, date: todayISO() },
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const up = (patch: Partial<Expense>) => setD((x) => ({ ...x, ...patch }));
  const save = () => {
    const e: Record<string, string> = {};
    if (!(d.amount > 0)) e.amount = E.errAmount;
    if (!isISO(d.date)) e.date = E.errDate;
    setErrors(e);
    if (Object.keys(e).length) {
      scrollToError();
      return;
    }
    useData.getState().apply((tx) => tx.put('expenses', { ...d, name: d.name.trim() }));
    sheet.close();
    ui().toast(src ? ru.common.saved : E.added);
  };
  const del = async () => {
    const ok = await ui().confirm({ title: E.delTitle, text: `${d.name || d.category}, ${fmtMoney(d.amount)}` });
    if (!ok || !src) return;
    useData.getState().apply((tx) => tx.del('expenses', src.id));
    sheet.close();
    ui().toast(E.deleted);
  };
  return (
    <>
      <SheetHead title={src ? E.title1 : E.newTitle} right={ru.common.done} onRight={save} />
      <SheetBody>
        <div className="form-card">
          <Field label={E.what} as="div">
            <Chips>
              {data.lists.expenseCategories.map((c) => (
                <Chip key={c} label={c} on={d.category === c} onClick={() => up({ category: c })} />
              ))}
            </Chips>
          </Field>
          <Field label={E.desc} opt={ru.common.optional}>
            <input className="input" value={d.name} onChange={(e) => up({ name: e.target.value })} placeholder={E.descPlaceholder} autoComplete="off" />
          </Field>
          <div className="grid-2">
            <Field label={E.amount} err={errors.amount}>
              <div className="affix">
                <input className="input" inputMode="numeric" value={d.amount ? String(d.amount) : ''} placeholder="0" autoComplete="off" onChange={(e) => up({ amount: parseMoney(e.target.value) })} />
                <span>₽</span>
              </div>
            </Field>
            <Field label={E.date} err={errors.date}>
              <input className="input" type="date" value={d.date} max={todayISO()} onChange={(e) => up({ date: e.target.value })} />
            </Field>
          </div>
        </div>
        <p className="hint mt-12">{E.catHint}</p>
        {src && (
          <button type="button" className="btn btn-danger btn-block mt-6" onClick={del}>
            {E.del}
          </button>
        )}
      </SheetBody>
      <SheetFoot>
        <button type="button" className="btn btn-primary" onClick={save}>
          {ru.common.save}
        </button>
      </SheetFoot>
    </>
  );
}

const openExpenseForm = (id: string | null) => ui().openSheet(() => <ExpenseForm id={id} />);

export function Expenses() {
  const data = useData((s) => s.data);
  const today = useData((s) => s.idx.today);
  const { expPeriod, set } = useView();
  const [a, b] = range(expPeriod, today);
  const list = data.expenses.filter((e) => e.date >= a && e.date <= b).sort((x, y) => (x.date < y.date ? 1 : x.date > y.date ? -1 : 0));
  const groups: { ym: string; items: Entity<Expense>[] }[] = [];
  for (const e of list) {
    const ym = e.date.slice(0, 7);
    let g = groups[groups.length - 1];
    if (!g || g.ym !== ym) {
      g = { ym, items: [] };
      groups.push(g);
    }
    g.items.push(e);
  }
  return (
    <div className="screen">
      <NavBar title={E.title} backTo="/more" />
      <div className="scroller">
        <Chips className="my-chips">
          {PERIODS.map((p) => (
            <Chip key={p} label={E.periods[p]} on={expPeriod === p} onClick={() => set({ expPeriod: p })} />
          ))}
        </Chips>
        <div className="card card--mint mt-10">
          <div className="row-between baseline">
            <span className="fw-600">{E.count(list.length)}</span>
            <span className="sum-big">{fmtMoney(sum(list, (e) => e.amount))}</span>
          </div>
          <div className="note mt-2">{E.note}</div>
        </div>
        {list.length ? (
          groups.map((g) => (
            <div key={g.ym}>
              <div className="section-title">
                <span>{fmtMonthYear(`${g.ym}-01`)}</span>
                <span className="num">{fmtMoney(sum(g.items, (e) => e.amount))}</span>
              </div>
              <div className="list list--plain">
                {g.items.map((e) => (
                  <button type="button" className="row" key={e.id} onClick={() => openExpenseForm(e.id)}>
                    <div className="row-main">
                      <div className="row-title">{e.name || e.category}</div>
                      <div className="row-sub">{[e.name ? e.category : '', fmtDate(e.date, true)].filter(Boolean).join(' · ')}</div>
                    </div>
                    <div className="row-side">
                      <span className="num fw-600">{fmtMoney(e.amount)}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ))
        ) : (
          <Empty text={E.empty}>
            <button type="button" className="btn btn-primary" onClick={() => openExpenseForm(null)}>
              <Icon name="plus" /> {E.add}
            </button>
          </Empty>
        )}
      </div>
      <Fab label={E.add} onClick={() => openExpenseForm(null)} />
    </div>
  );
}
