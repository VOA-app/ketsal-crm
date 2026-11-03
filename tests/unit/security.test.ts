// Быстрый вход и смена пароля (SPEC §5.4, этап 6).
import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { disableQuick, enablePin, PIN_ATTEMPTS, quickMode, unlockPin } from '../../src/auth/quick';
import { aadFor, seal } from '../../src/crypto/aead';
import { generateDeviceKey } from '../../src/crypto/device';
import { unwrapForPin, unwrapForPrf, wrapForPin, wrapForPrf } from '../../src/crypto/quick';
import { createVault, passwordStamp, setPassword, unlockWithPassword, WrongSecretError } from '../../src/crypto/vault';
import { KetsalDB, setDb } from '../../src/db/local';
import { LocalStore } from '../../src/db/localStore';
import { fetchRemoteHeader, RemoteCorruptError, sync } from '../../src/sync/engine';
import { MockAdapter } from '../../src/sync/mockAdapter';
import { TODAY } from './fixtures';

const PW = 'Мастер-пароль-2026';
let n = 0;

async function extractable() {
  const v = await createVault(PW, `Q${(n += 1)}`, TODAY, 1000);
  return { header: v.header, dek: await unlockWithPassword(v.header, PW, true) };
}

/** Ключ открывает хранилище: проверочная строка шифруется и не ломается. */
const works = async (k: CryptoKey) => (await seal(k, new Uint8Array([1]), aadFor('x', 'shard', '00', 1))).length > 0;

describe('Face ID (PRF)', () => {
  it('секрет passkey открывает DEK, другой секрет — нет; ключ после входа неизвлекаемый', async () => {
    const { header, dek } = await extractable();
    const secret = crypto.getRandomValues(new Uint8Array(32));
    const w = await wrapForPrf(dek, secret);
    const back = await unwrapForPrf(w, secret, header);
    expect(back.extractable).toBe(false);
    expect(await works(back)).toBe(true);
    await expect(unwrapForPrf(w, crypto.getRandomValues(new Uint8Array(32)), header)).rejects.toBeInstanceOf(
      WrongSecretError,
    );
  });
});

describe('код из 6 цифр', () => {
  it('верный код открывает, неверный — нет; без ключа устройства обёртку не открыть', async () => {
    const { header, dek } = await extractable();
    const device = await generateDeviceKey();
    const w = await wrapForPin(dek, '204816', device, header.vaultId, 1000);
    expect(await works(await unwrapForPin(w, '204816', device, header))).toBe(true);
    await expect(unwrapForPin(w, '204817', device, header)).rejects.toBeInstanceOf(WrongSecretError);
    await expect(unwrapForPin(w, '204816', await generateDeviceKey(), header)).rejects.toThrow();
  });

  it(`после ${PIN_ATTEMPTS} ошибок код стирается, удачный вход сбрасывает счётчик`, async () => {
    setDb(new KetsalDB(`quick-${(n += 1)}`));
    const { header, dek } = await extractable();
    await enablePin(dek, '730195', header.vaultId);
    expect(await quickMode()).toBe('pin');
    expect(await unlockPin(header, '000001')).toEqual({ wrong: PIN_ATTEMPTS - 1 });
    expect(await unlockPin(header, '730195')).toHaveProperty('dek');
    for (let i = 1; i < PIN_ATTEMPTS; i += 1)
      expect(await unlockPin(header, '000001')).toEqual({ wrong: PIN_ATTEMPTS - i });
    expect(await unlockPin(header, '000001')).toEqual({ reset: true });
    expect(await quickMode()).toBe('password');
    // Верный код больше не поможет — нужен мастер-пароль
    expect(await unlockPin(header, '730195')).toEqual({ reset: true });
    await disableQuick();
  });
});

describe('смена мастер-пароля на другом устройстве', () => {
  it('новый vault.json уходит на Диск и сохраняется на втором устройстве', async () => {
    const remote = new MockAdapter();
    const v = await createVault(PW, `QV${(n += 1)}`, TODAY, 1000);
    const session = { dek: v.dek, vaultId: v.header.vaultId };
    const A = new LocalStore(new KetsalDB(`pa-${n}`), () => session);
    const B = new LocalStore(new KetsalDB(`pb-${n}`), () => session);
    await A.initEmpty();
    await B.initEmpty();
    await sync({ local: A, remote, session: () => session, header: v.header });

    const next = await setPassword(v.header, { password: PW }, 'Новый-пароль-2026', 1000, '2026-11-03T10:00:00.000Z');
    expect(passwordStamp(next) > passwordStamp(v.header)).toBe(true);
    await sync({ local: A, remote, session: () => session, header: next });
    expect((await fetchRemoteHeader(remote))!.passwordChangedAt).toBe(next.passwordChangedAt);

    let saved: typeof next | null = null;
    await sync({
      local: B,
      remote,
      session: () => session,
      header: v.header,
      saveHeader: async (h) => void (saved = h),
    });
    expect(saved!.passwordChangedAt).toBe(next.passwordChangedAt);
    await expect(unlockWithPassword(saved!, 'Новый-пароль-2026')).resolves.toBeDefined();
    await expect(unlockWithPassword(saved!, PW)).rejects.toBeInstanceOf(WrongSecretError);

    // Старый заголовок со старого устройства Диск не перезапишет
    await sync({ local: B, remote, session: () => session, header: v.header });
    expect((await fetchRemoteHeader(remote))!.passwordChangedAt).toBe(next.passwordChangedAt);
  });

  it('подменённый vault.json (чужая проверочная строка) не принимается', async () => {
    const remote = new MockAdapter();
    const v = await createVault(PW, `QX${(n += 1)}`, TODAY, 1000);
    const other = await createVault(PW, v.header.vaultId, TODAY, 1000);
    const session = { dek: v.dek, vaultId: v.header.vaultId };
    const A = new LocalStore(new KetsalDB(`px-${n}`), () => session);
    await A.initEmpty();
    const fake = { ...other.header, passwordChangedAt: '2030-01-01T00:00:00.000Z' };
    await remote.write('vault.json', new TextEncoder().encode(JSON.stringify(fake)));
    let saved = false;
    await expect(
      sync({ local: A, remote, session: () => session, header: v.header, saveHeader: async () => void (saved = true) }),
    ).rejects.toBeInstanceOf(RemoteCorruptError);
    expect(saved).toBe(false);
  });
});
