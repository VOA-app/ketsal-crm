// ZIP без сжатия (stored) для резервной копии и открытой выгрузки (SPEC §9).
//
// Свой небольшой писатель и читатель вместо zipSync из fflate: копия с фото может весить сотни мегабайт,
// а на iPhone мало памяти. Писатель складывает части в Blob (браузер держит его вне памяти JS),
// читатель берёт файлы по одному через Blob.slice по центральному каталогу.
// Ограничения: без ZIP64 (до 4 ГБ и 65 535 файлов) — для этой базы с запасом.

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i += 1) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Дата и время в формате MS-DOS (местное время). */
function dosTime(d: Date): [number, number] {
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2);
  const date = (Math.max(0, d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  return [time, date];
}

const UTF8_FLAG = 0x0800;
const MAX_U32 = 0xffffffff;

export class ZipWriter {
  private parts: BlobPart[] = [];
  private pending: Uint8Array[] = [];
  private pendingBytes = 0;
  private central: Uint8Array[] = [];
  private offset = 0;
  private count = 0;
  private readonly time: number;
  private readonly date: number;

  constructor(now = new Date()) {
    [this.time, this.date] = dosTime(now);
  }

  /** Добавить файл. Данные копируются в Blob частями — исходный массив можно отпустить. */
  add(name: string, data: Uint8Array) {
    const nameBytes = new TextEncoder().encode(name);
    if (this.offset + data.length + nameBytes.length + 30 > MAX_U32) throw new Error('zip too large');
    const crc = crc32(data);
    const local = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, UTF8_FLAG, true);
    lv.setUint16(8, 0, true); // без сжатия
    lv.setUint16(10, this.time, true);
    lv.setUint16(12, this.date, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, data.length, true);
    lv.setUint32(22, data.length, true);
    lv.setUint16(26, nameBytes.length, true);
    local.set(nameBytes, 30);

    const cen = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(cen.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, UTF8_FLAG, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, this.time, true);
    cv.setUint16(14, this.date, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, data.length, true);
    cv.setUint32(24, data.length, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint32(42, this.offset, true);
    cen.set(nameBytes, 46);
    this.central.push(cen);

    this.push(local);
    this.push(data.slice());
    this.offset += local.length + data.length;
    this.count += 1;
  }

  private push(b: Uint8Array) {
    this.pending.push(b);
    this.pendingBytes += b.length;
    // Время от времени сворачиваем части в Blob, чтобы они не копились в памяти JS
    if (this.pendingBytes > 8 * 1024 * 1024) this.flush();
  }

  private flush() {
    if (!this.pending.length) return;
    this.parts.push(new Blob(this.pending as BlobPart[]));
    this.pending = [];
    this.pendingBytes = 0;
  }

  finish(type = 'application/zip'): Blob {
    if (this.count > 0xffff) throw new Error('zip too many files');
    const cenSize = this.central.reduce((n, c) => n + c.length, 0);
    const end = new Uint8Array(22);
    const ev = new DataView(end.buffer);
    ev.setUint32(0, 0x06054b50, true);
    ev.setUint16(8, this.count, true);
    ev.setUint16(10, this.count, true);
    ev.setUint32(12, cenSize, true);
    ev.setUint32(16, this.offset, true);
    for (const c of this.central) this.push(c);
    this.push(end);
    this.flush();
    return new Blob(this.parts, { type });
  }
}

export interface ZipEntry {
  name: string;
  size: number;
  crc: number;
  /** Смещение локального заголовка */
  offset: number;
}

export class ZipFormatError extends Error {
  constructor() {
    super('zip format');
    this.name = 'ZipFormatError';
  }
}

const bytesOf = async (b: Blob) => new Uint8Array(await b.arrayBuffer());

/** Читатель ZIP без сжатия: оглавление сразу, файлы — по одному. */
export class ZipReader {
  private constructor(
    private readonly blob: Blob,
    readonly entries: Map<string, ZipEntry>,
  ) {}

  static async open(blob: Blob): Promise<ZipReader> {
    // Конец центрального каталога — в последних 22 + 65 535 байтах (комментарий)
    const tailStart = Math.max(0, blob.size - 22 - 0xffff);
    const tail = await bytesOf(blob.slice(tailStart));
    const tv = new DataView(tail.buffer, tail.byteOffset, tail.byteLength);
    let eocd = -1;
    for (let i = tail.length - 22; i >= 0; i -= 1) {
      if (tv.getUint32(i, true) === 0x06054b50) {
        eocd = i;
        break;
      }
    }
    if (eocd < 0) throw new ZipFormatError();
    const count = tv.getUint16(eocd + 10, true);
    const cenSize = tv.getUint32(eocd + 12, true);
    const cenOffset = tv.getUint32(eocd + 16, true);
    if (cenOffset + cenSize > blob.size) throw new ZipFormatError();
    const cen = await bytesOf(blob.slice(cenOffset, cenOffset + cenSize));
    const cv = new DataView(cen.buffer, cen.byteOffset, cen.byteLength);
    const entries = new Map<string, ZipEntry>();
    let p = 0;
    for (let i = 0; i < count; i += 1) {
      if (p + 46 > cen.length || cv.getUint32(p, true) !== 0x02014b50) throw new ZipFormatError();
      const method = cv.getUint16(p + 10, true);
      const crc = cv.getUint32(p + 16, true);
      const csize = cv.getUint32(p + 20, true);
      const size = cv.getUint32(p + 24, true);
      const nameLen = cv.getUint16(p + 28, true);
      const extraLen = cv.getUint16(p + 30, true);
      const commentLen = cv.getUint16(p + 32, true);
      const offset = cv.getUint32(p + 42, true);
      const name = new TextDecoder().decode(cen.subarray(p + 46, p + 46 + nameLen));
      if (method !== 0 || csize !== size) throw new ZipFormatError();
      if (!name.endsWith('/')) entries.set(name, { name, size, crc, offset });
      p += 46 + nameLen + extraLen + commentLen;
    }
    return new ZipReader(blob, entries);
  }

  has(name: string): boolean {
    return this.entries.has(name);
  }

  /** Содержимое файла; контрольная сумма CRC проверяется. */
  async read(name: string): Promise<Uint8Array> {
    const e = this.entries.get(name);
    if (!e) throw new ZipFormatError();
    const head = await bytesOf(this.blob.slice(e.offset, e.offset + 30));
    const hv = new DataView(head.buffer);
    if (head.length < 30 || hv.getUint32(0, true) !== 0x04034b50) throw new ZipFormatError();
    const start = e.offset + 30 + hv.getUint16(26, true) + hv.getUint16(28, true);
    const data = await bytesOf(this.blob.slice(start, start + e.size));
    if (data.length !== e.size || crc32(data) !== e.crc) throw new ZipFormatError();
    return data;
  }
}
