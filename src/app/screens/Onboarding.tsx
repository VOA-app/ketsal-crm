// Первый запуск (SPEC §10.3): приветствие → мастер-пароль → ключ восстановления → проверка 4 символов → готово.
// Подключение Яндекс Диска появится в онбординге на этапе 3, быстрый вход — на этапе 6.
import { useEffect, useMemo, useState } from 'react';
import { MIN_STRENGTH, passwordStrength } from '../../domain/password';
import { ru } from '../../i18n/ru';
import { Bird, Logo } from '../components/Brand';
import { Icon } from '../components/Icon';
import { Check, Field } from '../components/kit';
import { DEMO_ENABLED, useData, type StartChoice } from '../store';
import { ui } from '../ui';

const O = ru.onb;
const STEPS = 5;

/** Пароль, повтор и индикатор надёжности — общий для онбординга и сброса пароля. */
export function PasswordFields({
  value,
  onChange,
}: {
  value: [string, string];
  onChange: (v: [string, string]) => void;
}) {
  const [p1, p2] = value;
  const st = passwordStrength(p1);
  const label = !p1 ? O.passHint : st < MIN_STRENGTH ? O.passWeak : st < 4 ? O.passOk : O.passStrong;
  return (
    <>
      <Field label={O.pass}>
        <input
          className="input"
          type="password"
          value={p1}
          autoComplete="new-password"
          onChange={(e) => onChange([e.target.value, p2])}
        />
      </Field>
      <div className="strength">
        <i style={{ width: `${(Math.min(st, 5) / 5) * 100}%` }} />
      </div>
      <p className="hint mt-0">{label}</p>
      <Field label={O.pass2} err={p2 && p1 !== p2 ? O.passMismatch : undefined}>
        <input
          className="input"
          type="password"
          value={p2}
          autoComplete="new-password"
          onChange={(e) => onChange([p1, e.target.value])}
        />
      </Field>
    </>
  );
}

export const passwordReady = ([p1, p2]: [string, string]) => passwordStrength(p1) >= MIN_STRENGTH && p1 === p2;

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    ui().toast(O.keyCopied);
  } catch {
    ui().toast(O.keyCopyFailed);
  }
}

/** Сохранить ключ файлом: на iPhone — через «Поделиться» (Файлы, Телеграм), на ПК — загрузкой. */
async function saveKeyFile(grouped: string) {
  const file = new File([O.keyFileText(grouped)], O.keyFileName, { type: 'text/plain' });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return;
    } catch {
      // отменили — ничего страшного
      return;
    }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = O.keyFileName;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
    a.remove();
  }, 1000);
}

function pickPositions(n: number, max: number): number[] {
  const pos = new Set<number>();
  while (pos.size < n) pos.add(Math.floor(Math.random() * max));
  return Array.from(pos).sort((a, b) => a - b);
}

export function Onboarding() {
  const [step, setStep] = useState(0);
  const [pass, setPass] = useState<[string, string]>(['', '']);
  const [key, setKey] = useState('');
  const [keyFor, setKeyFor] = useState('');
  const [saved, setSaved] = useState(false);
  const [verify, setVerify] = useState(['', '', '', '']);
  const [busy, setBusy] = useState(false);
  const [legacy, setLegacy] = useState(false);
  const positions = useMemo(() => (key ? pickPositions(4, key.length) : []), [key]);
  const grouped = key.match(/.{1,4}/g) ?? [];

  useEffect(() => {
    void useData.getState().legacyExists().then(setLegacy);
  }, []);

  const canNext =
    step === 1
      ? passwordReady(pass) && !busy
      : step === 2
        ? saved
        : step === 3
          ? positions.every((p, i) => (verify[i] || '').toUpperCase() === key[p])
          : true;

  const next = async () => {
    if (!canNext) return;
    if (step === 1 && keyFor !== pass[0]) {
      // Ключи создаются заново, только если пароль поменяли
      setBusy(true);
      try {
        setKey(await useData.getState().prepareVault(pass[0]));
        setKeyFor(pass[0]);
        setSaved(false);
        setVerify(['', '', '', '']);
      } catch {
        ui().toast(O.failed);
        setBusy(false);
        return;
      }
      setBusy(false);
    }
    setStep((s) => Math.min(STEPS - 1, s + 1));
  };

  const finish = async (choice: StartChoice) => {
    setBusy(true);
    try {
      await useData.getState().finishVault(choice);
    } catch {
      setBusy(false);
      ui().toast(O.failed);
    }
  };

  let body;
  let foot;
  if (step === 0) {
    body = (
      <>
        <div className="onb-logo">
          <Logo label="Кетсаль" />
        </div>
        <h2 className="display">{O.welcomeTitle}</h2>
        <p>{O.welcomeText}</p>
        <div className="onb-list">
          <div>
            <Icon name="lock" />
            <span>{O.welcomeEncrypted}</span>
          </div>
          <div>
            <Icon name="shield" />
            <span>{O.welcomeOffline}</span>
          </div>
          <div>
            <Icon name="phone" />
            <span>{O.welcomeHome}</span>
          </div>
        </div>
      </>
    );
    foot = (
      <button type="button" className="btn btn-primary" onClick={next}>
        {O.start}
      </button>
    );
  } else if (step === 1) {
    body = (
      <>
        <h2 className="display">{O.passTitle}</h2>
        <p>{O.passText}</p>
        <PasswordFields value={pass} onChange={setPass} />
      </>
    );
    foot = (
      <button type="button" className="btn btn-primary" disabled={!canNext} onClick={next}>
        {busy ? O.creating : O.next}
      </button>
    );
  } else if (step === 2) {
    body = (
      <>
        <h2 className="display">{O.keyTitle}</h2>
        <p>{O.keyText}</p>
        <div className="recovery" aria-label={O.keyLabel}>
          {grouped.map((g, i) => (
            <span key={i}>{g}</span>
          ))}
        </div>
        <div className="btn-row mb-14">
          <button type="button" className="btn btn-outline" onClick={() => copy(grouped.join('-'))}>
            <Icon name="copy" /> {O.keyCopy}
          </button>
          <button type="button" className="btn btn-outline" onClick={() => saveKeyFile(grouped.join('-'))}>
            <Icon name="download" /> {O.keySave}
          </button>
        </div>
        <Check checked={saved} onChange={setSaved} className="check--plain">
          {O.keySaved}
        </Check>
      </>
    );
    foot = (
      <button type="button" className="btn btn-primary" disabled={!canNext} onClick={next}>
        {O.next}
      </button>
    );
  } else if (step === 3) {
    body = (
      <>
        <h2 className="display">{O.verifyTitle}</h2>
        <p>{O.verifyText}</p>
        <div className="verify">
          {positions.map((p, i) => (
            <label key={p}>
              {O.verifyNo(p + 1)}
              <input
                className="input"
                maxLength={1}
                value={verify[i]}
                autoComplete="off"
                autoCapitalize="characters"
                onChange={(e) => setVerify(verify.map((x, j) => (j === i ? e.target.value.trim() : x)))}
              />
            </label>
          ))}
        </div>
        <button type="button" className="btn-link" onClick={() => setStep(2)}>
          {O.verifyAgain}
        </button>
      </>
    );
    foot = (
      <button type="button" className="btn btn-primary" disabled={!canNext} onClick={next}>
        {O.next}
      </button>
    );
  } else {
    body = (
      <>
        <div className="onb-logo">
          <Logo label="Кетсаль" />
        </div>
        <h2 className="display">{O.doneTitle}</h2>
        <p>{O.doneText}</p>
        {legacy ? <p>{O.doneLegacy}</p> : DEMO_ENABLED && <p>{O.doneDemo}</p>}
      </>
    );
    foot =
      !legacy && DEMO_ENABLED ? (
        <>
          <button type="button" className="btn btn-primary" disabled={busy} onClick={() => finish('demo')}>
            {busy ? O.finishing : O.finishDemo}
          </button>
          <button type="button" className="btn btn-outline" disabled={busy} onClick={() => finish('empty')}>
            {O.finishEmpty}
          </button>
        </>
      ) : (
        <button type="button" className="btn btn-primary" disabled={busy} onClick={() => finish('empty')}>
          {busy ? O.finishing : O.finish}
        </button>
      );
  }

  return (
    <div className="onb show">
      <div className="lock-bird onb-bird">
        <Bird />
      </div>
      <div className="onb-top">
        {step > 0 && step < STEPS - 1 ? (
          <button type="button" className="icon-btn" aria-label={O.back} onClick={() => setStep(step - 1)}>
            <Icon name="back" />
          </button>
        ) : (
          <span className="spacer-44" />
        )}
        <div className="steps">
          {Array.from({ length: STEPS }, (_, i) => (
            <i key={i} className={i <= step ? 'on' : ''} />
          ))}
        </div>
        <span className="spacer-44" />
      </div>
      <div className="onb-body">{body}</div>
      <div className="onb-foot">{foot}</div>
    </div>
  );
}
