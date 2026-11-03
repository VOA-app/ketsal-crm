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

/** Ошибка fetch → OfflineError с адресом сервера. */
export function offline(url: string, e: unknown): OfflineError {
  let host = '';
  try {
    host = new URL(url).host;
  } catch {
    // адрес не разобрался — оставим пустым
  }
  return new OfflineError(host, e instanceof Error ? `${e.name}: ${e.message}` : String(e));
}

/** Сервер ответил ошибкой. */
export class RemoteError extends Error {
  constructor(readonly status: number) {
    super(`remote ${status}`);
    this.name = 'RemoteError';
  }
}
