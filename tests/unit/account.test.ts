// Доступ к Диску пропал или вошли в другой аккаунт Яндекса: данные не разъезжаются молча.
import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { createVault, unlockWithPassword } from '../../src/crypto/vault';
import { KetsalDB } from '../../src/db/local';
import { LocalStore } from '../../src/db/localStore';
import { STALE_SYNC_MS, syncAttention } from '../../src/domain/syncHealth';
import { fetchRemoteHeader, RemoteMissingError, sync } from '../../src/sync/engine';
import { MockAdapter } from '../../src/sync/mockAdapter';
import { TODAY, baseData, client, proc } from './fixtures';

const NOW = Date.parse('2026-11-08T12:00:00Z');
const ago = (ms: number) => new Date(NOW - ms).toISOString();

describe('когда показывать баннер о синхронизации', () => {
  it('нет доступа и пропавшее хранилище — сразу', () => {
    expect(syncAttention('auth', ago(60_000), NOW)).toEqual({ kind: 'auth' });
    expect(syncAttention('remoteMissing', ago(60_000), NOW)).toEqual({ kind: 'remoteMissing' });
  });

  it('прочие сбои и «нет сети» — когда синхронизации нет двое суток', () => {
    expect(syncAttention('offline', ago(STALE_SYNC_MS - 60_000), NOW)).toBeNull();
    expect(syncAttention('offline', ago(STALE_SYNC_MS + 60_000), NOW)).toEqual({ kind: 'stale', days: 2 });
    expect(syncAttention('error', ago(5 * 24 * 3600_000), NOW)).toEqual({ kind: 'stale', days: 5 });
  });

  it('всё хорошо, не подключён, нет места (свой баннер) или синхронизаций ещё не было — молчим', () => {
    for (const s of ['ok', 'off', 'syncing', 'noSpace'])
      expect(syncAttention(s, ago(9 * 24 * 3600_000), NOW)).toBeNull();
    expect(syncAttention('offline', '', NOW)).toBeNull();
  });
});

describe('вход в другой аккаунт Яндекса', () => {
  let n = 0;
  const PW = 'Аккаунт-пароль-2026';

  async function syncedDevice() {
    n += 1;
    const salon = new MockAdapter();
    const v = await createVault(PW, `AC${n}`, TODAY, 1000);
    const session = { dek: v.dek, vaultId: v.header.vaultId };
    const local = new LocalStore(new KetsalDB(`account-${n}`), () => session);
    const D = baseData();
    const c = client(D, { id: 'c1' });
    proc(D, c, 10, { id: 'p1' });
    client(D, { id: 'c2' });
    await local.replaceAll(D);
    const run = (remote: MockAdapter, allowNewRemote = false) =>
      sync({ local, remote, session: () => session, header: v.header, allowNewRemote });
    await run(salon);
    return { salon, local, run };
  }

  it('пустой Диск после прежних синхронизаций — стоп, на чужой Диск ничего не пишется', async () => {
    const d = await syncedDevice();
    const personal = new MockAdapter();
    await expect(d.run(personal)).rejects.toBeInstanceOf(RemoteMissingError);
    expect(personal.files.size).toBe(0);
    // Вернулись в свой аккаунт — синхронизация как обычно
    await d.run(d.salon);
  });

  it('«Хранить данные здесь»: всё уходит на новый Диск, второе устройство подключается к нему', async () => {
    const d = await syncedDevice();
    await d.local.putBlobs([{ id: 'phB', blob: new Blob(['orig']), kind: 'photo' }]);
    await d.local.markUploaded('phB');
    const personal = new MockAdapter();
    expect(await d.local.requeueAllPhotos()).toBe(1);
    expect(await d.local.uploadQueue()).toEqual(['phB']);
    await d.run(personal, true);
    // Дальше — обычная синхронизация с новым Диском
    await d.run(personal);
    const header = (await fetchRemoteHeader(personal))!;
    const B = new LocalStore(new KetsalDB(`account-b-${n}`), () => ({ dek, vaultId: header.vaultId }));
    const dek = await unlockWithPassword(header, PW);
    await B.initEmpty();
    await sync({ local: B, remote: personal, session: () => ({ dek, vaultId: header.vaultId }), header });
    expect(
      B.data(TODAY)
        .clients.map((c) => c.id)
        .sort(),
    ).toEqual(['c1', 'c2']);
    expect(B.data(TODAY).procedures.map((p) => p.id)).toEqual(['p1']);
  });

  it('нет только vault.json, а каталог на месте — кладём заголовок заново, как раньше', async () => {
    const d = await syncedDevice();
    d.salon.files.delete('vault.json');
    await d.run(d.salon);
    expect(d.salon.files.has('vault.json')).toBe(true);
  });
});
