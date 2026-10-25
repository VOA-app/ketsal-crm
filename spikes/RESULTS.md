# Этап 0 — результаты проверок

Страница проверок: `spikes/index.html` (на GitHub Pages — `https://voa-app.github.io/ketsal-crm/spikes/`).
ClientID приложения в Яндекс OAuth: `8b5f91e91a17446f8240d6489ca507db` (подставлен на странице по умолчанию).
Каждую проверку на iPhone делаем дважды: во вкладке Safari и с экрана «Домой».

## Итоги

| Проверка | ПК, Chrome | iPhone, Safari | iPhone, «Домой» | Вывод |
|---|---|---|---|---|
| PBKDF2 600k, время | ✓ 130 мс | | ✓ 119 мс | 600k с запасом |
| AES‑GCM, подмена байта | ✓ 3 мс на 1 МБ, подмена обнаружена | | ✓ 2 мс, подмена обнаружена | ✓ |
| IndexedDB | ✓ 1,9 с на 1 МБ | | ✓ 14 мс | ✓ |
| storage.persist() | · не разрешено во вкладке, ≈ 2 ГБ | | ✓ разрешено, ≈ 39 ГБ | ✓ в режиме «Домой» |
| Фото с камеры → JPEG 2560 | не проверялось | | ✓ createImageBitmap, 3213×5712 → 1440×2560, 4,1 → 1,2 МБ, 148 мс | ✓ без отдельного декодера |
| «Поделиться» файлом | ✓ есть | | ✓ есть | ✓ |
| Face ID: PRF | ✗ на ПК нет (ожидаемо) | | ✓ секрет получен сразу при создании passkey | ✓ быстрый вход по Face ID |
| Вход: код + PKCE, CORS на `oauth.yandex.ru/token` | ✓ токен ≈ 365 дн., есть refresh_token | | ✓ токен ≈ 365 дн., есть refresh_token | ✓ основной поток |
| Вход: токен сразу | не нужен | | не нужен | запасной не понадобился |
| Вход в отдельном окне | не нужен | | не нужен | запасной не понадобился |
| Возврат после входа в режиме «Домой» | — | — | ✓ начали и вернулись в «Домой» | ✓ |
| Диск: список (CORS на `cloud-api.yandex.net`) | ✓ 200 | | ✓ 200 | ✓ |
| Диск: загрузка 5 МБ (CORS на ссылке загрузки) | ✓ 201, 41 с, `uploader…disk.yandex.net` | | ✓ 201, 41 с | ✓ (медленная сеть отправки, ≈ 1 Мбит/с) |
| Диск: скачивание, обычный запрос | ✗ 403 без CORS от `downloader.disk.yandex.ru` | | ✗ то же | только без Referer |
| Диск: скачивание без Referer и сверка | ✓ 200, 0,5 с, байты совпали, `downloader.disk.yandex.ru` → `mds.storage.yandex.net` | | ✓ 200, 0,5 с, байты совпали | ✓ прокси не нужен |
| Диск: удаление | ✓ 204 | | ✓ 204 | ✓ |

## Предварительно: CORS по заголовкам (curl, 25.10.2026)

Запросы с `Origin: https://voa-app.github.io` без токена. Браузерную проверку не заменяет.

| Адрес | Ответ |
|---|---|
| `POST oauth.yandex.ru/token` (и preflight) | `Access-Control-Allow-Origin: *`, Content-Type разрешён, ошибка `invalid_grant` читается |
| `cloud-api.yandex.net/v1/disk/resources` GET, DELETE (и preflight с Authorization) | `Access-Control-Allow-Origin: https://voa-app.github.io` |
| `downloader.disk.yandex.ru` (preflight) | `Access-Control-Allow-Origin: *`, GET |
| `uploader*.disk.yandex.net` | не проверено: нужен настоящий href от `/upload` |

## Хосты для CSP

ПК (Chrome) и iPhone («Домой») одинаково: `cloud-api.yandex.net`, `oauth.yandex.ru`, `uploader*.disk.yandex.net`, `downloader.disk.yandex.ru`, `mds.storage.yandex.net` (перенаправление при скачивании). В `connect-src` SPEC §11 добавлен `https://*.storage.yandex.net`.

## Решения по итогам

- Поток входа: **код + PKCE** без client secret. Работает на ПК и на iPhone с экрана «Домой», возврат после входа — в тот же режим. Запасные потоки не нужны.
- Нужен ли прокси на Yandex Cloud Functions: **не нужен**. `downloader.disk.yandex.ru` отвечает 403 без CORS на запрос с Referer чужого сайта; с `referrerPolicy: 'no-referrer'` отдаёт файл (ПК и iPhone).
- Быстрый вход: **Face ID через passkey (PRF)** работает на iPhone в режиме «Домой»; код из 6 цифр — запасной вариант для устройств без PRF.
- Число итераций PBKDF2: **600 000** (≈ 120 мс на iPhone и ПК), поднимать не требуется.
- Фото: `createImageBitmap` открывает снимки камеры iPhone, отдельный декодер HEIC не нужен.

## Отчёты страницы проверок

<!-- сюда вставлять отчёты со страницы: в них нет токена и личных данных -->

### ПК, Chrome 156, вкладка — 25.10.2026, 22:38

- ✓ Безопасный контекст (HTTPS) — есть
- · Режим запуска — вкладка браузера
- ✓ Вход по паролю: PBKDF2-SHA256, 600 000 итераций — 130 мс
- ✓ Шифрование AES-256-GCM, 1 МБ туда и обратно — 3 мс, подмена байта обнаружена
- ✓ IndexedDB: запись и чтение 1 МБ — 1894 мс
- · Постоянное хранилище (storage.persist) — пока не разрешено, доступно ≈ 2048 МБ
- ✓ «Поделиться» файлом копии: поддержка — есть
- ✓ OffscreenCanvas для фото — есть
- ✗ Face ID / Touch ID в браузере — недоступен, PRF: заявлен
- ✓ Возврат после входа — начали: вкладка браузера, вернулись: вкладка браузера
- ✓ Обмен кода на токен без client secret (CORS на oauth.yandex.ru/token) — токен получен, живёт ≈ 365 дн., refresh_token есть
- ✓ Список папки приложения (CORS на cloud-api.yandex.net) — ответ 200

Загрузка, скачивание и удаление в отчёт не попали: отчёт скопирован раньше, чем закончилась загрузка 5 МБ. На странице добавлен статус «идёт…».

### ПК, Chrome 156, вкладка — 25.10.2026, 22:45 (повтор с Диском)

- ✓ PBKDF2 600 000 — 123 мс; AES-GCM 1 МБ — 2 мс; IndexedDB 1 МБ — 385 мс
- ✓ Список папки приложения — ответ 200
- ✓ Загрузка 5 МБ по ссылке Диска (CORS) — ответ 201, 40790 мс, хост uploader329kdlaam.disk.yandex.net
- ✗ Скачивание по ссылке Диска — ответ от downloader.disk.yandex.ru не дошёл до страницы
- ✓ Удаление файла — ответ 204
- · Хосты для CSP — cloud-api.yandex.net, uploader329kdlaam.disk.yandex.net, downloader.disk.yandex.ru

Preflight на `downloader.disk.yandex.ru` отдаёт `Access-Control-Allow-Origin: *`, а настоящий GET — нет. На страницу добавлена диагностика перенаправления.

### ПК, Chrome 156, вкладка — 25.10.2026, 22:53 (диагностика скачивания)

- ✓ Загрузка 5 МБ — ответ 201, 41552 мс, хост uploader86jpjfme.disk.yandex.net
- ✗ Скачивание — у ответа downloader.disk.yandex.ru нет CORS
- ✓ Удаление — ответ 204

Консоль Chrome: `GET https://downloader.disk.yandex.ru/disk/… net::ERR_FAILED 403 (Forbidden)`, `No 'Access-Control-Allow-Origin' header`. Перенаправления нет: downloader сам отказывает запросу со страницы (403). Следующая проверка — запрос без Referer; если тоже 403, скачивание из браузера невозможно, нужен прокси (§6.4).

### ПК, Chrome 156, вкладка — 25.10.2026, 22:58 (скачивание без Referer)

- ✓ PBKDF2 600 000 — 125 мс; AES-GCM 1 МБ — 2 мс; IndexedDB 1 МБ — 478 мс
- ✓ Вход код + PKCE, токен ≈ 365 дн., refresh_token есть
- ✓ Список — 200; загрузка 5 МБ — 201, 40658 мс, uploader34ionccm.disk.yandex.net
- ✗ Скачивание, обычный запрос — нет CORS (403)
- ✓ Скачивание, без Referer, и сверка — ответ 200, 471 мс, байты совпали, downloader.disk.yandex.ru → mds.storage.yandex.net
- ✓ Удаление — 204
- · Хосты для CSP — cloud-api.yandex.net, uploader34ionccm.disk.yandex.net, downloader.disk.yandex.ru, mds.storage.yandex.net

### iPhone, iOS 18.7, с экрана «Домой» — 25.10.2026, 23:16

- ✓ Безопасный контекст (HTTPS) — есть
- · Режим запуска — с экрана «Домой»
- ✓ Вход по паролю: PBKDF2-SHA256, 600 000 итераций — 119 мс
- ✓ Шифрование AES-256-GCM, 1 МБ туда и обратно — 2 мс, подмена байта обнаружена
- ✓ IndexedDB: запись и чтение 1 МБ — 14 мс
- ✓ Постоянное хранилище (storage.persist) — разрешено, доступно ≈ 39322 МБ
- ✓ «Поделиться» файлом копии: поддержка — есть
- ✓ OffscreenCanvas для фото — есть
- ✓ Face ID / Touch ID в браузере — доступен, PRF: не заявлен
- ✓ Face ID: ключ из passkey (PRF) — секрет получен сразу при создании
- ✓ Фото: открыть, уменьшить до 2560 px, сохранить JPEG — image/jpeg через createImageBitmap, 3213×5712 → 1440×2560, 4,1 МБ → 1,2 МБ, 148 мс
- ✓ Возврат после входа — начали: с экрана «домой», вернулись: с экрана «домой»
- ✓ Обмен кода на токен без client secret (CORS на oauth.yandex.ru/token) — токен получен, живёт ≈ 365 дн., refresh_token есть
- ✓ Список папки приложения (CORS на cloud-api.yandex.net) — ответ 200
- ✓ Загрузка 5 МБ по ссылке Диска (CORS) — ответ 201, 40690 мс, хост uploader37iekdpf.disk.yandex.net
- ✗ Скачивание, обычный запрос — нет CORS (403)
- ✓ Скачивание, без Referer, и сверка (CORS) — ответ 200, 523 мс, байты совпали, хост downloader.disk.yandex.ru → mds.storage.yandex.net
- ✓ Удаление файла — ответ 204
- · Хосты для CSP (connect-src) — cloud-api.yandex.net, uploader37iekdpf.disk.yandex.net, downloader.disk.yandex.ru, mds.storage.yandex.net
