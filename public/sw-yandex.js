// Запросы к Яндексу внутри service worker (SPEC §6.3, §11).
//
// Safari, пропуская запрос страницы через service worker, теряет referrerPolicy: 'no-referrer',
// и downloader.disk.yandex.ru отвечает 403 без CORS — скачивание с Диска ломается. Поэтому запрос
// к Яндексу собирается здесь заново с явным «без Referer». Не прошёл — повторяем без CORS, только
// чтобы понять, ответил ли сервер, и возвращаем странице ответ 599 с причиной (без адреса и данных).
// Подключается к sw.js через workbox importScripts и срабатывает раньше маршрутов workbox.
const YANDEX = /(^|\.)yandex\.(net|ru)$/;

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (!YANDEX.test(url.hostname)) return;
  event.respondWith(yandexFetch(event.request));
});

async function yandexFetch(req) {
  const init = {
    method: req.method,
    headers: req.headers,
    mode: 'cors',
    credentials: 'omit',
    referrer: '',
    referrerPolicy: 'no-referrer',
    redirect: 'follow',
    cache: 'no-store',
  };
  if (req.method !== 'GET' && req.method !== 'HEAD') init.body = await req.arrayBuffer();
  try {
    return await fetch(req.url, init);
  } catch (e) {
    let kind = 'network';
    // Повтор без CORS — только для чтения: сервер ответил, но браузер отклонил ответ?
    if (req.method === 'GET') {
      try {
        await fetch(req.url, { mode: 'no-cors', credentials: 'omit', referrer: '', referrerPolicy: 'no-referrer' });
        kind = 'cors';
      } catch {
        // сервер не ответил вовсе
      }
    }
    const message = e && e.name ? e.name : 'Error';
    return new Response(JSON.stringify({ ketsalSw: kind, message }), {
      status: 599,
      headers: { 'content-type': 'application/json' },
    });
  }
}
