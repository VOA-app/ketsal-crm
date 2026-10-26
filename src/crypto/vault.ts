// Хранилище: vault.json (единственный открытый файл, SPEC §5.3), создание, вход по паролю
// и по ключу восстановления, смена пароля (перешифровывается только обёртка DEK).
import { aadFor, open, seal } from './aead';
import { fromB64, randomBytes, toB64, utf8 } from './bytes';
import { newKdfParams, passwordKek, recoveryKek, type KdfParams } from './kdf';
import {
  decodeRecovery,
  encodeRecovery,
  generateDek,
  generateRecovery,
  unwrapDek,
  wrapDek,
  type Wrapped,
} from './keys';

export interface VaultHeader {
  format: 'ketsal-vault';
  version: 1;
  vaultId: string;
  createdAt: string;
  kdf: KdfParams;
  wrappedDek: {
    password: Wrapped;
    recovery: Wrapped & { hkdfSalt: string };
  };
  /** Известная строка, зашифрованная DEK: подтверждает, что ключ верный */
  verifier: { env: string };
}

/** Неверный пароль или ключ восстановления. */
export class WrongSecretError extends Error {
  constructor() {
    super('wrong secret');
    this.name = 'WrongSecretError';
  }
}

const VERIFIER = 'ketsal-vault-verifier';

async function makeVerifier(dek: CryptoKey, vaultId: string) {
  return { env: toB64(await seal(dek, utf8(VERIFIER), aadFor(vaultId, 'verifier', 'vault', 1))) };
}

async function checkVerifier(dek: CryptoKey, header: VaultHeader) {
  const pt = await open(dek, fromB64(header.verifier.env), aadFor(header.vaultId, 'verifier', 'vault', 1));
  if (new TextDecoder().decode(pt) !== VERIFIER) throw new WrongSecretError();
}

export interface CreatedVault {
  header: VaultHeader;
  /** Неизвлекаемый DEK для работы */
  dek: CryptoKey;
  /** Ключ восстановления, 52 символа; показывается один раз */
  recovery: string;
}

export async function createVault(
  password: string,
  vaultId: string,
  now: string,
  iterations?: number,
): Promise<CreatedVault> {
  const kdf = newKdfParams(iterations);
  const rawDek = await generateDek();
  const recoveryBytes = generateRecovery();
  const hkdfSalt = toB64(randomBytes(16));
  const header: VaultHeader = {
    format: 'ketsal-vault',
    version: 1,
    vaultId,
    createdAt: now,
    kdf,
    wrappedDek: {
      password: await wrapDek(rawDek, await passwordKek(password, kdf)),
      recovery: { ...(await wrapDek(rawDek, await recoveryKek(recoveryBytes, hkdfSalt))), hkdfSalt },
    },
    verifier: await makeVerifier(rawDek, vaultId),
  };
  // Для работы — неизвлекаемая копия; извлекаемый ключ дальше не используется
  const dek = await unwrapDek(header.wrappedDek.password, await passwordKek(password, kdf));
  return { header, dek, recovery: encodeRecovery(recoveryBytes) };
}

async function unwrapChecked(header: VaultHeader, w: Wrapped, kek: CryptoKey, extractable: boolean) {
  let dek: CryptoKey;
  try {
    dek = await unwrapDek(w, kek, extractable);
  } catch {
    throw new WrongSecretError();
  }
  await checkVerifier(dek, header);
  return dek;
}

export async function unlockWithPassword(
  header: VaultHeader,
  password: string,
  extractable = false,
): Promise<CryptoKey> {
  return unwrapChecked(header, header.wrappedDek.password, await passwordKek(password, header.kdf), extractable);
}

export async function unlockWithRecovery(header: VaultHeader, code: string, extractable = false): Promise<CryptoKey> {
  const raw = decodeRecovery(code);
  if (!raw) throw new WrongSecretError();
  const w = header.wrappedDek.recovery;
  return unwrapChecked(header, w, await recoveryKek(raw, w.hkdfSalt), extractable);
}

/**
 * Новый мастер-пароль: DEK разворачивается старым секретом (паролем или ключом восстановления)
 * и заворачивается новым паролем с новой солью. Данные не перешифровываются.
 */
export async function setPassword(
  header: VaultHeader,
  secret: { password: string } | { recovery: string },
  newPassword: string,
  iterations?: number,
): Promise<VaultHeader> {
  const raw =
    'password' in secret
      ? await unlockWithPassword(header, secret.password, true)
      : await unlockWithRecovery(header, secret.recovery, true);
  const kdf = newKdfParams(iterations ?? header.kdf.iterations);
  return {
    ...header,
    kdf,
    wrappedDek: { ...header.wrappedDek, password: await wrapDek(raw, await passwordKek(newPassword, kdf)) },
  };
}
