// «Ещё»: отчёты, расходники, сертификаты, настройки.
import { useNavigate } from 'react-router';
import { certStatus } from '../../domain/certificates';
import { sum } from '../../domain/money';
import { fmtMoney } from '../../i18n/format';
import { ru } from '../../i18n/ru';
import { Icon, type IconName } from '../components/Icon';
import { useData } from '../store';

const M = ru.more;

function MenuItem({ icon, title, sub, to }: { icon: IconName; title: string; sub?: string; to: string }) {
  const navigate = useNavigate();
  return (
    <button type="button" className="menu-item" onClick={() => navigate(to)}>
      <Icon name={icon} />
      <span className="t">
        {title}
        {sub && <span className="s block">{sub}</span>}
      </span>
      <Icon name="chev" className="row-chev" />
    </button>
  );
}

export function More() {
  const data = useData((s) => s.data);
  const today = useData((s) => s.idx.today);
  const active = data.certificates.filter((x) => certStatus(x, today) === 'active').length;
  const month = sum(
    data.expenses.filter((e) => e.date.slice(0, 7) === today.slice(0, 7)),
    (e) => e.amount,
  );
  return (
    <div className="screen">
      <header className="topbar">
        <div className="topbar-row">
          <h1 className="display title-lg">{M.title}</h1>
        </div>
      </header>
      <div className="scroller">
        <div className="sync-card">
          <Icon name="cloud" />
          <div className="grow">
            <div className="t">{ru.sync.local}</div>
            <div className="s">{ru.sync.later}</div>
          </div>
        </div>
        <div className="menu">
          <MenuItem icon="chart" title={M.reports} sub={M.reportsSub} to="/more/reports" />
          <MenuItem icon="box" title={M.expenses} sub={M.expensesSub(fmtMoney(month))} to="/more/expenses" />
          <MenuItem icon="gift" title={M.certs} sub={M.certsSub(active)} to="/more/certificates" />
          <MenuItem icon="sliders" title={M.settings} sub={M.settingsSub} to="/more/settings" />
        </div>
        <div className="menu">
          <button type="button" className="menu-item" onClick={() => useData.getState().lock()}>
            <Icon name="lock" />
            <span className="t">{ru.lock.lockNow}</span>
          </button>
        </div>
        <div className="about">{M.about(`${__APP_VERSION__}${__APP_COMMIT__ ? ` · ${__APP_COMMIT__}` : ''}`)}</div>
      </div>
    </div>
  );
}
