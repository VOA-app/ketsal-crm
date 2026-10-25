// Хранилище заглушки: данные — в localStorage этого браузера, фото — в IndexedDB.
// В настоящем приложении здесь будет шифрование и синхронизация с Яндекс Диском (SPEC §5–7).

const LS_KEY = 'ketsal-crm-demo-v1';
const LS_GUIDE = 'ketsal-crm-guide-v1';
let S = null;

function loadState() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    return s && s.version === 1 && Array.isArray(s.clients) ? s : null;
  } catch (e) {
    return null;
  }
}

// Досоздаём разделы, которых не было в ранее сохранённых данных
function migrate(s) {
  if (!Array.isArray(s.expenses)) s.expenses = s.meta && s.meta.demo ? demoExpenses(todayISO()) : [];
  if (!s.lists.expenseCategories) s.lists.expenseCategories = defaultLists().expenseCategories;
  return s;
}

function saveState(opts = {}) {
  reindex();
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(S));
  } catch (e) {
    toast('Не удалось сохранить: память браузера заполнена');
  }
  if (!opts.silent) markDirty();
}

// ── Фото ──
const PhotoDB = (() => {
  let db = null;
  const mem = new Map();
  const open = () => new Promise((resolve) => {
    try {
      const req = indexedDB.open('ketsal-crm-photos', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('photos', { keyPath: 'id' });
      req.onsuccess = () => { db = req.result; resolve(); };
      req.onerror = () => resolve();
      req.onblocked = () => resolve();
    } catch (e) {
      resolve();
    }
  });
  async function loadAll() {
    await open();
    if (!db) return;
    await new Promise((resolve) => {
      try {
        const req = db.transaction('photos', 'readonly').objectStore('photos').getAll();
        req.onsuccess = () => { for (const p of req.result || []) mem.set(p.id, p.data); resolve(); };
        req.onerror = () => resolve();
      } catch (e) {
        resolve();
      }
    });
  }
  const tx = (fn) => {
    if (!db) return;
    try { fn(db.transaction('photos', 'readwrite').objectStore('photos')); } catch (e) { /* фото останется только в памяти */ }
  };
  return {
    loadAll,
    get: (id) => mem.get(id),
    put(id, data) { mem.set(id, data); tx((st) => st.put({ id, data })); },
    del(id) { if (!id || String(id).startsWith('demo:')) return; mem.delete(id); tx((st) => st.delete(id)); },
    clear() { mem.clear(); tx((st) => st.clear()); },
    entries: () => Array.from(mem.entries()),
  };
})();

function photoSrc(id) {
  if (!id) return '';
  if (String(id).startsWith('demo:')) return demoPhoto(id);
  return PhotoDB.get(id) || demoPhoto('demo:doc:doc:1');
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

// Перерисовка через canvas: уменьшаем до 1600 px и заодно удаляем EXIF с геометкой (SPEC §8)
async function processPhoto(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    const max = 1600;
    const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * k));
    const h = Math.max(1, Math.round(img.naturalHeight * k));
    const cv = document.createElement('canvas');
    cv.width = w;
    cv.height = h;
    cv.getContext('2d').drawImage(img, 0, 0, w, h);
    const id = uid('ph');
    PhotoDB.put(id, cv.toDataURL('image/jpeg', 0.82));
    return id;
  } finally {
    URL.revokeObjectURL(url);
  }
}

let fileHandler = null;
function pickPhotos(onDone, multiple = true) {
  const inp = $('#file-input');
  inp.multiple = multiple;
  inp.value = '';
  fileHandler = onDone;
  inp.click();
}
async function onFilesPicked(e) {
  const files = Array.from(e.target.files || []);
  const handler = fileHandler;
  fileHandler = null;
  if (!handler || !files.length) return;
  const ids = [];
  for (const f of files) {
    try {
      ids.push(await processPhoto(f));
    } catch (err) {
      toast('Не получилось открыть фото. В заглушке на компьютере формат HEIC не читается');
    }
  }
  if (ids.length) handler(ids);
}

// ── Имитация синхронизации с Яндекс Диском ──
const sync = { status: 'ok', at: Date.now() };
let syncTimer = null;
function markDirty() {
  sync.status = 'pending';
  renderSyncBits();
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => {
    sync.status = navigator.onLine === false ? 'offline' : 'ok';
    sync.at = Date.now();
    renderSyncBits();
  }, 1300);
}
function syncText() {
  if (sync.status === 'pending') return 'Сохраняем на Яндекс Диск…';
  if (sync.status === 'offline') return 'Нет сети. Изменения сохранены на телефоне';
  const min = Math.floor((Date.now() - sync.at) / 60000);
  return `Синхронизировано ${min < 1 ? 'только что' : `${pl(min, 'минуту', 'минуты', 'минут')} назад`}`;
}
function renderSyncBits() {
  for (const el of $$('[data-sync-text]')) el.textContent = syncText();
  for (const el of $$('[data-sync-icon]')) el.dataset.state = sync.status;
}

// ── Отметки в списке сценариев ──
function guideChecks() {
  try { return JSON.parse(localStorage.getItem(LS_GUIDE) || '{}'); } catch (e) { return {}; }
}
function setGuideCheck(id, on) {
  const g = guideChecks();
  if (on) g[id] = 1; else delete g[id];
  try { localStorage.setItem(LS_GUIDE, JSON.stringify(g)); } catch (e) { /* не критично */ }
}
