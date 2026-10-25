// Общие помощники: DOM, экранирование, даты, деньги, телефоны.

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let uidCounter = 0;
const uid = (p = 'id') => `${p}_${Date.now().toString(36)}${(uidCounter++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const deepClone = (o) => JSON.parse(JSON.stringify(o));
const uniq = (arr) => Array.from(new Set(arr));
const sum = (arr, f = (x) => x) => arr.reduce((s, x) => s + (Number(f(x)) || 0), 0);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const lc = (s) => (s ? s[0].toLowerCase() + s.slice(1) : s);
const norm = (s) => String(s || '').toLowerCase().replace(/ё/g, 'е').trim();

const NBSP = ' ';
function fmtNum(n) {
  const v = Math.round(Math.abs(Number(n) || 0)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
  return (n < 0 ? '−' : '') + v;
}
const fmtMoney = (n) => `${fmtNum(n)}${NBSP}₽`;
function fmtMoneyShort(n) {
  if (Math.abs(n) >= 1e6) return `${(n / 1e6).toFixed(1).replace('.', ',').replace(',0', '')}${NBSP}млн`;
  if (Math.abs(n) >= 1e3) return `${Math.round(n / 1e3)}${NBSP}тыс`;
  return fmtNum(n);
}
const parseMoney = (v) => {
  const n = parseInt(String(v ?? '').replace(/[^\d]/g, ''), 10);
  return Number.isFinite(n) ? n : 0;
};

function plural(n, one, few, many) {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b > 1 && b < 5) return few;
  if (b === 1) return one;
  return many;
}
const pl = (n, one, few, many) => `${n}${NBSP}${plural(n, one, few, many)}`;

// ── Даты хранятся строками YYYY-MM-DD ──
const MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const MONTHS_NOM = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];
const MONTHS_SHORT = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
const MONTHS_AXIS = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
const WEEKDAYS = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];

function toISO(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
const todayISO = () => toISO(new Date());
function parseISO(s) {
  const [y, m, d] = String(s).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}
const isISO = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));
function addDays(iso, n) {
  const d = parseISO(iso);
  d.setDate(d.getDate() + n);
  return toISO(d);
}
function addMonths(iso, n) {
  const d = parseISO(iso);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + n);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, last));
  return toISO(d);
}
const daysBetween = (a, b) => Math.round((parseISO(b) - parseISO(a)) / 86400000);
function monthsBetween(a, b) {
  const A = parseISO(a);
  const B = parseISO(b);
  let m = (B.getFullYear() - A.getFullYear()) * 12 + (B.getMonth() - A.getMonth());
  if (B.getDate() < A.getDate()) m -= 1;
  return m;
}
const startOfMonth = (iso) => `${iso.slice(0, 7)}-01`;
function endOfMonth(iso) {
  const d = parseISO(iso);
  return toISO(new Date(d.getFullYear(), d.getMonth() + 1, 0));
}
function fmtDate(iso, withYear = 'auto') {
  if (!isISO(iso)) return '';
  const d = parseISO(iso);
  const showYear = withYear === true || (withYear === 'auto' && d.getFullYear() !== new Date().getFullYear());
  return `${d.getDate()} ${MONTHS_GEN[d.getMonth()]}${showYear ? ` ${d.getFullYear()}` : ''}`;
}
function fmtDateShort(iso) {
  if (!isISO(iso)) return '';
  const d = parseISO(iso);
  const y = d.getFullYear() !== new Date().getFullYear() ? ` ${d.getFullYear()}` : '';
  return `${d.getDate()}${NBSP}${MONTHS_SHORT[d.getMonth()]}${y}`;
}
function fmtDateNum(iso) {
  if (!isISO(iso)) return '';
  const d = parseISO(iso);
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
}
function fmtMonthNum(iso) {
  if (!isISO(iso)) return '';
  const d = parseISO(iso);
  return `${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
}
const fmtMonthYear = (iso) => `${cap(MONTHS_NOM[parseISO(iso).getMonth()])} ${parseISO(iso).getFullYear()}`;
function relDay(iso) {
  const n = daysBetween(todayISO(), iso);
  if (n === 0) return 'сегодня';
  if (n === 1) return 'завтра';
  if (n === -1) return 'вчера';
  if (n > 1) return `через ${pl(n, 'день', 'дня', 'дней')}`;
  return `${pl(-n, 'день', 'дня', 'дней')} назад`;
}
function dayHeader(iso) {
  const n = daysBetween(iso, todayISO());
  const base = fmtDate(iso);
  if (n === 0) return `Сегодня, ${base}`;
  if (n === 1) return `Вчера, ${base}`;
  return `${cap(base)}, ${WEEKDAYS[parseISO(iso).getDay()]}`;
}
function ageOn(birthISO, onISO = todayISO()) {
  return Math.floor(monthsBetween(birthISO, onISO) / 12);
}

// ── Телефоны: храним +7XXXXXXXXXX ──
function normPhone(s) {
  let d = String(s || '').replace(/\D/g, '');
  if (d.length === 11 && d[0] === '8') d = `7${d.slice(1)}`;
  if (d.length === 10 && d[0] === '9') d = `7${d}`;
  return d ? `+${d}` : '';
}
function fmtPhone(p) {
  const d = String(p || '').replace(/\D/g, '');
  if (d.length === 11 && d[0] === '7') return `+7${NBSP}${d.slice(1, 4)}${NBSP}${d.slice(4, 7)}-${d.slice(7, 9)}-${d.slice(9)}`;
  return p || '';
}
function phoneQueryDigits(q) {
  let d = String(q || '').replace(/\D/g, '');
  if (d.length >= 4 && d[0] === '8') d = `7${d.slice(1)}`;
  return d;
}

// Детерминированный генератор для демо-данных
function mulberry32(seed) {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function download(name, text, type = 'application/json') {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1000);
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (e) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (err) { ok = false; }
    ta.remove();
    return ok;
  }
}
