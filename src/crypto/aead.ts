// Зашифрованный конверт (SPEC §5.2): "KTS1" | версия (1 байт) | IV (12 байт) | шифротекст + тег GCM (16 байт).
// AAD привязывает шифротекст к месту: хранилище, вид объекта, id и ревизия.
import { buf, concat, randomBytes, utf8 } from './bytes';

const MAGIC = utf8('KTS1');
const VERSION = 1;
const IV_LEN = 12;
const TAG_LEN = 16;
const HEADER = MAGIC.length + 1 + IV_LEN;

export type ObjectKind = 'shard' | 'catalog' | 'photo' | 'thumb' | 'verifier' | 'token';

/** Шифротекст не открылся: неверный ключ, подмена байта, чужой AAD или откат ревизии. */
export class DecryptError extends Error {
  constructor(message = 'decrypt failed') {
    super(message);
    this.name = 'DecryptError';
  }
}

export const aadFor = (vaultId: string, kind: ObjectKind, objectId: string, rev: number): string =>
  `${vaultId}|${kind}|${objectId}|${rev}`;

/** Зашифровать. IV — новый случайный на каждый вызов. */
export async function seal(key: CryptoKey, plain: Uint8Array, aad: string): Promise<Uint8Array> {
  const iv = randomBytes(IV_LEN);
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: buf(iv), additionalData: buf(utf8(aad)), tagLength: TAG_LEN * 8 },
    key,
    buf(plain),
  );
  return concat(MAGIC, new Uint8Array([VERSION]), iv, new Uint8Array(ct));
}

/** Расшифровать конверт; при любой несостыковке — DecryptError. */
export async function open(key: CryptoKey, env: Uint8Array, aad: string): Promise<Uint8Array> {
  if (env.length < HEADER + TAG_LEN) throw new DecryptError('too short');
  for (let i = 0; i < MAGIC.length; i += 1) if (env[i] !== MAGIC[i]) throw new DecryptError('bad magic');
  if (env[MAGIC.length] !== VERSION) throw new DecryptError('bad version');
  const iv = env.subarray(MAGIC.length + 1, HEADER);
  try {
    const pt = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: buf(iv), additionalData: buf(utf8(aad)), tagLength: TAG_LEN * 8 },
      key,
      buf(env.subarray(HEADER)),
    );
    return new Uint8Array(pt);
  } catch {
    throw new DecryptError();
  }
}
