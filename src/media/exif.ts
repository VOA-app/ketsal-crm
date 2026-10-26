// Дата съёмки из EXIF (SPEC §8, шаг 3). Читается только она, до перерисовки, которая удаляет весь EXIF.
// Остальные поля (геометка, камера) не разбираются и никуда не попадают.

const TAG_EXIF_IFD = 0x8769;
const TAG_DATE_TIME = 0x0132;
const TAG_DATE_ORIGINAL = 0x9003;

/** «2026:03:12 14:05:09» → «2026-03-12T14:05:09» (местное время камеры, без пояса). */
function normalize(s: string): string | undefined {
  const m = /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(s);
  if (!m || m[1] === '0000') return undefined;
  return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}`;
}

/** Дата съёмки из JPEG или undefined, если её нет или файл не JPEG. */
export function exifTakenAt(bytes: Uint8Array): string | undefined {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (dv.byteLength < 4 || dv.getUint16(0) !== 0xffd8) return undefined;
  let pos = 2;
  while (pos + 4 <= dv.byteLength) {
    if (dv.getUint8(pos) !== 0xff) return undefined;
    const marker = dv.getUint8(pos + 1);
    // Начало сжатых данных: дальше заголовков нет
    if (marker === 0xda || marker === 0xd9) return undefined;
    const len = dv.getUint16(pos + 2);
    if (len < 2) return undefined;
    const start = pos + 4;
    if (marker === 0xe1 && start + 6 <= dv.byteLength && readAscii(dv, start, 6) === 'Exif\0\0') {
      return readTiff(dv, start + 6, Math.min(dv.byteLength, pos + 2 + len));
    }
    pos += 2 + len;
  }
  return undefined;
}

function readAscii(dv: DataView, at: number, n: number): string {
  let s = '';
  for (let i = 0; i < n && at + i < dv.byteLength; i += 1) s += String.fromCharCode(dv.getUint8(at + i));
  return s;
}

function readTiff(dv: DataView, base: number, end: number): string | undefined {
  if (base + 8 > end) return undefined;
  const order = dv.getUint16(base);
  if (order !== 0x4949 && order !== 0x4d4d) return undefined;
  const le = order === 0x4949;
  const u16 = (o: number) => dv.getUint16(base + o, le);
  const u32 = (o: number) => dv.getUint32(base + o, le);
  if (u16(2) !== 42) return undefined;

  /** Значение тега в каталоге (IFD): строка ASCII или смещение для указателя. */
  const find = (ifd: number, tag: number): { type: number; count: number; at: number } | null => {
    if (base + ifd + 2 > end) return null;
    const n = u16(ifd);
    for (let i = 0; i < n; i += 1) {
      const e = ifd + 2 + i * 12;
      if (base + e + 12 > end) return null;
      if (u16(e) === tag) return { type: u16(e + 2), count: u32(e + 4), at: e + 8 };
    }
    return null;
  };
  const ascii = (f: { type: number; count: number; at: number } | null) => {
    if (!f || f.type !== 2 || f.count < 19) return undefined;
    const off = f.count > 4 ? u32(f.at) : f.at;
    if (base + off + 19 > end) return undefined;
    return normalize(readAscii(dv, base + off, 19));
  };

  const ifd0 = u32(4);
  const exifPtr = find(ifd0, TAG_EXIF_IFD);
  if (exifPtr && exifPtr.type === 4) {
    const original = ascii(find(u32(exifPtr.at), TAG_DATE_ORIGINAL));
    if (original) return original;
  }
  return ascii(find(ifd0, TAG_DATE_TIME));
}
