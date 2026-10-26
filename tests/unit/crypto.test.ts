import { describe, expect, it } from 'vitest';
import { passwordStrength } from '../../src/domain/password';
import { aadFor, DecryptError, open, seal } from '../../src/crypto/aead';
import { fromUtf8, utf8 } from '../../src/crypto/bytes';
import { decodeRecovery, encodeRecovery, generateRecovery, groupRecovery, RECOVERY_CHARS } from '../../src/crypto/keys';
import {
  createVault,
  setPassword,
  unlockWithPassword,
  unlockWithRecovery,
  WrongSecretError,
} from '../../src/crypto/vault';

// Меньше итераций, чтобы тесты шли быстро; формат и алгоритмы те же
const IT = 2_000;
const VID = '01JTESTVAULT';

describe('конверт AES-GCM', () => {
  it('туда и обратно', async () => {
    const { dek } = await createVault('пароль', VID, '2026-10-26', IT);
    const aad = aadFor(VID, 'shard', '03', 7);
    const env = await seal(dek, utf8('Анна Смирнова'), aad);
    expect(fromUtf8(env.subarray(0, 4))).toBe('KTS1');
    expect(env[4]).toBe(1);
    expect(fromUtf8(await open(dek, env, aad))).toBe('Анна Смирнова');
  });

  it('подмена одного байта шифротекста — ошибка', async () => {
    const { dek } = await createVault('пароль', VID, '2026-10-26', IT);
    const aad = aadFor(VID, 'shard', '03', 7);
    const env = await seal(dek, utf8('данные'), aad);
    for (const i of [5, 20, env.length - 1]) {
      const bad = env.slice();
      bad[i] ^= 1;
      await expect(open(dek, bad, aad)).rejects.toBeInstanceOf(DecryptError);
    }
  });

  it('чужой AAD и откат ревизии — ошибка', async () => {
    const { dek } = await createVault('пароль', VID, '2026-10-26', IT);
    const env = await seal(dek, utf8('данные'), aadFor(VID, 'shard', '03', 7));
    await expect(open(dek, env, aadFor(VID, 'shard', '04', 7))).rejects.toBeInstanceOf(DecryptError);
    await expect(open(dek, env, aadFor(VID, 'shard', '03', 6))).rejects.toBeInstanceOf(DecryptError);
    await expect(open(dek, env, aadFor('OTHER', 'shard', '03', 7))).rejects.toBeInstanceOf(DecryptError);
    await expect(open(dek, env, aadFor(VID, 'catalog', '03', 7))).rejects.toBeInstanceOf(DecryptError);
  });

  it('IV не повторяется', async () => {
    const { dek } = await createVault('пароль', VID, '2026-10-26', IT);
    const seen = new Set<string>();
    for (let i = 0; i < 2000; i += 1) {
      const env = await seal(dek, utf8('x'), 'a');
      seen.add(Array.from(env.subarray(5, 17)).join(','));
    }
    expect(seen.size).toBe(2000);
  });

  it('обрезанный или чужой формат — ошибка', async () => {
    const { dek } = await createVault('пароль', VID, '2026-10-26', IT);
    await expect(open(dek, new Uint8Array(10), 'a')).rejects.toBeInstanceOf(DecryptError);
    const env = await seal(dek, utf8('x'), 'a');
    env[0] = 0;
    await expect(open(dek, env, 'a')).rejects.toBeInstanceOf(DecryptError);
  });
});

describe('хранилище и ключи', () => {
  it('vault.json без секретов, DEK неизвлекаемый', async () => {
    const { header, dek, recovery } = await createVault('Верный-пароль-2026', VID, '2026-10-26', IT);
    const json = JSON.stringify(header);
    expect(json).not.toContain('Верный-пароль');
    expect(json).not.toContain(recovery);
    expect(header.kdf).toMatchObject({ alg: 'PBKDF2-SHA256', iterations: IT });
    expect(dek.extractable).toBe(false);
    await expect(crypto.subtle.exportKey('raw', dek)).rejects.toThrow();
  });

  it('по паролю открывается то, что зашифровано при создании', async () => {
    const v = await createVault('Верный-пароль-2026', VID, '2026-10-26', IT);
    const env = await seal(v.dek, utf8('карта № 1'), 'x');
    const dek = await unlockWithPassword(v.header, 'Верный-пароль-2026');
    expect(fromUtf8(await open(dek, env, 'x'))).toBe('карта № 1');
    expect(dek.extractable).toBe(false);
  });

  it('неверный пароль — WrongSecretError', async () => {
    const v = await createVault('Верный-пароль-2026', VID, '2026-10-26', IT);
    await expect(unlockWithPassword(v.header, 'верный-пароль-2026')).rejects.toBeInstanceOf(WrongSecretError);
  });

  it('ключ восстановления открывает данные и позволяет задать новый пароль', async () => {
    const v = await createVault('Верный-пароль-2026', VID, '2026-10-26', IT);
    const env = await seal(v.dek, utf8('фото'), 'x');
    const typed = groupRecovery(v.recovery).join('-').toLowerCase();
    const dek = await unlockWithRecovery(v.header, typed);
    expect(fromUtf8(await open(dek, env, 'x'))).toBe('фото');
    const h2 = await setPassword(v.header, { recovery: typed }, 'Новый-пароль-77');
    await expect(unlockWithPassword(h2, 'Верный-пароль-2026')).rejects.toBeInstanceOf(WrongSecretError);
    const dek2 = await unlockWithPassword(h2, 'Новый-пароль-77');
    expect(fromUtf8(await open(dek2, env, 'x'))).toBe('фото');
  });

  it('неверный ключ восстановления — WrongSecretError', async () => {
    const v = await createVault('Верный-пароль-2026', VID, '2026-10-26', IT);
    const other = encodeRecovery(generateRecovery());
    await expect(unlockWithRecovery(v.header, other)).rejects.toBeInstanceOf(WrongSecretError);
    await expect(unlockWithRecovery(v.header, 'ABCD')).rejects.toBeInstanceOf(WrongSecretError);
  });

  it('смена пароля сохраняет доступ и не трогает ключ восстановления', async () => {
    const v = await createVault('Старый-пароль-1', VID, '2026-10-26', IT);
    const env = await seal(v.dek, utf8('процедура'), 'x');
    const h2 = await setPassword(v.header, { password: 'Старый-пароль-1' }, 'Новый-пароль-2');
    expect(h2.kdf.salt).not.toBe(v.header.kdf.salt);
    expect(h2.wrappedDek.recovery).toEqual(v.header.wrappedDek.recovery);
    const dek = await unlockWithPassword(h2, 'Новый-пароль-2');
    expect(fromUtf8(await open(dek, env, 'x'))).toBe('процедура');
    expect(fromUtf8(await open(await unlockWithRecovery(h2, v.recovery), env, 'x'))).toBe('процедура');
    await expect(setPassword(v.header, { password: 'не тот' }, 'x')).rejects.toBeInstanceOf(WrongSecretError);
  });

  it('подмена обёртки в vault.json — ошибка входа', async () => {
    const v = await createVault('Верный-пароль-2026', VID, '2026-10-26', IT);
    const other = await createVault('Верный-пароль-2026', VID, '2026-10-26', IT);
    const mixed = { ...v.header, verifier: other.header.verifier };
    await expect(unlockWithPassword(mixed, 'Верный-пароль-2026')).rejects.toThrow();
  });
});

describe('ключ восстановления: кодирование', () => {
  it('52 символа без путающихся, туда и обратно', () => {
    for (let i = 0; i < 200; i += 1) {
      const raw = generateRecovery();
      const code = encodeRecovery(raw);
      expect(code).toHaveLength(RECOVERY_CHARS);
      expect(code).toMatch(/^[A-HJ-NP-Z2-9]+$/);
      expect(decodeRecovery(code)).toEqual(raw);
      expect(decodeRecovery(groupRecovery(code).join(' ').toLowerCase())).toEqual(raw);
    }
    expect(decodeRecovery('ABC')).toBeNull();
  });

  it('тест-вектор', () => {
    const raw = new Uint8Array(32).map((_, i) => i);
    const code = encodeRecovery(raw);
    expect(code).toBe(encodeRecovery(raw));
    // Байты 00 01 02 03 04 → индексы 0,0,0,16,4,0,24,4 в нашем алфавите
    expect(code.slice(0, 8)).toBe('AAASEA2E');
    expect(decodeRecovery(code)).toEqual(raw);
  });

  it('надёжность пароля', () => {
    expect(passwordStrength('')).toBe(0);
    expect(passwordStrength('коротко')).toBe(0);
    expect(passwordStrength('Длинная фраза 2026!')).toBe(5);
  });
});
