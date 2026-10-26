// Сессия: DEK живёт только в памяти, после блокировки ссылка обнуляется (SPEC §5.4).

export interface Session {
  dek: CryptoKey;
  vaultId: string;
}

let current: Session | null = null;

export const getSession = (): Session | null => current;

export function requireSession(): Session {
  if (!current) throw new Error('locked');
  return current;
}

export function startSession(s: Session) {
  current = s;
}

export function endSession() {
  current = null;
}
