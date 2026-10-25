// Запуск.

async function init() {
  bindEvents();
  bindIdle();
  await PhotoDB.loadAll();
  S = loadState();
  if (!S) {
    S = buildDemo();
    saveState({ silent: true });
  } else {
    migrate(S);
    reindex();
  }
  applyTheme();
  if (!location.hash) history.replaceState(null, '', '#/clients');
  render();
  showLock();
  setInterval(renderSyncBits, 30000);
  window.addEventListener('resize', () => {
    if ($('#print-root').classList.contains('show')) fitPrint();
    renderGuidePanel();
  });
  window.addEventListener('online', () => markDirty());
  window.addEventListener('offline', () => { sync.status = 'offline'; renderSyncBits(); });
  const mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  if (mq && mq.addEventListener) mq.addEventListener('change', applyTheme);
  // Для отладки из консоли
  window.ketsal = { state: () => S, reset: () => { localStorage.removeItem(LS_KEY); location.reload(); } };
}

init();
