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

/** Нет сети или сервер не ответил. */
export class OfflineError extends Error {
  constructor(message = 'offline') {
    super(message);
    this.name = 'OfflineError';
  }
}

/** Сервер ответил ошибкой. */
export class RemoteError extends Error {
  constructor(readonly status: number) {
    super(`remote ${status}`);
    this.name = 'RemoteError';
  }
}
