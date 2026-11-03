// Экран входа (SPEC §5.4): быстрый вход (Face ID или код, если включён на этом устройстве),
// мастер-пароль; если пароль забыт — ключ восстановления и новый пароль.
import { useEffect, useState, type FormEvent } from 'react';
import { ru } from '../../i18n/ru';
import { Bird, Logo } from '../components/Brand';
import { Icon } from '../components/Icon';
import { HelpLink } from '../components/kit';
import { PinPad } from '../components/PinPad';
import { quickMode, unlockByFaceId, unlockByPin, type QuickMode } from '../security';
import { useData } from '../store';
import { PasswordFields, passwordReady } from './Onboarding';

const L = ru.lock;

type Mode = 'loading' | 'faceid' | 'pin' | 'password' | 'recovery' | 'newPassword';

export function Lock() {
  const [mode, setMode] = useState<Mode>('loading');
  const [quick, setQuick] = useState<QuickMode>('password');
  const [shakeKey, setShakeKey] = useState(0);
  useEffect(() => {
    let alive = true;
    quickMode()
      .catch(() => 'password' as const)
      .then((m) => {
        if (!alive) return;
        setQuick(m);
        setMode(m);
      });
    return () => {
      alive = false;
    };
  }, []);
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [pass, setPass] = useState<[string, string]>(['', '']);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<'ok' | 'wrong' | 'error'>, wrong: string, onOk?: () => void) => {
    setBusy(true);
    setError('');
    const r = await fn();
    setBusy(false);
    if (r === 'ok') onOk?.();
    else setError(r === 'wrong' ? wrong : L.failed);
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (mode === 'password') {
      if (!password) {
        setError(L.empty);
        return;
      }
      void run(() => useData.getState().unlock(password), L.wrong);
    } else if (mode === 'recovery') {
      void run(
        () => useData.getState().checkRecovery(code),
        L.recoveryWrong,
        () => setMode('newPassword'),
      );
    } else if (passwordReady(pass)) {
      void run(() => useData.getState().resetPassword(code, pass[0]), L.recoveryWrong);
    }
  };

  const switchTo = (m: Mode) => {
    setMode(m);
    setError('');
  };

  const faceId = async () => {
    if (busy) return;
    setBusy(true);
    setError('');
    const r = await unlockByFaceId();
    setBusy(false);
    if (r === 'cancel') setError(L.faceFailed);
    else if (r !== 'ok') setError(L.faceBroken);
  };

  const pinDone = async (pin: string) => {
    setBusy(true);
    setError('');
    const r = await unlockByPin(pin);
    setBusy(false);
    if (r === 'ok') return;
    if (r === 'reset') {
      setQuick('password');
      setMode('password');
      setError(L.pinReset);
    } else if (r === 'error') setError(L.failed);
    else {
      setShakeKey((k) => k + 1);
      setError(L.pinWrong(r.left));
    }
  };

  const toQuick =
    quick === 'password' ? null : (
      <button type="button" className="btn btn-ghost btn-block" onClick={() => switchTo(quick)}>
        {quick === 'faceid' ? L.toFace : L.toPin}
      </button>
    );

  if (mode === 'loading') return <div className="lock show" />;

  if (mode === 'faceid' || mode === 'pin') {
    return (
      <div className="lock show">
        <div className="lock-bird">
          <Bird />
        </div>
        <div className="lock-logo">
          <Logo label="Кетсаль" />
        </div>
        <div className="lock-sub">{mode === 'pin' ? L.pinTitle : L.faceTitle}</div>
        {mode === 'pin' ? (
          <>
            <PinPad onDone={(p) => void pinDone(p)} disabled={busy} shakeKey={shakeKey} />
            <div className="lock-hint mt-8" role="alert">
              {busy ? L.opening : error}
            </div>
          </>
        ) : (
          <div className="lock-pass">
            <div className="lock-hint" role="alert">
              {busy ? L.opening : error}
            </div>
            <button type="button" className="btn btn-primary btn-block" disabled={busy} onClick={() => void faceId()}>
              <Icon name="faceid" /> {L.faceBtn}
            </button>
          </div>
        )}
        <div className="lock-links">
          <button type="button" className="btn-link" onClick={() => switchTo('password')}>
            {L.toMaster}
          </button>
        </div>
        <HelpLink className="lock-help" />
      </div>
    );
  }

  return (
    <div className="lock show">
      <div className="lock-bird">
        <Bird />
      </div>
      <div className="lock-logo">
        <Logo label="Кетсаль" />
      </div>
      <form className="lock-pass" onSubmit={submit}>
        {mode === 'password' && (
          <>
            <div className="lock-sub">{L.enter}</div>
            <input
              className="input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={L.password}
              autoComplete="current-password"
              aria-label={L.password}
              autoFocus
            />
            <div className="lock-hint" role="alert">
              {error}
            </div>
            <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
              {busy ? L.opening : L.unlock}
            </button>
            {toQuick}
            <button type="button" className="btn btn-ghost btn-block" onClick={() => switchTo('recovery')}>
              {L.forgot}
            </button>
          </>
        )}
        {mode === 'recovery' && (
          <>
            <div className="lock-sub">{L.recoveryTitle}</div>
            <p className="hint text-center">{L.recoveryText}</p>
            <textarea
              className="textarea recovery-input"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              aria-label={L.recoveryTitle}
            />
            <div className="lock-hint" role="alert">
              {error}
            </div>
            <button type="submit" className="btn btn-primary btn-block" disabled={busy || !code.trim()}>
              {busy ? L.opening : L.recoveryCheck}
            </button>
            <button type="button" className="btn btn-ghost btn-block" onClick={() => switchTo('password')}>
              {L.toPassword}
            </button>
          </>
        )}
        {mode === 'newPassword' && (
          <>
            <div className="lock-sub">{L.newPassTitle}</div>
            <PasswordFields value={pass} onChange={setPass} />
            <div className="lock-hint" role="alert">
              {error}
            </div>
            <button type="submit" className="btn btn-primary btn-block" disabled={busy || !passwordReady(pass)}>
              {busy ? L.opening : L.newPassSave}
            </button>
          </>
        )}
      </form>
      <HelpLink className="lock-help" />
    </div>
  );
}
