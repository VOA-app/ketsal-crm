// Ошибки сети для окна синхронизации: адрес сервера без ссылки и номера аккаунта.
import { describe, expect, it } from 'vitest';
import { checkSwFailure, offline, OfflineError } from '../../src/sync/adapter';

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

  it('ответ 599 от service worker — OfflineError с причиной', async () => {
    const res = new Response(JSON.stringify({ ketsalSw: 'cors', message: 'TypeError' }), { status: 599 });
    await expect(checkSwFailure(res, HREF)).rejects.toMatchObject({
      host: 'downloader.disk.yandex.ru',
      cause: 'sw cors · TypeError',
    });
    await expect(checkSwFailure(new Response('{}', { status: 599 }), HREF)).resolves.toBeUndefined();
    await expect(checkSwFailure(new Response('ok', { status: 200 }), HREF)).resolves.toBeUndefined();
    expect(new OfflineError()).toBeInstanceOf(Error);
  });
});
