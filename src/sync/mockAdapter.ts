// Облако в памяти — для тестов и разработки без Яндекса (SPEC §6.3).
import { sha256Hex } from '../crypto/hash';
import { NoSpaceError, UnavailableError, type DiskSpace, type RemoteMeta, type StorageAdapter } from './adapter';

export class MockAdapter implements StorageAdapter {
  readonly files = new Map<string, { data: Uint8Array; modified: string }>();
  /** Часы облака: тесты сдвигают их, чтобы проверить уборку старых файлов */
  now: () => number = () => Date.now();
  /** Файлы, которые «есть, но не скачиваются» — как после аварии в дата-центрах Яндекса */
  readonly unavailable = new Set<string>();
  /** Вызывается перед каждой записью — чтобы в тестах вклиниться «другим устройством». */
  beforeWrite?: (path: string) => Promise<void> | void;
  /** Объём облака в байтах: тесты задают маленький, чтобы проверить «закончилось место». 0 — без ограничений */
  capacity = 0;
  /** Занято чужими файлами (как личные фото мастера на Диске) */
  otherUsed = 0;

  private used(except?: string) {
    let n = this.otherUsed;
    for (const [p, f] of this.files) if (p !== except) n += f.data.length;
    return n;
  }

  async space(): Promise<DiskSpace | null> {
    return this.capacity ? { total: this.capacity, used: this.used(), trash: 0 } : null;
  }

  async getMeta(path: string): Promise<RemoteMeta | null> {
    const f = this.files.get(path);
    return f ? { size: f.data.length, modified: f.modified, etag: f.modified, sha256: await sha256Hex(f.data) } : null;
  }

  async read(path: string): Promise<Uint8Array | null> {
    if (this.unavailable.has(path) && this.files.has(path)) throw new UnavailableError('mock', 'HTTP 500');
    const f = this.files.get(path);
    return f ? f.data.slice() : null;
  }

  async write(path: string, data: Uint8Array): Promise<void> {
    await this.beforeWrite?.(path);
    if (this.capacity && this.used(path) + data.length > this.capacity) throw new NoSpaceError();
    // Новый файл ложится на исправный узел и снова скачивается
    this.unavailable.delete(path);
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
