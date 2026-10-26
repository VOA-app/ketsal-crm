// Первый запуск (SPEC §10.3): приветствие → вход через Яндекс → мастер-пароль → ключ восстановления →
// проверка 4 символов → готово. Если на Диске уже есть хранилище — мастер-пароль и первая синхронизация.
// Быстрый вход (Face ID, код) появится на этапе 6.
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { MIN_STRENGTH, passwordStrength } from '../../domain/password';
import { saveFile } from '../share';
import { ru } from '../../i18n/ru';
import { Bird, Logo } from '../components/Brand';
import { Icon } from '../components/Icon';
import { Check, Field } from '../components/kit';
import { DEMO_ENABLED, useData, type RemoteCheck, type StartChoice } from '../store';
import { connectYandex } from '../sync';
import { ui } from '../ui';

const O = ru.onb;

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
  await saveFile(new File([O.keyFileText(grouped)], O.keyFileName, { type: 'text/plain' }));
}

function pickPositions(n: number, max: number): number[] {
  const pos = new Set<number>();
  while (pos.size < n) pos.add(Math.floor(Math.random() * max));
  return Array.from(pos).sort((a, b) => a - b);
}

type Phase = 'welcome' | 'yandex' | 'password' | 'key' | 'verify' | 'done' | 'join';

/** Шаги для полоски прогресса: создание хранилища и подключение второго устройства. */
const CREATE: Phase[] = ['welcome', 'yandex', 'password', 'key', 'verify', 'done'];
const JOIN: Phase[] = ['welcome', 'yandex', 'join'];

export function Onboarding() {
  const [phase, setPhase] = useState<Phase>('welcome');
  const [check, setCheck] = useState<RemoteCheck | 'checking' | 'skipped' | null>(null);
  const [pass, setPass] = useState<[string, string]>(['', '']);
  const [joinPass, setJoinPass] = useState('');
  const [joinError, setJoinError] = useState('');
  const [key, setKey] = useState('');
  const [keyFor, setKeyFor] = useState('');
  const [saved, setSaved] = useState(false);
  const [verify, setVerify] = useState(['', '', '', '']);
  const [busy, setBusy] = useState(false);
  const [legacy, setLegacy] = useState(false);
  const positions = useMemo(() => (key ? pickPositions(4, key.length) : []), [key]);
  const grouped = key.match(/.{1,4}/g) ?? [];

  const runCheck = async () => {
    setCheck('checking');
    const r = await useData.getState().remoteCheck();
    setCheck(r);
    if (r === 'create') setPhase('password');
    else if (r === 'join') setPhase('join');
  };

  useEffect(() => {
    void useData.getState().legacyExists().then(setLegacy);
    // Вернулись от Яндекса (токен уже есть): сразу смотрим, что на Диске
    void useData
      .getState()
      .remoteCheck()
      .then((r) => {
        if (r === 'off') return;
        setCheck(r);
        if (r === 'create') setPhase('password');
        else if (r === 'join') setPhase('join');
        else setPhase('yandex');
      });
  }, []);

  const steps = phase === 'join' ? JOIN : CREATE;
  const stepIdx = steps.indexOf(phase);

  const canNext =
    phase === 'password'
      ? passwordReady(pass) && !busy
      : phase === 'key'
        ? saved
        : phase === 'verify'
          ? positions.every((p, i) => (verify[i] || '').toUpperCase() === key[p])
          : true;

  const next = async () => {
    if (!canNext) return;
    if (phase === 'password' && keyFor !== pass[0]) {
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
    const i = CREATE.indexOf(phase);
    setPhase(CREATE[Math.min(CREATE.length - 1, i + 1)]);
  };

  const back = () => {
    const i = steps.indexOf(phase);
    if (phase === 'password' || phase === 'join') setPhase('yandex');
    else if (i > 0) setPhase(steps[i - 1]);
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

  const join = async (e: FormEvent) => {
    e.preventDefault();
    if (!joinPass || busy) return;
    setBusy(true);
    setJoinError('');
    const r = await useData.getState().joinVault(joinPass);
    setBusy(false);
    if (r === 'wrong') setJoinError(ru.lock.wrong);
    else if (r === 'error') setJoinError(O.joinFailed);
  };

  let body;
  let foot;
  if (phase === 'welcome') {
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
            <Icon name="cloud" />
            <span>{O.welcomeCloud}</span>
          </div>
          <div>
            <Icon name="phone" />
            <span>{O.welcomeHome}</span>
          </div>
        </div>
      </>
    );
    foot = (
      <button type="button" className="btn btn-primary" onClick={() => setPhase('yandex')}>
        {O.start}
      </button>
    );
  } else if (phase === 'yandex') {
    const status =
      check === 'checking'
        ? O.yandexChecking
        : check === 'offline'
          ? O.yandexOffline
          : check === 'auth'
            ? O.yandexAuth
            : check === 'error'
              ? O.yandexError
              : '';
    body = (
      <>
        <h2 className="display">{O.yandexTitle}</h2>
        <p>{O.yandexText}</p>
        <div className="onb-list">
          <div>
            <Icon name="shield" />
            <span>{O.yandexFolder}</span>
          </div>
          <div>
            <Icon name="refresh" />
            <span>{O.yandexSync}</span>
          </div>
        </div>
        {status && <p className="hint">{status}</p>}
      </>
    );
    foot = (
      <>
        {check === 'offline' || check === 'error' ? (
          <button type="button" className="btn btn-primary" onClick={runCheck}>
            {O.retry}
          </button>
        ) : (
          <button
            type="button"
            className="btn btn-primary"
            disabled={check === 'checking'}
            onClick={() => void connectYandex()}
          >
            {O.yandexLogin}
          </button>
        )}
        {DEMO_ENABLED && (
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              setCheck('skipped');
              setPhase('password');
            }}
          >
            {O.yandexSkip}
          </button>
        )}
      </>
    );
  } else if (phase === 'join') {
    body = (
      <>
        <h2 className="display">{O.joinTitle}</h2>
        <p>{O.joinText}</p>
        <form id="join-form" onSubmit={join}>
          <Field label={ru.lock.password} err={joinError || undefined}>
            <input
              className="input"
              type="password"
              value={joinPass}
              autoComplete="current-password"
              onChange={(e) => setJoinPass(e.target.value)}
              autoFocus
            />
          </Field>
        </form>
      </>
    );
    foot = (
      <button type="submit" form="join-form" className="btn btn-primary" disabled={busy || !joinPass}>
        {busy ? O.joining : ru.lock.unlock}
      </button>
    );
  } else if (phase === 'password') {
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
  } else if (phase === 'key') {
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
  } else if (phase === 'verify') {
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
        <button type="button" className="btn-link" onClick={() => setPhase('key')}>
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
        <p>{check === 'skipped' ? O.doneTextLocal : O.doneText}</p>
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
        {stepIdx > 0 && phase !== 'done' ? (
          <button type="button" className="icon-btn" aria-label={O.back} onClick={back}>
            <Icon name="back" />
          </button>
        ) : (
          <span className="spacer-44" />
        )}
        <div className="steps">
          {steps.map((s, i) => (
            <i key={s} className={i <= stepIdx ? 'on' : ''} />
          ))}
        </div>
        <span className="spacer-44" />
      </div>
      <div className="onb-body">{body}</div>
      <div className="onb-foot">{foot}</div>
    </div>
  );
}
