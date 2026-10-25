# Этап 0 — результаты проверок

Страница проверок: `spikes/index.html` (на GitHub Pages — `https://voa-app.github.io/ketsal-crm/spikes/`).
ClientID приложения в Яндекс OAuth: `8b5f91e91a17446f8240d6489ca507db` (подставлен на странице по умолчанию).
Каждую проверку на iPhone делаем дважды: во вкладке Safari и с экрана «Домой».

## Итоги

| Проверка | ПК, Chrome | iPhone, Safari | iPhone, «Домой» | Вывод |
|---|---|---|---|---|
| PBKDF2 600k, время | ✓ 130 мс | | | |
| AES‑GCM, подмена байта | ✓ 3 мс на 1 МБ, подмена обнаружена | | | |
| IndexedDB | ✓ 1,9 с на 1 МБ | | | |
| storage.persist() | · не разрешено во вкладке, ≈ 2 ГБ | | | |
| Фото HEIC → JPEG | не проверялось | | | |
| «Поделиться» файлом | ✓ есть | | | |
| Face ID: PRF | ✗ на ПК нет (ожидаемо) | | | |
| Вход: код + PKCE, CORS на `oauth.yandex.ru/token` | ✓ токен ≈ 365 дн., есть refresh_token | | | |
| Вход: токен сразу | | | | |
| Вход в отдельном окне | | | | |
| Возврат после входа в режиме «Домой» | — | — | | |
| Диск: список (CORS на `cloud-api.yandex.net`) | ✓ 200 | | | |
| Диск: загрузка 5 МБ (CORS на ссылке загрузки) | ✓ 201, 41 с, `uploader…disk.yandex.net` | | | |
| Диск: скачивание и сверка (CORS на ссылке скачивания) | ✗ ответ `downloader.disk.yandex.ru` не читается страницей | | | |
| Диск: удаление | ✓ 204 | | | |

## Предварительно: CORS по заголовкам (curl, 25.10.2026)

Запросы с `Origin: https://voa-app.github.io` без токена. Браузерную проверку не заменяет.

| Адрес | Ответ |
|---|---|
| `POST oauth.yandex.ru/token` (и preflight) | `Access-Control-Allow-Origin: *`, Content-Type разрешён, ошибка `invalid_grant` читается |
| `cloud-api.yandex.net/v1/disk/resources` GET, DELETE (и preflight с Authorization) | `Access-Control-Allow-Origin: https://voa-app.github.io` |
| `downloader.disk.yandex.ru` (preflight) | `Access-Control-Allow-Origin: *`, GET |
| `uploader*.disk.yandex.net` | не проверено: нужен настоящий href от `/upload` |

## Хосты для CSP

## Решения по итогам

- Поток входа:
- Нужен ли прокси на Yandex Cloud Functions:
- Быстрый вход (Face ID или код):
- Число итераций PBKDF2:

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
