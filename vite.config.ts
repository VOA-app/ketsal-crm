/// <reference types="vitest/config" />
import { execSync } from 'node:child_process';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

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

function gitCommit(): string {
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return '';
  }
}

export default defineConfig({
  // На GitHub Pages приложение живёт в подпапке репозитория; путь задаёт сборка (BASE).
  base: process.env.BASE ?? '/',
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
      },
    }),
  ],
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
  },
});
