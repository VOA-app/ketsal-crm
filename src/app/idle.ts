// Автоблокировка (SPEC §5.4): сам ключ стирает store.lock(), здесь — только таймеры и события.

/** Блокировка без касаний, через N минут; и при уходе в фон дольше минуты. */
export function watchIdle(minutes: number, onLock: () => void): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let hiddenAt = 0;
  let last = 0;
  const reset = () => {
    clearTimeout(timer);
    if (minutes > 0) timer = setTimeout(onLock, minutes * 60_000);
  };
  const poke = () => {
    const now = Date.now();
    if (now - last < 1000) return;
    last = now;
    reset();
  };
  const onVisibility = () => {
    if (document.hidden) hiddenAt = Date.now();
    else if (hiddenAt && minutes > 0 && Date.now() - hiddenAt > 60_000) onLock();
    else reset();
  };
  const events = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const;
  events.forEach((e) => document.addEventListener(e, poke, { passive: true }));
  document.addEventListener('visibilitychange', onVisibility);
  reset();
  return () => {
    clearTimeout(timer);
    events.forEach((e) => document.removeEventListener(e, poke));
    document.removeEventListener('visibilitychange', onVisibility);
  };
}
