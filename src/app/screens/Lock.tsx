// Экран входа (SPEC §5.4): мастер-пароль; если забыт — ключ восстановления и новый пароль.
// Быстрый вход (Face ID, код) появится на этапе 6.
import { useState, type FormEvent } from 'react';
import { ru } from '../../i18n/ru';
import { Bird, Logo } from '../components/Brand';
import { useData } from '../store';
import { PasswordFields, passwordReady } from './Onboarding';

const L = ru.lock;

type Mode = 'password' | 'recovery' | 'newPassword';

export function Lock() {
  const [mode, setMode] = useState<Mode>('password');
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
    </div>
  );
}
