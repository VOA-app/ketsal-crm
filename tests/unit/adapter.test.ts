// Ошибки сети для окна синхронизации: адрес сервера без ссылки и номера аккаунта.
import { describe, expect, it } from 'vitest';
import { offline } from '../../src/sync/adapter';

const HREF = 'https://downloader.disk.yandex.ru/disk/abc?uid=1234567&filename=vault.json';

describe('подробности ошибки', () => {
  it('из текста ошибки убираются ссылки (в них номер аккаунта и подпись)', () => {
    const e = new TypeError(`FetchEvent.respondWith received an error: no-response :: [{"url":"${HREF}","error":{}}]`);
    const r = offline(HREF, e);
    expect(r.host).toBe('downloader.disk.yandex.ru');
    expect(r.cause).not.toContain('uid');
    expect(r.cause).not.toContain('http');
    expect(r.cause).toContain('no-response');
  });
});
