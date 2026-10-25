// Отчёты за месяц или год: KPI, выручка по месяцам (диаграмма или таблица), разрезы.
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { addMonths, parseISO, startOfMonth } from '../../domain/dates';
import { monthlySeries, NO_COURSE, prevCursor, reportData, type MonthPoint } from '../../domain/reports';
import { cap } from '../../domain/text';
import { fmtMoney, fmtMoneyShort, fmtMonthYear, NBSP } from '../../i18n/format';
import { MONTHS_AXIS, MONTHS_DAT, MONTHS_NOM, PAYMENT, VISIT_TYPE, ru } from '../../i18n/ru';
import type { Payment, VisitType } from '../../domain/types';
import { Icon } from '../components/Icon';
import { NavBar, Seg } from '../components/kit';
import { courseName, pigmentFull, serviceName, zoneName } from '../names';
import { useData } from '../store';
import { useView } from '../view';

const R = ru.reports;

function niceMax(v: number): number {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  const n = v / p;
  const m = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
  return m * p;
}

const monthName = (s: MonthPoint) => `${cap(MONTHS_NOM[s.month])} ${s.year}`;

function ColumnChart({ series, selYm }: { series: MonthPoint[]; selYm: string | null }) {
  const [tip, setTip] = useState<{ i: number; left: number } | null>(null);
  const card = useRef<HTMLDivElement>(null);
  const tipEl = useRef<HTMLDivElement>(null);
  // Подсказка — над столбцом, но не шире карточки
  useLayoutEffect(() => {
    const el = tipEl.current;
    const box = card.current;
    if (!el || !box || !tip) return;
    const w = el.offsetWidth;
    el.style.left = `${Math.min(Math.max(4, tip.left - w / 2), box.clientWidth - w - 4)}px`;
  }, [tip]);
  const W = 340;
  const H = 176;
  const L = 36;
  const Rp = 4;
  const T = 18;
  const B = 22;
  const top = niceMax(Math.max(...series.map((s) => s.revenue), 1));
  const y = (v: number) => T + (H - T - B) * (1 - v / top);
  const band = (W - L - Rp) / series.length;
  const bw = Math.min(16, band * 0.6);
  const show = (i: number, el: Element) => {
    const r = el.getBoundingClientRect();
    const cr = card.current!.getBoundingClientRect();
    setTip({ i, left: r.left - cr.left + r.width / 2 });
  };
  const s = tip ? series[tip.i] : null;
  return (
    <div className="chart" ref={card}>
      <svg viewBox={`0 0 ${W} ${H}`} aria-label={R.chartLabel}>
        {[0, top / 2, top].map((t) => (
          <g key={t}>
            <line x1={L} x2={W - Rp} y1={y(t)} y2={y(t)} stroke="var(--grid)" strokeWidth={1} />
            <text x={L - 6} y={y(t) + 3.5} textAnchor="end">
              {t ? fmtMoneyShort(t) : '0'}
            </text>
          </g>
        ))}
        {series.map((m, i) => {
          const x = L + band * i + (band - bw) / 2;
          const cx = x + bw / 2;
          const base = y(0);
          const tp = y(m.revenue);
          const h = base - tp;
          const sel = selYm ? m.ym === selYm : true;
          const r = Math.min(4, bw / 2, h);
          return (
            <g key={m.ym}>
              <rect
                className="hit"
                x={L + band * i}
                y={T}
                width={band}
                height={H - T - B}
                tabIndex={0}
                role="img"
                aria-label={`${MONTHS_NOM[m.month]} ${m.year}: ${fmtMoney(m.revenue)}`}
                onPointerEnter={(e) => show(i, e.currentTarget)}
                onPointerDown={(e) => show(i, e.currentTarget)}
                onFocus={(e) => show(i, e.currentTarget)}
                onPointerLeave={() => setTip(null)}
                onBlur={() => setTip(null)}
              />
              {h > 0.5 && (
                <path
                  className={`col ${sel ? 'col--sel' : 'col--muted'}`}
                  d={`M${x} ${base}V${tp + r}Q${x} ${tp} ${x + r} ${tp}H${x + bw - r}Q${x + bw} ${tp} ${x + bw} ${tp + r}V${base}Z`}
                />
              )}
              {selYm && m.ym === selYm && (
                <text className="val" x={cx} y={tp - 6} textAnchor="middle">
                  {fmtMoneyShort(m.revenue)}
                </text>
              )}
              <text x={cx} y={H - 6} textAnchor="middle">
                {MONTHS_AXIS[m.month]}
              </text>
            </g>
          );
        })}
      </svg>
      {tip && s && (
        <div className="chart-tip show" ref={tipEl}>
          <b>{fmtMoney(s.revenue)}</b>
          {monthName(s)} · {R.tipCount(s.count)}
          <br />
          {R.tipExpenses(fmtMoney(s.expenses))}
        </div>
      )}
    </div>
  );
}

function SeriesTable({ series }: { series: MonthPoint[] }) {
  return (
    <table className="chart-table">
      <thead>
        <tr>
          <th>{R.colMonth}</th>
          <th>{R.colCount}</th>
          <th>{R.colRevenue}</th>
          <th>{R.colExpenses}</th>
        </tr>
      </thead>
      <tbody>
        {series
          .slice()
          .reverse()
          .map((s) => (
            <tr key={s.ym}>
              <td>{monthName(s)}</td>
              <td>{s.count}</td>
              <td>{fmtMoney(s.revenue)}</td>
              <td>{fmtMoney(s.expenses)}</td>
            </tr>
          ))}
      </tbody>
    </table>
  );
}

interface Bar {
  label: string;
  value: number;
  text: ReactNode;
}

function HBars({ title, rows, empty = ru.common.noData }: { title: string; rows: Bar[]; empty?: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <>
      <div className="section-title">{title}</div>
      <div className="card">
        {rows.length ? (
          <div className="hbars">
            {rows.map((r, i) => (
              <div className="hbar" key={i}>
                <div className="hbar-top">
                  <span>{r.label}</span>
                  <span className="num">{r.text}</span>
                </div>
                <div className="hbar-track">
                  <div className="hbar-fill" style={{ width: `${((r.value / max) * 100).toFixed(1)}%` }} />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="muted fs-14">{empty}</div>
        )}
      </div>
    </>
  );
}

const money = (v: number, n: number) => (
  <>
    <b>{fmtMoney(v)}</b> · {n}
  </>
);
const count = (n: number, v: number) => (
  <>
    <b>{n}</b> · {fmtMoney(v)}
  </>
);

export function Reports() {
  const idx = useData((s) => s.idx);
  const { reportMode: mode, reportCursor: cur, reportTable, set } = useView();
  const Rd = reportData(idx, mode, cur);
  const prevCur = prevCursor(mode, cur);
  const Pd = reportData(idx, mode, prevCur);
  const T = idx.today;
  const isLast = mode === 'month' ? cur.slice(0, 7) >= T.slice(0, 7) : cur.slice(0, 4) >= T.slice(0, 4);
  const series = mode === 'year' ? monthlySeries(idx, `${cur.slice(0, 4)}-12-01`) : monthlySeries(idx, cur);
  let delta = '';
  if (Pd.revenue > 0) {
    const pct = Math.round(((Rd.revenue - Pd.revenue) / Pd.revenue) * 100);
    const pctText = `${pct > 0 ? '+' : pct < 0 ? '−' : ''}${Math.abs(pct)}${NBSP}%`;
    delta =
      mode === 'month'
        ? R.toPrevMonth(pctText, MONTHS_DAT[parseISO(prevCur).getMonth()])
        : R.toPrevYear(pctText, prevCur.slice(0, 4));
  }
  const certPaid = Rd.byPayment.find((g) => g.key === 'cert');
  const shift = (k: number) =>
    set({ reportCursor: mode === 'month' ? addMonths(startOfMonth(cur), k) : addMonths(cur, 12 * k) });
  return (
    <div className="screen">
      <NavBar title={R.title} backTo="/more" />
      <div className="scroller">
        <Seg
          className="mt-4"
          value={mode}
          onChange={(v) => set({ reportMode: v })}
          options={[
            ['month', R.month],
            ['year', R.year],
          ]}
        />
        <div className="period">
          <button type="button" className="icon-btn" onClick={() => shift(-1)} aria-label={R.prev}>
            <Icon name="chevLeft" />
          </button>
          <div className="period-label">{mode === 'year' ? R.yearLabel(cur.slice(0, 4)) : fmtMonthYear(cur)}</div>
          <button type="button" className="icon-btn" onClick={() => shift(1)} aria-label={R.next} disabled={isLast}>
            <Icon name="chev" />
          </button>
        </div>
        <div className="kpis">
          <div className="kpi kpi--hero">
            <div className="kpi-l">{R.revenue}</div>
            <div className="kpi-v">{fmtMoney(Rd.revenue)}</div>
            <div className="kpi-s">
              {ru.journal.count(Rd.count)}
              {delta}
            </div>
          </div>
          <div className="kpi">
            <div className="kpi-l">{R.expenses}</div>
            <div className="kpi-v">{fmtMoney(Rd.expenses)}</div>
          </div>
          <div className="kpi">
            <div className="kpi-l">{R.net}</div>
            <div className="kpi-v">{fmtMoney(Rd.revenue - Rd.expenses)}</div>
          </div>
          <div className="kpi">
            <div className="kpi-l">{R.avg}</div>
            <div className="kpi-v">{fmtMoney(Rd.avg)}</div>
          </div>
          <div className="kpi">
            <div className="kpi-l">{R.discounts}</div>
            <div className="kpi-v">{fmtMoney(Rd.discounts)}</div>
          </div>
          <div className="kpi">
            <div className="kpi-l">{R.newClients}</div>
            <div className="kpi-v">{Rd.newClients}</div>
          </div>
          <div className="kpi">
            <div className="kpi-l">{R.noshow}</div>
            <div className="kpi-v">{Rd.noshow}</div>
          </div>
          <div className="kpi">
            <div className="kpi-l">{R.certsSold}</div>
            <div className="kpi-v">{Rd.certsSold}</div>
            <div className="kpi-s">{R.certsSoldSum(fmtMoney(Rd.certsSum))}</div>
          </div>
          <div className="kpi">
            <div className="kpi-l">{R.certsPaid}</div>
            <div className="kpi-v">{fmtMoney(certPaid ? certPaid.value : 0)}</div>
          </div>
        </div>
        <div className="section-title">
          {R.byMonth}
          <button type="button" className="btn-link" onClick={() => set({ reportTable: !reportTable })}>
            {reportTable ? R.showChart : R.showTable}
          </button>
        </div>
        <div className="chart-card">
          {reportTable ? (
            <SeriesTable series={series} />
          ) : (
            <ColumnChart series={series} selYm={mode === 'month' ? cur.slice(0, 7) : null} />
          )}
        </div>
        <HBars
          title={R.byExpense}
          rows={Rd.byExpense.map((g) => ({ label: g.key, value: g.value, text: money(g.value, g.count) }))}
          empty={R.noPurchases}
        />
        <HBars
          title={R.byService}
          rows={Rd.byService.map((g) => ({
            label: serviceName(idx, g.key),
            value: g.value,
            text: money(g.value, g.count),
          }))}
        />
        <HBars
          title={R.byZone}
          rows={Rd.byZone.map((g) => ({ label: zoneName(idx, g.key), value: g.count, text: count(g.count, g.value) }))}
        />
        <HBars
          title={R.byType}
          rows={Rd.byType.map((g) => ({
            label: VISIT_TYPE[g.key as VisitType],
            value: g.count,
            text: count(g.count, g.value),
          }))}
        />
        <HBars
          title={R.byPigment}
          rows={Rd.byPigment.slice(0, 8).map((g) => ({
            label: pigmentFull(idx, g.key),
            value: g.count,
            text: (
              <>
                <b>{g.count}</b> {R.procsWord(g.count)}
              </>
            ),
          }))}
        />
        <HBars
          title={R.byReason}
          rows={Rd.byReason.map((g) => ({ label: g.key || R.noReason, value: g.value, text: money(g.value, g.count) }))}
          empty={R.noDiscounts}
        />
        <HBars
          title={R.bySource}
          rows={Rd.bySource.map((g) => ({ label: g.key || R.noSource, value: g.count, text: <b>{g.count}</b> }))}
          empty={R.noNew}
        />
        <HBars
          title={R.byPayment}
          rows={Rd.byPayment.map((g) => ({
            label: PAYMENT[g.key as Payment] || g.key,
            value: g.value,
            text: money(g.value, g.count),
          }))}
        />
        <HBars
          title={R.byCourse}
          rows={Rd.byCourse.map((g) => ({
            label: g.key === NO_COURSE ? ru.proc.courseNone : courseName(idx, g.key),
            value: g.count,
            text: (
              <>
                <b>{R.courseModels(g.count)}</b>
                {R.courseDiscounts(fmtMoney(g.value))}
              </>
            ),
          }))}
          empty={R.noModels}
        />
      </div>
    </div>
  );
}
