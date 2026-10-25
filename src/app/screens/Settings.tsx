// Настройки: окна напоминаний, тема, шаблоны сообщений, списки вариантов.
// Вход и автоблокировка появятся на этапе 2, синхронизация — на этапе 3.
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { todayISO } from '../../domain/dates';
import { emptyData } from '../../domain/defaults';
import type { Lists, Settings as SettingsT, TemplateId } from '../../domain/types';
import { clearBlobs } from '../../db/repo';
import { TEMPLATE, ru } from '../../i18n/ru';
import { Icon } from '../components/Icon';
import { NavBar, Seg } from '../components/kit';
import { DEMO_ENABLED, useData } from '../store';
import { ui } from '../ui';

const S = ru.settings;
type NumKey = 'corrFrom' | 'corrTo' | 'updFrom' | 'updTo' | 'lostAfter';

function NumSetting({ k }: { k: NumKey }) {
  const settings = useData((s) => s.data.settings);
  const [v, setV] = useState(String(settings[k]));
  const [title, sub] = S[k];
  const commit = () => {
    const n = parseInt(v, 10);
    if (!(n > 0)) {
      setV(String(settings[k]));
      return;
    }
    if (n === settings[k]) return;
    const next = { ...settings, [k]: n };
    if (next.corrTo <= next.corrFrom || next.updTo <= next.updFrom || next.lostAfter <= next.updFrom) {
      ui().toast(S.orderError);
      setV(String(settings[k]));
      return;
    }
    useData.getState().apply((tx) => tx.settings({ [k]: n }));
    ui().toast(ru.common.saved);
  };
  return (
    <label className="settings-num">
      <span>
        <span className="t block">{title}</span>
        <span className="s">{sub}</span>
      </span>
      <input
        className="input"
        type="number"
        inputMode="numeric"
        min={1}
        max={999}
        value={v}
        onChange={(e) => setV(e.target.value)}
        onBlur={commit}
        aria-label={title}
      />
    </label>
  );
}

function TemplateEditor({ id }: { id: TemplateId }) {
  const tpl = useData((s) => s.data.settings.templates[id]);
  const [v, setV] = useState(tpl);
  return (
    <div className="field">
      <span className="field-label">{TEMPLATE[id]}</span>
      <textarea
        className="textarea"
        value={v}
        aria-label={S.templateLabel(TEMPLATE[id])}
        onChange={(e) => setV(e.target.value)}
        onBlur={() => {
          if (v === tpl) return;
          useData.getState().apply((tx) => tx.settings({ templates: { ...tx.data.settings.templates, [id]: v } }));
          ui().toast(S.templateSaved);
        }}
      />
    </div>
  );
}

function ListEditor({ k, label }: { k: keyof Lists; label: string }) {
  const list = useData((s) => s.data.lists[k]);
  const [v, setV] = useState('');
  const add = () => {
    const x = v.trim();
    if (!x) return;
    if (!list.includes(x)) useData.getState().apply((tx) => tx.lists({ [k]: [...list, x] }));
    setV('');
  };
  return (
    <div className="field">
      <span className="field-label">{label}</span>
      <div className="chips">
        {list.map((x, i) => (
          <button
            type="button"
            className="chip"
            key={x}
            aria-label={S.removeOption(x)}
            onClick={() => useData.getState().apply((tx) => tx.lists({ [k]: list.filter((_, j) => j !== i) }))}
          >
            {x} <Icon name="close" className="i-sm" />
          </button>
        ))}
      </div>
      <div className="inline-actions mt-8">
        <input
          className="input"
          value={v}
          onChange={(e) => setV(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') add();
          }}
          placeholder={S.newOption}
          autoComplete="off"
          aria-label={`${label}: ${S.newOption}`}
        />
        <button type="button" className="btn btn-secondary" onClick={add}>
          {ru.common.add}
        </button>
      </div>
    </div>
  );
}

export function Settings() {
  const navigate = useNavigate();
  const theme = useData((s) => s.data.settings.theme);

  const demoReset = async () => {
    const ok = await ui().confirm({ title: S.demoResetTitle, text: S.demoResetText, ok: S.demoResetOk, danger: false });
    if (!ok) return;
    const { buildDemo } = await import('../../dev/demo');
    await clearBlobs();
    await useData.getState().replace(buildDemo(todayISO()));
    navigate('/clients', { replace: true });
    ui().toast(S.demoResetDone);
  };

  const clearAll = async () => {
    const ok = await ui().confirm({ title: S.clearTitle, text: S.clearText, ok: S.clearOk, requireWord: S.clearWord });
    if (!ok) return;
    const cur = useData.getState().data;
    const next = emptyData(todayISO());
    // Справочники, списки и личные настройки остаются
    Object.assign(next, {
      services: cur.services,
      pigments: cur.pigments,
      needles: cur.needles,
      anesthetics: cur.anesthetics,
      zones: cur.zones,
      courses: cur.courses,
      lists: cur.lists,
    });
    const keep: Partial<SettingsT> = {
      templates: cur.settings.templates,
      theme: cur.settings.theme,
      corrFrom: cur.settings.corrFrom,
      corrTo: cur.settings.corrTo,
      updFrom: cur.settings.updFrom,
      updTo: cur.settings.updTo,
      lostAfter: cur.settings.lostAfter,
    };
    next.settings = { ...next.settings, ...keep };
    await clearBlobs();
    await useData.getState().replace(next);
    navigate('/clients', { replace: true });
    ui().toast(S.clearDone);
  };

  return (
    <div className="screen">
      <NavBar title={S.title} backTo="/more" />
      <div className="scroller">
        <div className="section-title">{S.reminders}</div>
        <div className="card card--tight">
          <NumSetting k="corrFrom" />
          <NumSetting k="corrTo" />
          <NumSetting k="updFrom" />
          <NumSetting k="updTo" />
          <NumSetting k="lostAfter" />
        </div>
        <div className="section-title">{S.theme}</div>
        <Seg
          value={theme}
          onChange={(v) => useData.getState().apply((tx) => tx.settings({ theme: v }))}
          options={[
            ['auto', S.themes.auto],
            ['light', S.themes.light],
            ['dark', S.themes.dark],
          ]}
        />
        <div className="section-title">{S.templates}</div>
        <div className="card">
          {(['corr', 'upd', 'bday', 'lost'] as TemplateId[]).map((id) => (
            <TemplateEditor key={id} id={id} />
          ))}
          <p className="hint mt-n4">{S.templatesHint}</p>
        </div>
        <div className="section-title">{S.lists}</div>
        <div className="card">
          <ListEditor k="sources" label={S.listSources} />
          <ListEditor k="tags" label={S.listTags} />
          <ListEditor k="discountReasons" label={S.listReasons} />
          <ListEditor k="expenseCategories" label={S.listExpenses} />
        </div>
        {DEMO_ENABLED && (
          <>
            <div className="section-title">{S.dev}</div>
            <div className="menu">
              <button type="button" className="menu-item" onClick={demoReset}>
                <Icon name="refresh" />
                <span className="t">{S.demoReset}</span>
              </button>
              <button type="button" className="menu-item danger" onClick={clearAll}>
                <Icon name="trash" />
                <span className="t">{S.clear}</span>
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
