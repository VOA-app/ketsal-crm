// Облако в памяти — для тестов и разработки без Яндекса (SPEC §6.3).
import type { RemoteMeta, StorageAdapter } from './adapter';

export class MockAdapter implements StorageAdapter {
  readonly files = new Map<string, { data: Uint8Array; modified: string }>();
  /** Часы облака: тесты сдвигают их, чтобы проверить уборку старых файлов */
  now: () => number = () => Date.now();
  /** Вызывается перед каждой записью — чтобы в тестах вклиниться «другим устройством». */
  beforeWrite?: (path: string) => Promise<void> | void;

  async getMeta(path: string): Promise<RemoteMeta | null> {
    const f = this.files.get(path);
    return f ? { size: f.data.length, modified: f.modified, etag: f.modified } : null;
  }

  async read(path: string): Promise<Uint8Array | null> {
    const f = this.files.get(path);
    return f ? f.data.slice() : null;
  }

  async write(path: string, data: Uint8Array): Promise<void> {
    await this.beforeWrite?.(path);
    this.files.set(path, { data: data.slice(), modified: new Date(this.now()).toISOString() });
  }

  async remove(path: string): Promise<void> {
    this.files.delete(path);
  }

  async list(dir: string) {
    const prefix = dir ? `${dir.replace(/\/$/, '')}/` : '';
    return Array.from(this.files.entries())
      .filter(([p]) => p.startsWith(prefix) && !p.slice(prefix.length).includes('/'))
      .map(([p, f]) => ({ name: p.slice(prefix.length), size: f.data.length, modified: f.modified }));
  }
}
