// Памятка мастеру как страница приложения (help.html).
import { describe, expect, it } from 'vitest';
import { helpPage, markdownToHtml } from '../../src/dev/helpPage';
import memo from '../../docs/pamyatka.md?raw';

describe('памятка → страница', () => {
  it('заголовки, списки, цитата, жирный, ссылки; HTML из текста экранируется', () => {
    const html = markdownToHtml(
      [
        '# Заголовок',
        '',
        'Адрес: **https://voa-app.github.io/ketsal-crm/**',
        '',
        '1. Первый',
        '2. Второй `код`',
        '',
        '- пункт <script>',
        '',
        '> Важно',
      ].join('\n'),
    );
    expect(html).toContain('<h1>Заголовок</h1>');
    expect(html).toContain(
      '<strong><a href="https://voa-app.github.io/ketsal-crm/">https://voa-app.github.io/ketsal-crm/</a></strong>',
    );
    expect(html).toContain('<ol>\n<li>Первый</li>\n<li>Второй <code>код</code></li>\n</ol>');
    expect(html).toContain('<li>пункт &lt;script&gt;</li>');
    expect(html).toContain('<blockquote><p>Важно</p></blockquote>');
  });

  it('настоящая памятка собирается: заголовок, кнопка «Вернуться», без скриптов', () => {
    const page = helpPage(memo);
    expect(page).toContain('<title>Кетсаль · учёт клиентов — памятка мастеру</title>');
    expect(page.match(/Вернуться в приложение/g)).toHaveLength(2);
    expect(page).not.toMatch(/<script/i);
    expect(page).toContain("default-src 'self'");
  });
});
