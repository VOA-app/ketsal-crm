// Обработка фото перед сохранением (SPEC §8): декодирование, уменьшение, превью.
// Перерисовка через canvas удаляет весь EXIF, включая геометку. Фото обрабатываются по одному,
// ImageBitmap освобождается сразу: на iPhone мало памяти.
import { ulid } from '../domain/ids';
import type { PhotoRef } from '../domain/types';

export interface ProcessedPhoto {
  ref: PhotoRef;
  full: Blob;
  thumb: Blob;
}

const THUMB_SIDE = 400;

async function decode(file: Blob): Promise<ImageBitmap | HTMLImageElement> {
  try {
    return await createImageBitmap(file);
  } catch {
    // Запасной путь — через <img> (старые браузеры, редкие форматы)
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      return img;
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}

function draw(src: ImageBitmap | HTMLImageElement, w: number, h: number): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const ctx = cv.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, 0, 0, w, h);
  return cv;
}

const toJpeg = (cv: HTMLCanvasElement, q: number) =>
  new Promise<Blob>((resolve, reject) => cv.toBlob((b) => (b ? resolve(b) : reject(new Error('encode'))), 'image/jpeg', q));

const fit = (w: number, h: number, max: number) => {
  const k = Math.min(1, max / Math.max(w, h));
  return [Math.max(1, Math.round(w * k)), Math.max(1, Math.round(h * k))] as const;
};

export async function processPhoto(file: Blob, maxSide: number): Promise<ProcessedPhoto> {
  const src = await decode(file);
  try {
    const sw = 'naturalWidth' in src ? src.naturalWidth : src.width;
    const sh = 'naturalHeight' in src ? src.naturalHeight : src.height;
    const [w, h] = fit(sw, sh, maxSide);
    const full = await toJpeg(draw(src, w, h), 0.85);
    const [tw, th] = fit(sw, sh, THUMB_SIDE);
    const thumb = await toJpeg(draw(src, tw, th), 0.75);
    return { ref: { blobId: ulid(), thumbId: ulid(), width: w, height: h, bytes: full.size }, full, thumb };
  } finally {
    if ('close' in src) src.close();
  }
}
