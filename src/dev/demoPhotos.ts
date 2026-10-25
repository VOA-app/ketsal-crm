// Нарисованные демо-фото (SVG) из прототипа: реальных лиц в демо-наборе нет.
// id вида demo:<вид>:<стадия>:<вариант>, например demo:brows:before:2.
import { mulberry32 } from './demo';

const cache = new Map<string, string>();

export function demoPhotoUri(id: string): string {
  const hit = cache.get(id);
  if (hit) return hit;
  const [, kind, stage, v] = id.split(':');
  const uri = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(demoPhotoSVG(kind, stage, Number(v) || 0))}`;
  cache.set(id, uri);
  return uri;
}

type Pt = [number, number];
function qPoint(p0: Pt, p1: Pt, p2: Pt, t: number): Pt {
  const u = 1 - t;
  return [u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0], u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1]];
}

function demoPhotoSVG(kind: string, stage: string, v: number): string {
  const skins = [
    ['#F4E5D9', '#E3C9B6'],
    ['#F0DDCC', '#DDC0AA'],
    ['#F6E8DD', '#E6CEBC'],
    ['#EBD6C5', '#D6B9A3'],
  ];
  const [c1, c2] = skins[v % skins.length];
  const k = stage === 'before' ? 0 : stage === 'after' ? 2 : 1; // 0 — до, 1 — через месяц, 2 — сразу после
  let body = '';
  if (kind === 'brows') {
    const col = ['#4E3A30', '#5B4739', '#3F3B39', '#6B4C38'][v % 4];
    const op = [0.24, 0.64, 0.94][k];
    let hairs = '';
    if (k === 0) {
      for (let i = 0; i < 9; i += 1) {
        const x = 236 + i * 13;
        hairs += `<path d="M${x} ${147 - i * 3.3}l9 -7" stroke="${col}" stroke-opacity=".34" stroke-width="1.6" stroke-linecap="round"/>`;
      }
    }
    const brow = `<path d="M222 150C250 120 300 104 346 111C354 112 360 116 362 121C330 118 290 125 252 143C240 148 230 152 222 150Z" fill="${col}" fill-opacity="${op}"/>`;
    const P0: Pt = [236, 198];
    const P1: Pt = [292, 176];
    const P2: Pt = [350, 196];
    let lashes = '';
    for (let t = 0.12; t < 0.9; t += 0.11) {
      const [x, y] = qPoint(P0, P1, P2, t);
      lashes += `<path d="M${x.toFixed(1)} ${y.toFixed(1)}l${(-3 + t * 7).toFixed(1)} 10" stroke="#4A3D38" stroke-width="1.6" stroke-linecap="round"/>`;
    }
    const eye = `<path d="M236 198Q292 176 350 196" stroke="#6A5750" stroke-width="3" fill="none" stroke-linecap="round"/>${lashes}`;
    body = `<g>${brow}${hairs}${eye}</g><g transform="translate(400 0) scale(-1 1)">${brow}${hairs}${eye}</g>`;
  } else if (kind === 'lips') {
    const sets = [
      ['#D3A39B', '#C56E72', '#B4434F'],
      ['#D6A69A', '#CF7C6E', '#CB5A4E'],
      ['#CFA19A', '#B8707A', '#9E3342'],
      ['#D8AAA0', '#C98B85', '#B96F6B'],
    ];
    const col = sets[v % 4][k];
    const op = [0.62, 0.86, 0.96][k];
    const upper = 'M110 152C140 128 172 118 190 130C196 134 204 134 210 130C228 118 260 128 290 152C250 158 150 158 110 152Z';
    const lower = 'M110 152C150 160 250 160 290 152C268 192 232 206 200 206C168 206 132 192 110 152Z';
    body =
      `<path d="${upper}" fill="${col}" fill-opacity="${op}"/><path d="${lower}" fill="${col}" fill-opacity="${op}"/>` +
      `<path d="M112 152C150 160 250 160 288 152" stroke="#7E4144" stroke-opacity=".45" stroke-width="2" fill="none"/>` +
      (k === 0 ? `<path d="${upper}" fill="none" stroke="#B0847B" stroke-opacity=".35"/>` : '') +
      (k > 0 ? '<ellipse cx="200" cy="182" rx="34" ry="6" fill="#fff" fill-opacity=".16"/>' : '');
  } else if (kind === 'lash') {
    const lid = 'M92 160Q200 84 308 160';
    const col = ['#7A6A62', '#2E2828', '#1E1A1A'][k];
    const w = [1.5, 3.6, 5.2][k];
    let lashes = '';
    for (let t = 0.12; t < 0.92; t += 0.08) {
      const [x, y] = qPoint([92, 160], [200, 84], [308, 160], t);
      const dx = (t - 0.5) * 22;
      lashes += `<path d="M${x.toFixed(1)} ${y.toFixed(1)}q${(dx * 0.4).toFixed(1)} -12 ${dx.toFixed(1)} -20" stroke="#2B2425" stroke-width="1.7" fill="none" stroke-linecap="round"/>`;
    }
    body =
      '<defs><clipPath id="eye"><path d="M92 160Q200 84 308 160Q200 222 92 160Z"/></clipPath></defs>' +
      '<path d="M92 160Q200 84 308 160Q200 222 92 160Z" fill="#FAF6F2" stroke="#7C6A61" stroke-width="1.5"/>' +
      '<g clip-path="url(#eye)"><circle cx="200" cy="154" r="37" fill="#6D5A4B"/><circle cx="200" cy="154" r="15" fill="#221B1A"/><circle cx="188" cy="143" r="6" fill="#fff" fill-opacity=".7"/></g>' +
      `${lashes}<path d="${lid}" stroke="${col}" stroke-width="${w}" fill="none" stroke-linecap="round"/>`;
  } else if (kind === 'camo') {
    const scar = 'M118 214C170 178 232 160 292 106';
    if (k === 0) {
      body = `<path d="${scar}" stroke="#D5A99D" stroke-opacity=".7" stroke-width="22" fill="none" stroke-linecap="round"/><path d="${scar}" stroke="#F7E4DE" stroke-width="15" fill="none" stroke-linecap="round"/>`;
      for (let i = 0; i < 7; i += 1) {
        const [x, y] = qPoint([118, 214], [205, 175], [292, 106], 0.1 + i * 0.13);
        body += `<path d="M${(x - 9).toFixed(1)} ${(y - 9).toFixed(1)}l18 18" stroke="#D9AEA2" stroke-width="2" stroke-opacity=".6"/>`;
      }
    } else {
      const col = k === 2 ? '#E0C3AF' : '#EACFBF';
      body = `<path d="${scar}" stroke="#D8B6A2" stroke-opacity="${k === 2 ? 0.12 : 0.22}" stroke-width="20" fill="none" stroke-linecap="round"/><path d="${scar}" stroke="${col}" stroke-opacity=".9" stroke-width="14" fill="none" stroke-linecap="round"/>`;
    }
  } else if (kind === 'areola') {
    const col = ['#E2C4B6', '#CD998C', '#C4887B'][k];
    body = `<ellipse cx="200" cy="150" rx="${k === 0 ? 58 : 64}" ry="${k === 0 ? 52 : 64}" fill="${col}"/><circle cx="200" cy="150" r="17" fill="${col}"/><circle cx="200" cy="150" r="17" fill="#8A5A50" fill-opacity=".28"/>`;
  } else if (kind === 'scalp') {
    const r = mulberry32(99 + v);
    const n = [70, 260, 320][k];
    const op = [0.35, 0.7, 0.85][k];
    let dots = '';
    for (let i = 0; i < n; i += 1) {
      const a = r() * Math.PI * 2;
      const d = Math.sqrt(r());
      dots += `<circle cx="${(200 + Math.cos(a) * d * 150).toFixed(1)}" cy="${(150 + Math.sin(a) * d * 110).toFixed(1)}" r="1.5"/>`;
    }
    body = `<g fill="#3E3A3A" fill-opacity="${op}">${dots}</g>`;
  } else if (kind === 'doc') {
    let lines = '';
    const widths = [120, 112, 118, 96, 120, 104, 116, 88, 110];
    for (let i = 0; i < 9; i += 1) lines += `<rect x="140" y="${70 + i * 14}" width="${widths[i]}" height="4" rx="2" fill="#6E7674" fill-opacity=".4"/>`;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300"><rect width="400" height="300" fill="${v % 2 ? '#E7F0EE' : '#EFEAE3'}"/><rect x="120" y="22" width="160" height="256" rx="4" fill="#fff" stroke="#DFE4E2"/><rect x="140" y="44" width="92" height="7" rx="3" fill="#2B2223" fill-opacity=".75"/>${lines}<path d="M150 242c10-18 18 8 26-4s14-16 20 2 10 6 22-8" stroke="#284C8C" stroke-width="2" fill="none" stroke-linecap="round"/><rect x="214" y="246" width="46" height="3" rx="1.5" fill="#6E7674" fill-opacity=".4"/></svg>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300"><defs><radialGradient id="g" cx="50%" cy="45%" r="75%"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></radialGradient></defs><rect width="400" height="300" fill="url(#g)"/>${body}</svg>`;
}
