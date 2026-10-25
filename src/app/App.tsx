import { useEffect } from 'react';
import { HashRouter, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router';
import { urgentCount } from '../domain/reminders';
import { ru } from '../i18n/ru';
import { Icon, type IconName } from './components/Icon';
import { Empty, ToastHost } from './components/kit';
import { Viewer } from './components/Photo';
import { SheetHost, dismissSheet } from './components/Sheet';
import { PrintCard } from './screens/PrintCard';
import { ClientCard } from './screens/ClientCard';
import { Clients } from './screens/Clients';
import { Certificates } from './screens/Certificates';
import { Expenses } from './screens/Expenses';
import { Journal } from './screens/Journal';
import { More } from './screens/More';
import { ProcedureView } from './screens/ProcedureView';
import { Refs } from './screens/Refs';
import { Reports } from './screens/Reports';
import { Settings } from './screens/Settings';
import { useData } from './store';
import { ui, useUi } from './ui';

const TABS: { id: string; icon: IconName; path: string; match: RegExp }[] = [
  { id: 'clients', icon: 'user', path: '/clients', match: /^\/(clients|client)\b/ },
  { id: 'procedures', icon: 'calendar', path: '/procedures', match: /^\/(procedures|proc)\b/ },
  { id: 'refs', icon: 'book', path: '/refs', match: /^\/refs\b/ },
  { id: 'more', icon: 'dots', path: '/more', match: /^\/more\b/ },
];

function TabBar() {
  const loc = useLocation();
  const navigate = useNavigate();
  const idx = useData((s) => s.idx);
  const badge = urgentCount(idx);
  const cur = TABS.find((t) => t.match.test(loc.pathname))?.id ?? 'clients';
  return (
    <nav className="tabbar" aria-label={ru.tabs.label}>
      {TABS.map((t) => (
        <button
          type="button"
          key={t.id}
          className={`tab ${cur === t.id ? 'on' : ''}`}
          aria-current={cur === t.id ? 'page' : undefined}
          onClick={() => {
            ui().closeAllSheets();
            if (cur === t.id && loc.pathname === t.path) {
              document.querySelector('.scroller')?.scrollTo({ top: 0 });
              return;
            }
            navigate(t.path, { replace: cur !== t.id || loc.pathname !== t.path });
          }}
        >
          <Icon name={t.icon} />
          <span>{ru.tabs[t.id as keyof typeof ru.tabs]}</span>
          {t.id === 'clients' && badge > 0 && (
            <span className="badge" aria-label={ru.badge(badge)}>
              {badge}
            </span>
          )}
        </button>
      ))}
    </nav>
  );
}

function useTheme() {
  const theme = useData((s) => s.data.settings.theme);
  useEffect(() => {
    if (theme === 'auto') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);
}

/** Escape закрывает верхний слой: печать, верхнюю шторку. */
function useEscape() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      const s = useUi.getState();
      if (s.viewer) return;
      if (s.printClientId) {
        s.closePrint();
        return;
      }
      const top = s.sheets.filter((x) => !x.closing).pop();
      if (top) dismissSheet(top.id);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);
}

/** Печать и просмотр фото относятся к экрану, с которого открыты: при переходе закрываются. */
function useCloseOverlaysOnNavigate() {
  const loc = useLocation();
  useEffect(() => {
    const s = useUi.getState();
    if (s.printClientId) s.closePrint();
    if (s.viewer) s.closeViewer();
  }, [loc.pathname]);
}

function Shell() {
  const status = useData((s) => s.status);
  useTheme();
  useEscape();
  useCloseOverlaysOnNavigate();
  useEffect(() => {
    const onVis = () => {
      if (!document.hidden) useData.getState().refreshToday();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);
  if (status === 'loading') return <div className="app" />;
  if (status === 'error') {
    return (
      <div className="app">
        <Empty title={ru.common.loadFailed} />
      </div>
    );
  }
  return (
    <div className="app">
      <div className="screen-host">
        <Routes>
          <Route path="/" element={<Navigate to="/clients" replace />} />
          <Route path="/clients" element={<Clients />} />
          <Route path="/client/:id" element={<ClientCard />} />
          <Route path="/procedures" element={<Journal />} />
          <Route path="/proc/:id" element={<ProcedureView />} />
          <Route path="/refs/:kind?" element={<Refs />} />
          <Route path="/more" element={<More />} />
          <Route path="/more/reports" element={<Reports />} />
          <Route path="/more/expenses" element={<Expenses />} />
          <Route path="/more/certificates" element={<Certificates />} />
          <Route path="/more/settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/clients" replace />} />
        </Routes>
      </div>
      <TabBar />
      <SheetHost />
      <Viewer />
      <ToastHost />
      <PrintCard />
    </div>
  );
}

export function App() {
  useEffect(() => {
    void useData.getState().load();
  }, []);
  return (
    <HashRouter>
      <Shell />
    </HashRouter>
  );
}
