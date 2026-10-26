// Упаковка JSON перед шифрованием (SPEC §5.2): deflate, длина, дополнение до кратного 4 КБ,
// чтобы размер файла не выдавал, сколько в шарде записей.
import { deflateSync, inflateSync } from 'fflate';

const PAD = 4096;

export function pack(value: unknown): Uint8Array {
  const z = deflateSync(new TextEncoder().encode(JSON.stringify(value)), { level: 6 });
  const total = Math.ceil((z.length + 4) / PAD) * PAD;
  const out = new Uint8Array(total);
  new DataView(out.buffer).setUint32(0, z.length);
  out.set(z, 4);
  return out;
}

export function unpack<T>(bytes: Uint8Array): T {
  const len = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(0);
  if (len > bytes.length - 4) throw new Error('bad length');
  return JSON.parse(new TextDecoder().decode(inflateSync(bytes.subarray(4, 4 + len)))) as T;
}

/** Номер шарда записи: FNV-1a по id, 16 шардов (SPEC §4.5). */
export const SHARD_COUNT = 16;
export function shardOf(id: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i += 1) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return ((h >>> 0) % SHARD_COUNT).toString(16).padStart(2, '0');
}

export const SHARD_IDS = Array.from({ length: SHARD_COUNT }, (_, i) => i.toString(16).padStart(2, '0'));
