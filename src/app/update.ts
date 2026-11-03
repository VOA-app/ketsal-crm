// Service worker выключен (SPEC §11, 03.11.2026): Safari, пропуская через него запросы, отправляет
// на Диск лишнее, и скачивание файлов с Диска отклоняется. Приложение грузится из сети, новая
// версия приходит сама при следующем запуске. Здесь — уборка service worker'ов, оставшихся
// от версии этапа 6: на их адресе лежит версия, удаляющая себя, а страница снимает регистрацию сразу.
export function removeServiceWorkers() {
  if (import.meta.env.DEV || !('serviceWorker' in navigator)) return;
  void navigator.serviceWorker
    .getRegistrations()
    .then((regs) => Promise.all(regs.map((r) => r.unregister())))
    .catch(() => undefined);
}
