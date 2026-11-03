// Памятка мастеру внутри приложения: docs/pamyatka.md → help.html при сборке (vite.config.ts).
// Страница статическая, без скриптов; service worker кладёт её в кэш, поэтому она открывается
// и без сети. Разбирается только то, что есть в памятке: заголовки, абзацы, списки, цитата,
// **жирный**, `код` и ссылки.

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Строчная разметка: ссылки [текст](адрес), голые https-адреса, **жирный**, `код`. */
function inline(src: string): string {
  let s = esc(src);
  s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2">$1</a>');
  s = s.replace(/(^|[\s(>])(https:\/\/[^\s<)]+[^\s<).,;:!?»])/g, '$1<a href="$2">$2</a>');
  return s;
}

export function markdownToHtml(md: string): string {
  const out: string[] = [];
  let list: 'ul' | 'ol' | null = null;
  let para: string[] = [];
  const flushPara = () => {
    if (para.length) out.push(`<p>${inline(para.join(' '))}</p>`);
    para = [];
  };
  const closeList = () => {
    if (list) out.push(`</${list}>`);
    list = null;
  };
  for (const raw of md.split(/\r?\n/)) {
    const line = raw.trimEnd();
    const h = /^(#{1,3})\s+(.*)$/.exec(line);
    const ul = /^[-*]\s+(.*)$/.exec(line);
    const ol = /^\d+\.\s+(.*)$/.exec(line);
    const quote = /^>\s?(.*)$/.exec(line);
    if (!line.trim()) {
      flushPara();
      closeList();
    } else if (h) {
      flushPara();
      closeList();
      out.push(`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`);
    } else if (ul || ol) {
      flushPara();
      const kind = ul ? 'ul' : 'ol';
      if (list !== kind) {
        closeList();
        out.push(`<${kind}>`);
        list = kind;
      }
      out.push(`<li>${inline((ul ?? ol)![1])}</li>`);
    } else if (quote) {
      flushPara();
      closeList();
      out.push(`<blockquote><p>${inline(quote[1])}</p></blockquote>`);
    } else if (list && /^\s+\S/.test(raw)) {
      // Продолжение пункта списка на следующей строке
      const last = out.pop()!;
      out.push(last.replace(/<\/li>$/, ` ${inline(line.trim())}</li>`));
    } else {
      closeList();
      para.push(line.trim());
    }
  }
  flushPara();
  closeList();
  return out.join('\n');
}

/** Полная страница памятки. back — адрес приложения (кнопка «Вернуться»: в режиме «Домой» нет «Назад»). */
export function helpPage(md: string, back = './'): string {
  const title = /^#\s+(.*)$/m.exec(md)?.[1] ?? 'Памятка';
  const CSP =
    "default-src 'self'; style-src 'self'; font-src 'self'; img-src 'self'; base-uri 'none'; form-action 'none'";
  const backLink = `<a class="back" href="${esc(back)}">← Вернуться в приложение</a>`;
  return `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${CSP}">
<meta name="referrer" content="no-referrer">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#F7F4F0">
<title>${esc(title)}</title>
<link rel="stylesheet" href="help.css">
</head>
<body>
<main>
${backLink}
${markdownToHtml(md)}
${backLink}
</main>
</body>
</html>
`;
}
