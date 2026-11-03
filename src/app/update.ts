// Обновление приложения (SPEC §11): service worker хранит все файлы приложения, поэтому оно
// открывается и без сети. Новая версия не включается молча — появляется «Доступна новая версия → Обновить».
import { registerSW } from 'virtual:pwa-register';
import { create } from 'zustand';

interface UpdateState {
  /** Новая версия скачана и ждёт */
  ready: boolean;
  apply(): void;
}

let updateSW: ((reload?: boolean) => Promise<void>) | null = null;

export const useUpdate = create<UpdateState>(() => ({
  ready: false,
  apply() {
    // Новая версия берёт страницу под управление — перезагружаемся. Если сигнал не пришёл
    // (новая версия уже включилась), перезагружаемся всё равно: файлы новой версии уже в кэше
    navigator.serviceWorker?.addEventListener('controllerchange', () => window.location.reload(), { once: true });
    void updateSW?.(true);
    setTimeout(() => window.location.reload(), 3000);
  },
}));

const HOUR = 60 * 60 * 1000;

/** Зарегистрировать service worker (только в прод-сборке) и проверять обновления раз в час и при возврате. */
export function startUpdates() {
  if (import.meta.env.DEV || !('serviceWorker' in navigator)) return;
  updateSW = registerSW({
    immediate: true,
    onNeedRefresh() {
      useUpdate.setState({ ready: true });
    },
    onRegisteredSW(_url, reg) {
      if (!reg) return;
      setInterval(() => void reg.update().catch(() => undefined), HOUR);
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden) void reg.update().catch(() => undefined);
      });
    },
  });
}
