// Заставки запуска с экрана «Домой» на iPhone (apple-touch-startup-image).
// Фон — цвет иконки, по центру — иконка 512 px. Без зависимостей: PNG читается и пишется через zlib.
// Запуск: node scripts/splash.mjs → public/splash/*.png и список <link> для index.html.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { deflateSync, inflateSync } from 'node:zlib';

// Экраны iPhone в точках и плотность (портрет)
const DEVICES = [
  [440, 956, 3], // 16 Pro Max, 17 Pro Max
  [430, 932, 3], // 14 Pro Max, 15 Plus, 15 Pro Max, 16 Plus
  [420, 912, 3], // Air
  [402, 874, 3], // 16 Pro, 17, 17 Pro
  [393, 852, 3], // 14 Pro, 15, 15 Pro, 16
  [428, 926, 3], // 12 Pro Max, 13 Pro Max, 14 Plus
  [390, 844, 3], // 12, 13, 14, 12 Pro, 13 Pro
  [375, 812, 3], // X, XS, 11 Pro, 12 mini, 13 mini
  [414, 896, 3], // XS Max, 11 Pro Max
  [414, 896, 2], // XR, 11
  [414, 736, 3], // 6–8 Plus
  [375, 667, 2], // SE 2–3, 6–8
];

function readPng(path) {
  const b = readFileSync(path);
  const w = b.readUInt32BE(16);
  const h = b.readUInt32BE(20);
  if (b[24] !== 8 || b[25] !== 6 || b[28] !== 0) throw new Error('нужен RGBA 8 бит без чересстрочности');
  const idat = [];
  for (let p = 8; p < b.length;) {
    const len = b.readUInt32BE(p);
    const type = b.toString('ascii', p + 4, p + 8);
    if (type === 'IDAT') idat.push(b.subarray(p + 8, p + 8 + len));
    p += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const stride = w * 4;
  const out = Buffer.alloc(h * stride);
  for (let y = 0; y < h; y += 1) {
    const f = raw[y * (stride + 1)];
    const src = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x += 1) {
      const a = x >= 4 ? out[y * stride + x - 4] : 0;
      const up = y > 0 ? out[(y - 1) * stride + x] : 0;
      const ul = y > 0 && x >= 4 ? out[(y - 1) * stride + x - 4] : 0;
      let v = src[x];
      if (f === 1) v += a;
      else if (f === 2) v += up;
      else if (f === 3) v += (a + up) >> 1;
      else if (f === 4) {
        const pa = Math.abs(up - ul);
        const pb = Math.abs(a - ul);
        const pc = Math.abs(a + up - 2 * ul);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? up : ul;
      }
      out[y * stride + x] = v & 255;
    }
  }
  return { w, h, px: out };
}

const CRC = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc = (buf) => {
  let c = 0xffffffff;
  for (const x of buf) c = CRC[(c ^ x) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const c = Buffer.alloc(4);
  c.writeUInt32BE(crc(td));
  return Buffer.concat([len, td, c]);
}
function writePng(path, w, h, rgb) {
  const raw = Buffer.alloc(h * (w * 3 + 1));
  for (let y = 0; y < h; y += 1) rgb.copy(raw, y * (w * 3 + 1) + 1, y * w * 3, (y + 1) * w * 3);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2; // RGB
  writeFileSync(
    path,
    Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk('IHDR', ihdr),
      chunk('IDAT', deflateSync(raw, { level: 9 })),
      chunk('IEND', Buffer.alloc(0)),
    ]),
  );
}

const icon = readPng('public/icons/icon-512.png');
// Цвет фона — из угла иконки, чтобы иконка «растворилась» в заставке
const bg = [icon.px[0], icon.px[1], icon.px[2]];
mkdirSync('public/splash', { recursive: true });
const links = [];
for (const [dw, dh, dpr] of DEVICES) {
  const w = dw * dpr;
  const h = dh * dpr;
  const rgb = Buffer.alloc(w * h * 3);
  for (let i = 0; i < w * h; i += 1) rgb.set(bg, i * 3);
  const ox = Math.round((w - icon.w) / 2);
  const oy = Math.round((h - icon.h) / 2);
  for (let y = 0; y < icon.h; y += 1) {
    for (let x = 0; x < icon.w; x += 1) {
      const s = (y * icon.w + x) * 4;
      const a = icon.px[s + 3] / 255;
      const d = ((oy + y) * w + ox + x) * 3;
      for (let k = 0; k < 3; k += 1) rgb[d + k] = Math.round(icon.px[s + k] * a + bg[k] * (1 - a));
    }
  }
  const name = `splash-${w}x${h}.png`;
  writePng(`public/splash/${name}`, w, h, rgb);
  links.push(
    `<link rel="apple-touch-startup-image" href="/splash/${name}" media="(device-width: ${dw}px) and (device-height: ${dh}px) and (-webkit-device-pixel-ratio: ${dpr}) and (orientation: portrait)" />`,
  );
}
console.log(links.join('\n'));
