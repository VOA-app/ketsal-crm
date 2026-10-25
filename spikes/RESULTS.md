# Этап 0 — результаты проверок

Страница проверок: `spikes/index.html` (на GitHub Pages — `https://voa-app.github.io/ketsal-crm/spikes/`).
ClientID приложения в Яндекс OAuth: `8b5f91e91a17446f8240d6489ca507db` (подставлен на странице по умолчанию).
Каждую проверку на iPhone делаем дважды: во вкладке Safari и с экрана «Домой».

## Итоги

| Проверка | ПК, Chrome | iPhone, Safari | iPhone, «Домой» | Вывод |
|---|---|---|---|---|
| PBKDF2 600k, время | | | | |
| AES‑GCM, подмена байта | | | | |
| IndexedDB | | | | |
| storage.persist() | | | | |
| Фото HEIC → JPEG | | | | |
| «Поделиться» файлом | | | | |
| Face ID: PRF | | | | |
| Вход: код + PKCE, CORS на `oauth.yandex.ru/token` | | | | |
| Вход: токен сразу | | | | |
| Вход в отдельном окне | | | | |
| Возврат после входа в режиме «Домой» | — | — | | |
| Диск: список (CORS на `cloud-api.yandex.net`) | | | | |
| Диск: загрузка 5 МБ (CORS на ссылке загрузки) | | | | |
| Диск: скачивание и сверка (CORS на ссылке скачивания) | | | | |
| Диск: удаление | | | | |

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
