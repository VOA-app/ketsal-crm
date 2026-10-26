// Вход через Яндекс: OAuth 2.0 Authorization Code + PKCE без client secret (SPEC §6.1, итоги этапа 0).
// Переход на oauth.yandex.ru в том же окне; Яндекс возвращает ?code=…&state=… на адрес приложения.
// Права — только папка приложения на Диске.
import { YANDEX_CLIENT_ID } from '../config';
import { pkcePair, randomState } from '../crypto/device';

const PENDING = 'ketsal-oauth-pending';

interface Pending {
  state: string;
  verifier: string;
  /** Куда вернуться в приложении после входа */
  hash: string;
}

export interface Token {
  accessToken: string;
  /** Когда истекает, ISO */
  expiresAt: string;
}

/** Адрес возврата: страница приложения без параметров (так он записан в настройках oauth.yandex.ru). */
export const redirectUri = (): string => location.origin + location.pathname;

/**
 * Начать вход: уходим на страницу Яндекса. Одноразовые state и verifier кладём в sessionStorage
 * и localStorage: в режиме «Домой» на iPhone возврат иногда приходит в новый контекст страницы.
 * Это не данные клиентов, и после возврата они сразу стираются.
 */
export async function startLogin(): Promise<void> {
  const { verifier, challenge } = await pkcePair();
  const p: Pending = { state: randomState(), verifier, hash: location.hash };
  const raw = JSON.stringify(p);
  sessionStorage.setItem(PENDING, raw);
  localStorage.setItem(PENDING, raw);
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: YANDEX_CLIENT_ID,
    redirect_uri: redirectUri(),
    state: p.state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    force_confirm: 'no',
  });
  location.assign(`https://oauth.yandex.ru/authorize?${params}`);
}

export type LoginReturn = { token: Token } | { error: string } | null;

function takePending(): Pending | null {
  const raw = sessionStorage.getItem(PENDING) ?? localStorage.getItem(PENDING);
  sessionStorage.removeItem(PENDING);
  localStorage.removeItem(PENDING);
  try {
    return raw ? (JSON.parse(raw) as Pending) : null;
  } catch {
    return null;
  }
}

/**
 * Вызвать при старте: если вернулись от Яндекса, обменять код на токен и убрать параметры из адреса.
 * null — это был обычный запуск.
 */
export async function completeLogin(): Promise<LoginReturn> {
  const q = new URLSearchParams(location.search);
  const state = q.get('state');
  if (!state) return null;
  const code = q.get('code');
  const error = q.get('error');
  const pending = takePending();
  history.replaceState(null, '', location.pathname + (pending?.hash || ''));
  if (error) return { error };
  if (!pending || pending.state !== state || !code) return { error: 'state_mismatch' };
  let res: Response;
  try {
    res = await fetch('https://oauth.yandex.ru/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        client_id: YANDEX_CLIENT_ID,
        code_verifier: pending.verifier,
      }),
      referrerPolicy: 'no-referrer',
    });
  } catch {
    return { error: 'offline' };
  }
  const data = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error?: string };
  if (!res.ok || !data.access_token) return { error: data.error || `http_${res.status}` };
  return {
    token: {
      accessToken: data.access_token,
      expiresAt: new Date(Date.now() + (data.expires_in ?? 0) * 1000).toISOString(),
    },
  };
}
