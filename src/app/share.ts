// Сохранение и выбор файлов: на iPhone — через «Поделиться» («Сохранить в Файлы», Телеграм),
// на ПК — обычной загрузкой. Вызывать из обработчика нажатия: Safari разрешает «Поделиться» только так.

// На ПК (Chrome в Windows тоже умеет «Поделиться») привычнее обычная загрузка — делимся только на телефоне
export const canShareFiles = (file: File): boolean =>
  typeof navigator.canShare === 'function' &&
  window.matchMedia('(pointer: coarse)').matches &&
  navigator.canShare({ files: [file] });

/** Можно ли передать файл через «Поделиться» — для подписи кнопки. */
export const shareAvailable = (): boolean => canShareFiles(new File([''], 'probe.bin'));

/** true — файл сохранён или передан; false — отменили. */
export async function saveFile(file: File): Promise<boolean> {
  if (canShareFiles(file)) {
    try {
      await navigator.share({ files: [file] });
      return true;
    } catch {
      return false;
    }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
    a.remove();
  }, 60_000);
  return true;
}

/** Выбрать один файл (любой тип: на iPhone фильтр по расширению прячет «.ketsal»). */
export function pickFile(): Promise<File | null> {
  return new Promise((resolve) => {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.onchange = () => resolve(inp.files?.[0] ?? null);
    inp.addEventListener('cancel', () => resolve(null));
    inp.click();
  });
}
