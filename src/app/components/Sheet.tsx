// Нижние шторки (как в iOS), меню действий и диалог подтверждения.
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { norm } from '../../domain/text';
import { ru } from '../../i18n/ru';
import { sheetDismiss, ui, useUi, type SheetEntry } from '../ui';
import { Icon, type IconName } from './Icon';

interface SheetCtx {
  id: number;
  close: () => void;
}
const SheetContext = createContext<SheetCtx | null>(null);

/** Текущая шторка: закрыть и задать, что делать при «Отмена» или нажатии на фон. */
export function useSheet(onDismiss?: (close: () => void) => void): SheetCtx & { dismiss: () => void } {
  const ctx = useContext(SheetContext)!;
  useEffect(() => {
    if (!onDismiss) return;
    sheetDismiss.set(ctx.id, () => onDismiss(ctx.close));
    return () => {
      sheetDismiss.delete(ctx.id);
    };
  }, [ctx, onDismiss]);
  return { ...ctx, dismiss: () => dismissSheet(ctx.id) };
}

export function dismissSheet(id: number) {
  const h = sheetDismiss.get(id);
  if (h) h();
  else ui().closeSheet(id);
}

function SheetFrame({ entry }: { entry: SheetEntry }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const r = requestAnimationFrame(() => requestAnimationFrame(() => setOpen(true)));
    return () => cancelAnimationFrame(r);
  }, []);
  const close = () => ui().closeSheet(entry.id);
  return (
    <div className={`sheet-layer ${open && !entry.closing ? 'open' : ''}`}>
      <div className="sheet-backdrop" onClick={() => dismissSheet(entry.id)} />
      <div className={`sheet ${entry.auto ? 'sheet--auto' : ''}`} role="dialog" aria-modal="true">
        <SheetContext.Provider value={{ id: entry.id, close }}>{entry.render(close)}</SheetContext.Provider>
      </div>
    </div>
  );
}

export function SheetHost() {
  const sheets = useUi((s) => s.sheets);
  return (
    <div className="overlays">
      {sheets.map((s) => (
        <SheetFrame key={s.id} entry={s} />
      ))}
      <DialogHost />
    </div>
  );
}

export function SheetHead({
  title,
  left = ru.common.cancel,
  onLeft,
  right,
  onRight,
}: {
  title: string;
  left?: string | null;
  onLeft?: () => void;
  right?: string;
  onRight?: () => void;
}) {
  const ctx = useContext(SheetContext)!;
  return (
    <div className="sheet-head">
      {left ? (
        <button type="button" className="btn btn-ghost" onClick={onLeft ?? (() => dismissSheet(ctx.id))}>
          {left}
        </button>
      ) : (
        <span />
      )}
      <h2>{title}</h2>
      {right ? (
        <button type="button" className="btn btn-ghost btn-strong" onClick={onRight}>
          {right}
        </button>
      ) : (
        <span />
      )}
    </div>
  );
}

// ── Меню действий снизу ──

export interface ActionItem<V> {
  value: V;
  label: string;
  icon?: IconName;
  danger?: boolean;
  on?: boolean;
}

export function actionSheet<V>(title: string, items: ActionItem<V>[]): Promise<V | null> {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v: V | null) => {
      if (done) return;
      done = true;
      resolve(v);
    };
    const id = ui().openSheet(
      (close) => (
        <ActionList
          title={title}
          items={items}
          onPick={(v) => {
            finish(v);
            close();
          }}
          onCancel={() => {
            finish(null);
            close();
          }}
        />
      ),
      { auto: true },
    );
    sheetDismiss.set(id, () => {
      finish(null);
      ui().closeSheet(id);
    });
  });
}

function ActionList<V>({
  title,
  items,
  onPick,
  onCancel,
}: {
  title: string;
  items: ActionItem<V>[];
  onPick: (v: V) => void;
  onCancel: () => void;
}) {
  return (
    <>
      {title && <div className="action-title">{title}</div>}
      <div className="action-list">
        {items.map((it, i) => (
          <button
            type="button"
            key={i}
            className={`${it.danger ? 'danger' : ''} ${it.on ? 'on' : ''}`}
            onClick={() => onPick(it.value)}
          >
            {it.icon && <Icon name={it.icon} />}
            <span>{it.label}</span>
          </button>
        ))}
        <button type="button" className="action-cancel" onClick={onCancel}>
          {ru.common.cancel}
        </button>
      </div>
    </>
  );
}

// ── Диалог подтверждения ──

function DialogHost() {
  const dialog = useUi((s) => s.dialog);
  const [word, setWord] = useState('');
  if (!dialog) return null;
  const answer = (ok: boolean) => {
    useUi.setState({ dialog: null });
    setWord('');
    dialog.resolve(ok);
  };
  const blocked = !!dialog.requireWord && norm(word) !== norm(dialog.requireWord);
  return (
    <div className="dialog-layer">
      <div className="sheet-backdrop" onClick={() => answer(false)} />
      <div className="dialog" role="alertdialog" aria-modal="true" aria-label={dialog.title}>
        <h3>{dialog.title}</h3>
        {dialog.text && <p className="pre-line">{dialog.text}</p>}
        {dialog.requireWord && (
          <input
            className="input"
            autoComplete="off"
            autoFocus
            value={word}
            onChange={(e) => setWord(e.target.value)}
            placeholder={ru.dialog.typeWord(dialog.requireWord)}
          />
        )}
        <div className="dialog-actions">
          <button type="button" className="btn btn-outline" onClick={() => answer(false)}>
            {dialog.cancel ?? ru.common.cancel}
          </button>
          <button
            type="button"
            className={`btn ${dialog.danger === false ? 'btn-primary' : 'btn-danger-solid'}`}
            disabled={blocked}
            onClick={() => answer(true)}
          >
            {dialog.ok ?? ru.common.delete}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Обёртка формы в шторке: шапка, прокручиваемое тело, низ с кнопками. */
export function SheetBody({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`sheet-scroll ${className}`}>{children}</div>;
}

export function SheetFoot({ children }: { children: ReactNode }) {
  return <div className="sheet-foot">{children}</div>;
}
