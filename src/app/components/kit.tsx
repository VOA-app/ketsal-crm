// Общие элементы интерфейса: чипы, сегменты, поля, выпадающие списки, строки «ключ — значение».
import { useEffect, useRef, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { ru } from '../../i18n/ru';
import { useUi } from '../ui';
import { Icon, type IconName } from './Icon';

export function Chip({
  label,
  on = false,
  onClick,
  children,
  className = '',
  disabled,
  ariaLabel,
}: {
  label?: ReactNode;
  on?: boolean;
  onClick?: () => void;
  children?: ReactNode;
  className?: string;
  disabled?: boolean;
  ariaLabel?: string;
}) {
  return (
    <button
      type="button"
      className={`chip ${on ? 'on' : ''} ${className}`}
      aria-pressed={on}
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
    >
      {children}
      {label}
    </button>
  );
}

export function Chips({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`chips ${className}`}>{children}</div>;
}

/** Горизонтальная лента чипов; выбранный чип прокручивается в зону видимости. */
export function ScrollChips({ children, label }: { children: ReactNode; label?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const strip = ref.current;
    const on = strip?.querySelector<HTMLElement>('.on');
    if (strip && on) strip.scrollLeft = Math.max(0, on.offsetLeft - (strip.clientWidth - on.offsetWidth) / 2);
  });
  return (
    <div className="chips chips--scroll" role="tablist" aria-label={label} ref={ref}>
      {children}
    </div>
  );
}

export function Seg<V extends string>({
  options,
  value,
  onChange,
  className = '',
  ariaLabel,
}: {
  options: [V, string][];
  value: V;
  onChange: (v: V) => void;
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <div className={`seg ${className}`} role="tablist" aria-label={ariaLabel}>
      {options.map(([v, l]) => (
        <button type="button" key={v} role="tab" className={v === value ? 'on' : ''} aria-selected={v === value} onClick={() => onChange(v)}>
          {l}
        </button>
      ))}
    </div>
  );
}

export function FieldError({ text }: { text?: string }) {
  if (!text) return null;
  return (
    <div className="field-err">
      <span className="dot dot--alert" />
      {text}
    </div>
  );
}

/** Поле формы с подписью; err подсвечивает поле и показывает текст ошибки. */
export function Field({
  label,
  opt,
  err,
  children,
  as = 'label',
  className = '',
}: {
  label: ReactNode;
  opt?: string;
  err?: string;
  children: ReactNode;
  as?: 'label' | 'div';
  className?: string;
}) {
  const Tag = as;
  return (
    <Tag className={`field ${err ? 'err' : ''} ${className}`} data-err={err ? '1' : undefined}>
      <span className="field-label">
        <span>{label}</span>
        {opt && <span className="opt">{opt}</span>}
      </span>
      {children}
      <FieldError text={err} />
    </Tag>
  );
}

export interface SelectOption {
  value: string;
  label: string;
}
export interface SelectGroup {
  group: string;
  items: SelectOption[];
}

export function Select({
  value,
  options,
  onChange,
  placeholder,
  ariaLabel,
}: {
  value: string;
  options: (SelectOption | SelectGroup)[];
  onChange: (v: string) => void;
  placeholder?: string;
  ariaLabel?: string;
}) {
  return (
    <div className="select-wrap">
      <select className="select" value={value} onChange={(e) => onChange(e.target.value)} aria-label={ariaLabel}>
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((o, i) =>
          'group' in o ? (
            <optgroup key={i} label={o.group}>
              {o.items.map((it) => (
                <option key={it.value} value={it.value}>
                  {it.label}
                </option>
              ))}
            </optgroup>
          ) : (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ),
        )}
      </select>
    </div>
  );
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return <input type="checkbox" className="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} aria-label={label} />;
}

export function SwitchRow({ title, sub, checked, onChange }: { title: string; sub?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="switch-row">
      <div>
        <div className="t">{title}</div>
        {sub && <div className="s">{sub}</div>}
      </div>
      <Switch checked={checked} onChange={onChange} label={title} />
    </div>
  );
}

export function Check({ checked, onChange, children, className = '' }: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode; className?: string }) {
  return (
    <label className={`check ${className}`}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{children}</span>
    </label>
  );
}

export function Kv({ k, children, className = '' }: { k: string; children: ReactNode; className?: string }) {
  return (
    <div className={`kv ${className}`}>
      <span className="k">{k}</span>
      <span className="v">{children}</span>
    </div>
  );
}

export function Swatch({ hex, size }: { hex?: string; size?: number }) {
  return <span className="swatch" style={{ background: hex || 'transparent', ...(size ? { width: size, height: size } : null) }} />;
}

export function Empty({ title, text, children }: { title?: string; text?: string; children?: ReactNode }) {
  return (
    <div className="empty">
      {title && <div className="display">{title}</div>}
      {text && <p>{text}</p>}
      {children}
    </div>
  );
}

export function Fab({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" className="fab" aria-label={label} onClick={onClick}>
      <Icon name="plus" />
    </button>
  );
}

/** Шапка вложенного экрана: «Назад», заголовок, действие справа. */
export function NavBar({ title, right, backTo }: { title: string; right?: ReactNode; backTo?: string }) {
  const navigate = useNavigate();
  const back = () => {
    if (window.history.state?.idx > 0) navigate(-1);
    else navigate(backTo ?? '/clients', { replace: true });
  };
  return (
    <header className="topbar topbar--nav">
      <div className="nav-row">
        <button type="button" className="back-btn" onClick={back}>
          <Icon name="back" />
          <span>{ru.common.back}</span>
        </button>
        <div className="nav-title">{title}</div>
        <div>{right}</div>
      </div>
    </header>
  );
}

export function SearchBox({
  value,
  onChange,
  placeholder,
  label,
  autoFocus,
  className = '',
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  label: string;
  autoFocus?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <label className={`search ${className}`}>
      <Icon name="search" className="i-sm" />
      <input
        ref={ref}
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete="off"
        enterKeyHint="search"
        aria-label={label}
        autoFocus={autoFocus}
      />
      <button
        type="button"
        className="search-clear"
        aria-label={ru.common.clearSearch}
        onClick={() => {
          onChange('');
          ref.current?.focus();
        }}
      >
        <Icon name="close" className="i-sm" />
      </button>
    </label>
  );
}

export function Notice({ icon, text, btn, onClick }: { icon: IconName; text: string; btn: string; onClick: () => void }) {
  return (
    <div className="notice">
      <Icon name={icon} className="i-sm" />
      <span>{text}</span>
      <button type="button" className="btn btn-sm btn-secondary" onClick={onClick}>
        {btn}
      </button>
    </div>
  );
}

/** Уведомление внизу экрана. */
export function ToastHost() {
  const t = useUi((s) => s.toastState);
  const hide = useUi((s) => s.hideToast);
  useEffect(() => {
    if (!t) return;
    const timer = setTimeout(hide, t.ms);
    return () => clearTimeout(timer);
  }, [t, hide]);
  return (
    <div className={`toast ${t ? 'show' : ''}`} role="status" aria-live="polite">
      {t && (
        <>
          <span>{t.msg}</span>
          {t.action && (
            <button
              type="button"
              onClick={() => {
                hide();
                t.onAction?.();
              }}
            >
              {t.action}
            </button>
          )}
        </>
      )}
    </div>
  );
}

/** Прокрутить к первому полю с ошибкой. */
export function scrollToError(root: ParentNode = document) {
  setTimeout(() => {
    root.querySelector('[data-err]')?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, 30);
}
