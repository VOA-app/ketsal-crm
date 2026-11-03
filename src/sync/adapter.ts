// Интерфейс хранилища на стороне облака (SPEC §6.3). Пути — относительно папки приложения: `catalog.enc`,
// `shards/00.enc`. Через адаптер идут только шифротекст и открытый vault.json.

export interface RemoteMeta {
  etag?: string;
  size: number;
  modified: string;
}

export interface StorageAdapter {
  getMeta(path: string): Promise<RemoteMeta | null>;
  read(path: string): Promise<Uint8Array | null>;
  /** Перезаписать файл целиком */
  write(path: string, data: Uint8Array): Promise<void>;
  remove(path: string): Promise<void>;
  list(dir: string): Promise<{ name: string; size: number; modified: string }[]>;
}

/** Нужен повторный вход: токен не принят (401). */
export class AuthError extends Error {
  constructor() {
    super('auth required');
    this.name = 'AuthError';
  }
}

/**
 * Нет сети или сервер не ответил. host и cause — для подробностей в окне синхронизации:
 * какой адрес не ответил и что сказал браузер (без токенов и данных).
 */
export class OfflineError extends Error {
  constructor(
    readonly host = '',
    readonly cause: string = '',
  ) {
    super(host ? `offline ${host}` : 'offline');
    this.name = 'OfflineError';
  }
}

const hostOf = (url: string) => {
  try {
    return new URL(url).host;
  } catch {
    return '';
  }
};

/**
 * Ошибка fetch → OfflineError с адресом сервера. Из текста ошибки убираются адреса:
 * в ссылке скачивания Диска есть номер аккаунта и подпись.
 */
export function offline(url: string, e: unknown): OfflineError {
  const raw = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
  const cause = raw
    .split(' :: ')[0]
    .replace(/https?:\/\/\S+/g, '…')
    .slice(0, 160);
  return new OfflineError(hostOf(url), cause);
}

/** Сервер ответил ошибкой. */
export class RemoteError extends Error {
  constructor(readonly status: number) {
    super(`remote ${status}`);
    this.name = 'RemoteError';
  }
}
