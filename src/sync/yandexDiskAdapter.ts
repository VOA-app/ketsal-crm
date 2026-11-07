// Яндекс Диск через REST API (SPEC §6.3). Доступ — только к папке приложения (`app:/`).
// По итогам этапа 0: CORS есть везде, скачивание по ссылке — строго без Referer, иначе 403.
import {
  AuthError,
  hostOf,
  NoSpaceError,
  offline,
  RemoteError,
  UnavailableError,
  type DiskSpace,
  type RemoteMeta,
  type StorageAdapter,
} from './adapter';

/** Insufficient Storage: на Диске нет места под файл */
const NO_SPACE = 507;

const API = 'https://cloud-api.yandex.net/v1/disk';

export class YandexDiskAdapter implements StorageAdapter {
  private madeDirs = new Set<string>();

  constructor(private readonly token: () => Promise<string>) {}

  private async call(path: string, init: RequestInit = {}): Promise<Response> {
    // Токен — до запроса: если его нет или он не читается, это «войти снова», а не «нет сети»
    const token = await this.token();
    let res: Response;
    try {
      res = await fetch(API + path, {
        ...init,
        referrerPolicy: 'no-referrer',
        headers: { Authorization: `OAuth ${token}`, Accept: 'application/json', ...init.headers },
      });
    } catch (e) {
      throw offline(API, e);
    }
    if (res.status === 401) throw new AuthError();
    return res;
  }

  private q = (path: string) => `path=${encodeURIComponent(`app:/${path}`)}`;

  async getMeta(path: string): Promise<RemoteMeta | null> {
    const r = await this.call(`/resources?${this.q(path)}&fields=size,modified,md5,sha256`);
    if (r.status === 404) return null;
    if (!r.ok) throw new RemoteError(r.status);
    const j = (await r.json()) as { size?: number; modified: string; md5?: string; sha256?: string };
    return { size: j.size ?? 0, modified: j.modified, etag: j.md5, sha256: j.sha256 };
  }

  async read(path: string): Promise<Uint8Array | null> {
    const r = await this.call(`/resources/download?${this.q(path)}`);
    if (r.status === 404) return null;
    if (!r.ok) throw new RemoteError(r.status);
    const { href } = (await r.json()) as { href: string };
    const g = await this.download(href);
    if (g.status >= 500) throw new UnavailableError(hostOf(href), `HTTP ${g.status}`);
    if (!g.ok) throw new RemoteError(g.status);
    return new Uint8Array(await g.arrayBuffer());
  }

  /**
   * Скачать по ссылке Диска. На любую ошибку сервер скачивания отвечает без CORS, и браузер видит
   * только «Load failed». Тогда проверяем без CORS, ответил ли сервер: ответил — файл есть, но
   * не отдаётся (UnavailableError, сбой на стороне Яндекса); не ответил — нет связи.
   */
  private async download(href: string): Promise<Response> {
    try {
      return await fetch(href, { referrerPolicy: 'no-referrer' });
    } catch (e) {
      const err = offline(href, e);
      try {
        await fetch(href, { mode: 'no-cors', referrerPolicy: 'no-referrer' });
      } catch {
        throw err;
      }
      throw new UnavailableError(err.host, err.cause);
    }
  }

  private async mkdir(dir: string) {
    if (!dir || this.madeDirs.has(dir)) return;
    const r = await this.call(`/resources?${this.q(dir)}`, { method: 'PUT' });
    // 409 — папка уже есть
    if (!r.ok && r.status !== 409) throw new RemoteError(r.status);
    this.madeDirs.add(dir);
  }

  async write(path: string, data: Uint8Array): Promise<void> {
    const dir = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
    let r = await this.call(`/resources/upload?${this.q(path)}&overwrite=true`);
    if (r.status === 409 && dir) {
      // Папки ещё нет: создаём и пробуем снова
      await this.mkdir(dir);
      r = await this.call(`/resources/upload?${this.q(path)}&overwrite=true`);
    }
    if (r.status === NO_SPACE) throw new NoSpaceError();
    if (!r.ok) throw new RemoteError(r.status);
    const { href, method } = (await r.json()) as { href: string; method?: string };
    let put: Response;
    try {
      put = await fetch(href, {
        method: method || 'PUT',
        body: data.slice().buffer as ArrayBuffer,
        referrerPolicy: 'no-referrer',
      });
    } catch (e) {
      throw offline(href, e);
    }
    if (put.status === NO_SPACE) throw new NoSpaceError();
    if (!put.ok) throw new RemoteError(put.status);
  }

  async space(): Promise<DiskSpace | null> {
    const r = await this.call('?fields=total_space,used_space,trash_size');
    if (!r.ok) throw new RemoteError(r.status);
    const j = (await r.json()) as { total_space?: number; used_space?: number; trash_size?: number };
    if (!j.total_space) return null;
    return { total: j.total_space, used: j.used_space ?? 0, trash: j.trash_size ?? 0 };
  }

  async remove(path: string): Promise<void> {
    const r = await this.call(`/resources?${this.q(path)}&permanently=true`, { method: 'DELETE' });
    if (!r.ok && r.status !== 404) throw new RemoteError(r.status);
  }

  /** Содержимое папки целиком: Диск отдаёт его страницами. */
  async list(dir: string) {
    const PAGE = 1000;
    const out: { name: string; size: number; modified: string }[] = [];
    for (let offset = 0; ; offset += PAGE) {
      const r = await this.call(
        `/resources?${this.q(dir)}&limit=${PAGE}&offset=${offset}` +
          '&fields=_embedded.items.name,_embedded.items.size,_embedded.items.modified',
      );
      if (r.status === 404) return out;
      if (!r.ok) throw new RemoteError(r.status);
      const j = (await r.json()) as { _embedded?: { items: { name: string; size?: number; modified: string }[] } };
      const items = j._embedded?.items ?? [];
      for (const i of items) out.push({ name: i.name, size: i.size ?? 0, modified: i.modified });
      if (items.length < PAGE) return out;
    }
  }
}
