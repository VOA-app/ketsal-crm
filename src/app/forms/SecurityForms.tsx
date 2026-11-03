// Вход и безопасность (этап 6): настройка быстрого входа, смена мастер-пароля, «выйти и стереть».
import { useEffect, useState } from 'react';
import { ru } from '../../i18n/ru';
import { Icon } from '../components/Icon';
import { Field } from '../components/kit';
import { PinPad } from '../components/PinPad';
import { SheetBody, SheetFoot, SheetHead, useSheet } from '../components/Sheet';
import { PasswordFields, passwordReady } from '../screens/Onboarding';
import {
  changePassword,
  passkeyAvailable,
  quickCancel,
  quickConfirm,
  quickEnable,
  quickOff,
  wipeDevice,
  wipeInfo,
} from '../security';
import { ui } from '../ui';

const S = ru.security;

/** Слишком простые коды: одна цифра или подряд. */
const weakPin = (p: string) => /^(\d)\1{5}$/.test(p) || '0123456789'.includes(p) || '9876543210'.includes(p);

/** Поле мастер-пароля с проверкой: шаг перед включением быстрого входа. */
function ConfirmStep({ onOk }: { onOk: () => void }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!password || busy) return;
    setBusy(true);
    const r = await quickConfirm(password);
    setBusy(false);
    if (r === 'ok') onOk();
    else setError(r === 'wrong' ? ru.lock.wrong : S.failed);
  };
  return (
    <>
      <SheetBody>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <Field label={S.confirmText} err={error}>
            <input
              className="input"
              type="password"
              autoComplete="current-password"
              value={password}
              autoFocus
              onChange={(e) => {
                setPassword(e.target.value);
                setError('');
              }}
            />
          </Field>
        </form>
      </SheetBody>
      <SheetFoot>
        <button type="button" className="btn btn-primary" disabled={!password || busy} onClick={() => void submit()}>
          {busy ? ru.lock.opening : S.next}
        </button>
      </SheetFoot>
    </>
  );
}

function FaceStep({ onDone }: { onDone: () => void }) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  // Вызов прямо из нажатия: иначе Safari не покажет Face ID
  const enable = async () => {
    setBusy(true);
    setError('');
    const r = await quickEnable('faceid');
    setBusy(false);
    if (r === 'ok') {
      ui().toast(S.enabledFace);
      onDone();
    } else setError({ noPrf: S.noPrf, cancel: S.cancelled, expired: S.expired, error: S.failed }[r]);
  };
  return (
    <>
      <SheetBody>
        <p>{S.faceText}</p>
        {error && (
          <p className="hint" role="alert">
            {error}
          </p>
        )}
      </SheetBody>
      <SheetFoot>
        <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void enable()}>
          <Icon name="faceid" /> {S.faceOn}
        </button>
      </SheetFoot>
    </>
  );
}

function PinStep({ onDone }: { onDone: () => void }) {
  const [first, setFirst] = useState('');
  const [hint, setHint] = useState('');
  const [shakeKey, setShakeKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const done = async (pin: string) => {
    if (!first) {
      if (weakPin(pin)) {
        setHint(S.pinWeak);
        setShakeKey((k) => k + 1);
        return;
      }
      setFirst(pin);
      setHint('');
      return;
    }
    if (pin !== first) {
      setFirst('');
      setHint(S.pinMismatch);
      setShakeKey((k) => k + 1);
      return;
    }
    setBusy(true);
    const r = await quickEnable('pin', pin);
    setBusy(false);
    if (r === 'ok') {
      ui().toast(S.enabledPin);
      onDone();
    } else {
      setFirst('');
      setHint(r === 'expired' ? S.expired : S.failed);
    }
  };
  return (
    <SheetBody>
      <div className="sheet-pin">
        <div className="lock-sub mt-0">{busy ? S.saving : first ? S.pinRepeat : S.pinNew}</div>
        <PinPad onDone={(p) => void done(p)} disabled={busy} shakeKey={shakeKey} />
        <div className="lock-hint mt-8" role="alert">
          {hint || S.quickHintPin}
        </div>
      </div>
    </SheetBody>
  );
}

/** Включить Face ID или код. password — если мастер-пароль только что ввели (онбординг). */
function QuickSetupSheet({ mode, password }: { mode: 'faceid' | 'pin'; password?: string }) {
  const { close } = useSheet((c) => {
    quickCancel();
    c();
  });
  const [confirmed, setConfirmed] = useState(false);
  useEffect(() => {
    if (!password) return;
    let alive = true;
    void quickConfirm(password).then((r) => alive && r === 'ok' && setConfirmed(true));
    return () => {
      alive = false;
    };
  }, [password]);
  const finish = () => close();
  return (
    <>
      <SheetHead title={mode === 'faceid' ? S.setupFace : S.setupPin} />
      {!confirmed ? (
        password ? (
          <SheetBody>
            <p className="hint">{ru.lock.opening}</p>
          </SheetBody>
        ) : (
          <ConfirmStep onOk={() => setConfirmed(true)} />
        )
      ) : mode === 'faceid' ? (
        <FaceStep onDone={finish} />
      ) : (
        <PinStep onDone={finish} />
      )}
    </>
  );
}

export function openQuickSetup(mode: 'faceid' | 'pin', password?: string) {
  ui().openSheet(() => <QuickSetupSheet mode={mode} password={password} />, { auto: true });
}

export async function turnQuickOff() {
  await quickOff();
  ui().toast(S.disabled);
}

/** После онбординга: предложить быстрый вход (пароль только что введён — второй раз не спрашиваем). */
function QuickOfferSheet({ password }: { password: string }) {
  const { close } = useSheet();
  const [face, setFace] = useState(false);
  useEffect(() => {
    void passkeyAvailable().then(setFace);
  }, []);
  const pick = (mode: 'faceid' | 'pin') => {
    close();
    openQuickSetup(mode, password);
  };
  return (
    <>
      <SheetHead title={S.quick} left={S.offerLater} />
      <SheetBody>
        <p>{S.offerText}</p>
        <div className="btn-stack">
          {face && (
            <button type="button" className="btn btn-primary" onClick={() => pick('faceid')}>
              <Icon name="faceid" /> {S.quickModes.faceid}
            </button>
          )}
          <button type="button" className={`btn ${face ? 'btn-outline' : 'btn-primary'}`} onClick={() => pick('pin')}>
            <Icon name="key" /> {S.quickModes.pin}
          </button>
        </div>
        <p className="hint">{S.quickHintPin}</p>
      </SheetBody>
    </>
  );
}

export function offerQuickUnlock(password: string) {
  ui().openSheet(() => <QuickOfferSheet password={password} />, { auto: true });
}

// ── Смена мастер-пароля ──

function ChangePasswordSheet() {
  const { close } = useSheet();
  const [old, setOld] = useState('');
  const [pass, setPass] = useState<[string, string]>(['', '']);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const ready = !!old && passwordReady(pass) && !busy;
  const save = async () => {
    if (!ready) return;
    setBusy(true);
    const r = await changePassword(old, pass[0]);
    setBusy(false);
    if (r === 'ok') {
      close();
      ui().toast(S.changed);
    } else setError(r === 'wrong' ? S.wrongOld : S.failed);
  };
  return (
    <>
      <SheetHead title={S.changePass} />
      <SheetBody>
        <Field label={S.oldPass} err={error}>
          <input
            className="input"
            type="password"
            autoComplete="current-password"
            value={old}
            onChange={(e) => {
              setOld(e.target.value);
              setError('');
            }}
          />
        </Field>
        <PasswordFields value={pass} onChange={setPass} />
        <p className="hint">{S.changeHint}</p>
      </SheetBody>
      <SheetFoot>
        <button type="button" className="btn btn-primary" disabled={!ready} onClick={() => void save()}>
          {busy ? S.saving : S.changeSave}
        </button>
      </SheetFoot>
    </>
  );
}

export function openChangePassword() {
  ui().openSheet(() => <ChangePasswordSheet />);
}

// ── Выйти и стереть ──

export async function wipeFlow() {
  const info = await wipeInfo();
  const parts = [S.wipeSafe];
  if (!info.connected) parts.push(S.wipeLocalOnly);
  else if (info.changes || info.photos) parts.push(S.wipeUnsent(info.changes, info.photos));
  const ok = await ui().confirm({ title: S.wipeTitle, text: parts.join(' '), ok: S.wipeOk, requireWord: S.wipeWord });
  if (ok) await wipeDevice();
}
