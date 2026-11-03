/// <reference types="vitest/config" />
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { helpPage } from './src/dev/helpPage';

// CSP из SPEC §11. Только в прод-сборке: dev-сервер Vite вставляет inline-скрипты для HMR.
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "font-src 'self'",
  "img-src 'self' blob: data:",
  "connect-src 'self' https://cloud-api.yandex.net https://oauth.yandex.ru https://*.disk.yandex.net https://*.disk.yandex.ru https://*.storage.yandex.net",
  "worker-src 'self'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

function csp(): Plugin {
  return {
    name: 'ketsal-csp',
    transformIndexHtml: {
      order: 'pre',
      handler: (html, ctx) =>
        html.replace('<!--CSP-->', ctx.server ? '' : `<meta http-equiv="Content-Security-Policy" content="${CSP}">`),
    },
  };
}

/**
 * Памятка мастеру как страница приложения: docs/pamyatka.md → help.html (+ help.css). Попадает
 * в кэш service worker, поэтому открывается и без сети. На dev-сервере отдаётся на лету.
 */
function help(): Plugin {
  const page = () => helpPage(readFileSync('docs/pamyatka.md', 'utf8'));
  const css = () => readFileSync('src/design/help.css', 'utf8');
  return {
    name: 'ketsal-help',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = (req.url ?? '').split('?')[0];
        if (url.endsWith('/help.html') || url.endsWith('/help.css')) {
          const html = url.endsWith('.html');
          res.setHeader('Content-Type', html ? 'text/html; charset=utf-8' : 'text/css; charset=utf-8');
          res.end(html ? page() : css());
        } else next();
      });
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'help.html', source: page() });
      this.emitFile({ type: 'asset', fileName: 'help.css', source: css() });
    },
  };
}

function gitCommit(): string {
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return '';
  }
}

// На GitHub Pages приложение живёт в подпапке репозитория; путь задаёт сборка (BASE).
const BASE = process.env.BASE ?? '/';

export default defineConfig({
  base: BASE,
  define: {
    __APP_VERSION__: JSON.stringify(process.env.npm_package_version ?? '0.0.0'),
    __APP_COMMIT__: JSON.stringify(gitCommit()),
  },
  build: {
    sourcemap: false,
    // Ничего не встраивать как data: — шрифты и картинки только с 'self' (CSP)
    assetsInlineLimit: 0,
  },
  plugins: [
    csp(),
    help(),
    react(),
    VitePWA({
      // Новая версия не активируется молча: «Доступно обновление → Обновить» (SPEC §11)
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['fonts/*.woff2', 'icons/*'],
      manifest: {
        name: 'Кетсаль · учёт клиентов',
        short_name: 'Кетсаль',
        description: 'Учёт клиентов мастера перманента и камуфляжа студии «Кетсаль»',
        lang: 'ru',
        start_url: '.',
        scope: '.',
        display: 'standalone',
        background_color: '#F7F4F0',
        theme_color: '#F7F4F0',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,woff2,svg,png,webmanifest}'],
        // help.html — отдельная страница, не адрес внутри приложения: её не подменять на index.html
        // При первой установке сразу взять страницу под управление: без сети приложение откроется
        // уже со следующего запуска. Новая версия по-прежнему ждёт «Обновить» (skipWaiting не включён)
        clientsClaim: true,
        // Заставки нужны только iOS при установке — в кэш приложения их не кладём
        globIgnores: ['splash/**'],
        // Приложение в корне сайта не должно перехватывать соседние разделы (прототип, проверки, демо)
        navigateFallbackDenylist: BASE === '/ketsal-crm/' ? [/^\/ketsal-crm\/(app|demo|prototype|spikes)(\/|$)/] : [],
      },
    }),
  ],
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
  },
});
