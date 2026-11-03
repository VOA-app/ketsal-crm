// Файлы на Диске есть, но не скачиваются (ноябрь 2026, после аварии в дата-центрах Яндекса):
// синхронизация не останавливается, данные устройств не теряются.
import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { createVault, unlockWithPassword, type VaultHeader } from '../../src/crypto/vault';
import { KetsalDB } from '../../src/db/local';
import { LocalStore } from '../../src/db/localStore';
import { photoRefs } from '../../src/domain/photos';
import type { Data, Entity, Procedure } from '../../src/domain/types';
import { fetchRemoteHeader, sync } from '../../src/sync/engine';
import { MockAdapter } from '../../src/sync/mockAdapter';
import { photoPath, prefetchThumbs } from '../../src/sync/photos';
import { TODAY, baseData, client, proc } from './fixtures';

const PW = 'Пароль-сбоя-2026';
let n = 0;

function device(remote: MockAdapter, header: VaultHeader, dek: CryptoKey) {
  n += 1;
  const session = { dek, vaultId: header.vaultId };
  const local = new LocalStore(new KetsalDB(`lost-${n}`), () => session);
  return {
    local,
    run: () => sync({ local, remote, session: () => session, header }),
    data: (): Data => local.data(TODAY),
    proc: (id = 'p1') => local.data(TODAY).procedures.find((p) => p.id === id) as Entity<Procedure>,
    put: (p: Entity<Procedure>) => local.writeChange({ puts: [{ coll: 'procedures', item: p }], dels: [] }),
  };
}

async function twoDevices() {
  const remote = new MockAdapter();
  const v = await createVault(PW, `LV${(n += 1)}`, TODAY, 1000);
  const A = device(remote, v.header, v.dek);
  const D = baseData();
  const c = client(D, { id: 'c1' });
  proc(D, c, 10, { id: 'p1', price: 7000 });
  proc(D, c, 40, { id: 'p2', price: 5000 });
  await A.local.replaceAll(D);
  await A.run();
  const header = (await fetchRemoteHeader(remote))!;
  const B = device(remote, header, await unlockWithPassword(header, PW));
  await B.local.initEmpty();
  await B.run();
  return { remote, A, B };
}

const catalogRev = (remote: MockAdapter) => new DataView(remote.files.get('catalog.enc')!.data.buffer).getUint32(0);

describe('файлы на Диске не скачиваются', () => {
  it('vault.json: синхронизация идёт, заголовок записывается заново', async () => {
    const { remote, A } = await twoDevices();
    remote.unavailable.add('vault.json');
    await A.put({ ...A.proc(), price: 6000 });
    const r = await A.run();
    expect(r.recovered).toBe(true);
    expect(remote.unavailable.has('vault.json')).toBe(false);
    expect(await fetchRemoteHeader(remote)).not.toBeNull();
  });

  it('каталог: устройство отправляет свои данные заново, правки обоих устройств сохраняются', async () => {
    const { remote, A, B } = await twoDevices();
    // B правит p2 и синхронизируется, потом каталог B «застревает» на неисправном узле
    await B.put({ ...B.proc('p2'), note: 'с ПК' });
    await B.run();
    remote.unavailable.add('catalog.enc');
    // A тем временем правит p1
    await A.put({ ...A.proc(), price: 6500 });
    const before = catalogRev(remote);
    const r = await A.run();
    expect(r.recovered).toBe(true);
    expect(catalogRev(remote)).toBeGreaterThan(before);
    // B видит правку A и досылает свою, A после следующей синхронизации видит правку B
    await B.run();
    await A.run();
    for (const d of [A, B]) {
      expect(d.proc().price).toBe(6500);
      expect(d.proc('p2').note).toBe('с ПК');
    }
  });

  it('шард: своя версия уходит на Диск, другое устройство потом досылает свою', async () => {
    const { remote, A, B } = await twoDevices();
    await B.put({ ...B.proc('p2'), note: 'с ПК' });
    await B.run();
    // Новый файл шарда B не скачивается
    const shardOfP2 = Array.from(remote.files.keys())
      .filter((p) => p.startsWith('shards/') && p.includes('-'))
      .sort((x, y) => (remote.files.get(y)!.modified > remote.files.get(x)!.modified ? 1 : -1))[0];
    remote.unavailable.add(shardOfP2);
    await A.put({ ...A.proc(), price: 6100 });
    expect((await A.run()).recovered).toBe(true);
    await B.run();
    await A.run();
    for (const d of [A, B]) {
      expect(d.proc().price).toBe(6100);
      expect(d.proc('p2').note).toBe('с ПК');
    }
  });

  it('фото: недоступное превью не мешает остальным', async () => {
    const { remote, A, B } = await twoDevices();
    const refs = ['x', 'y'].map((id) => ({ blobId: `${id}B`, thumbId: `${id}T`, width: 1, height: 1, bytes: 1 }));
    await A.local.putBlobs(
      refs.flatMap((r) => [
        { id: r.blobId, blob: new Blob(['o']), kind: 'photo' as const },
        { id: r.thumbId, blob: new Blob(['t']), kind: 'thumb' as const },
      ]),
    );
    await A.put({ ...A.proc(), photos: { before: refs, after: [], month: [] } });
    await A.run();
    for (const r of refs) {
      const row = (await A.local.blobRow(r.thumbId))!;
      await remote.write(photoPath('thumb', r.thumbId), row.ct);
    }
    remote.unavailable.add(photoPath('thumb', 'xT'));
    await B.run();
    const got = await prefetchThumbs({ local: B.local, remote, refs: () => photoRefs(B.data()) });
    expect(got).toBe(1);
  });
});
