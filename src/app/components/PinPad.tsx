// Ввод кода из 6 цифр: точки и клавиатура, как в прототипе. Работает и с клавиатурой компьютера.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ru } from '../../i18n/ru';
import { Icon } from './Icon';

const L = ru.lock;
const DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

export function PinPad({
  onDone,
  left,
  disabled = false,
  shakeKey = 0,
}: {
  /** Набрано 6 цифр; поле очищается само */
  onDone: (pin: string) => void;
  /** Кнопка слева от нуля (Face ID) */
  left?: ReactNode;
  disabled?: boolean;
  /** Меняется при неверном коде — точки вздрагивают */
  shakeKey?: number;
}) {
  const [pin, setPin] = useState('');
  // Набранное — ещё и в ref: быстрые нажатия подряд видят актуальное значение до перерисовки
  const typed = useRef('');

  const press = (d: string) => {
    if (disabled || typed.current.length >= 6) return;
    const next = typed.current + d;
    typed.current = next;
    setPin(next);
    if (next.length === 6) {
      // Пауза, чтобы шестая точка успела закраситься
      setTimeout(() => {
        typed.current = '';
        setPin('');
        onDone(next);
      }, 120);
    }
  };
  const del = () => {
    typed.current = typed.current.slice(0, -1);
    setPin(typed.current);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (/^\d$/.test(e.key)) press(e.key);
      else if (e.key === 'Backspace') del();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });

  return (
    <>
      {/* Новый key — элемент создаётся заново и анимация «вздрагивания» проигрывается ещё раз */}
      <div
        key={shakeKey}
        className={`pin-dots ${shakeKey ? 'shake' : ''}`}
        role="status"
        aria-live="polite"
        aria-label={L.pinDots(pin.length)}
      >
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <i key={i} className={i < pin.length ? 'on' : ''} />
        ))}
      </div>
      <div className="keypad">
        {DIGITS.map((d) => (
          <button type="button" key={d} className="key" onClick={() => press(d)} disabled={disabled}>
            {d}
          </button>
        ))}
        {left ?? <span />}
        <button type="button" className="key" onClick={() => press('0')} disabled={disabled}>
          0
        </button>
        <button type="button" className="key key--flat" onClick={del} aria-label={L.pinDel} disabled={disabled}>
          <Icon name="backspace" />
        </button>
      </div>
    </>
  );
}
