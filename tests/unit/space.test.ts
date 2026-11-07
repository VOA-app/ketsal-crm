// Место на Яндекс Диске: распознаём «нет места» (507), показываем объём, фото ждут, записи не теряются.
import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createVault } from '../../src/crypto/vault';
import { KetsalDB } from '../../src/db/local';
import { LocalStore } from '../../src/db/localStore';
import { photoRefs } from '../../src/domain/photos';
import { formatBytes, LOW_SPACE_BYTES, spaceLevel } from '../../src/domain/space';
import type { Entity, PhotoRef, Procedure } from '../../src/domain/types';
import { NoSpaceError, NoSpaceInfoAccessError } from '../../src/sync/adapter';
import { sync } from '../../src/sync/engine';
import { MockAdapter } from '../../src/sync/mockAdapter';
import { photoPath, uploadPhotos, type PhotoDeps } from '../../src/sync/photos';
import { YandexDiskAdapter } from '../../src/sync/yandexDiskAdapter';
import { TODAY, baseData, client, proc } from './fixtures';

const MB = 1024 ** 2;
const GB = 1024 ** 3;

describe('уровень места на Диске', () => {
  it('предупреждаем, когда свободно меньше 500 МБ, «закончилось» — меньше 5 МБ', () => {
    const total = 5 * GB;
    expect(spaceLevel({ total, used: total - LOW_SPACE_BYTES - 1, trash: 0 })).toBe('ok');
    expect(spaceLevel({ total, used: total - 300 * MB, trash: 0 })).toBe('low');
    expect(spaceLevel({ total, used: total - 2 * MB, trash: 0 })).toBe('full');
    expect(spaceLevel({ total, used: total + MB, trash: 0 })).toBe('full');
  });

  it('объём показывается как на Диске', () => {
    expect(formatBytes(4.24 * GB)).toBe('4,2 ГБ');
    expect(formatBytes(5 * GB)).toBe('5 ГБ');
    expect(formatBytes(1024 * GB)).toBe('1024 ГБ');
    expect(formatBytes(240 * MB)).toBe('240 МБ');
    expect(formatBytes(1000)).toBe('меньше 1 МБ');
  });
});

describe('адаптер Яндекс Диска', () => {
  afterEach(() => vi.unstubAllGlobals());
  const json = (status: number, body: unknown = {}) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  const disk = () => new YandexDiskAdapter(async () => 'token');

  it('507 при запросе ссылки загрузки — «нет места»', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => json(507, { error: 'DiskNotEnoughSpaceError' })),
    );
    await expect(disk().write('shards/00.enc', new Uint8Array([1]))).rejects.toBeInstanceOf(NoSpaceError);
  });

  it('507 при самой загрузке — тоже «нет места»', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        url.startsWith('https://cloud-api.yandex.net')
          ? json(200, { href: 'https://uploader.disk.yandex.net/x', method: 'PUT' })
          : new Response(null, { status: 507 }),
      ),
    );
    await expect(disk().write('blobs/a.enc', new Uint8Array([1]))).rejects.toBeInstanceOf(NoSpaceError);
  });

  it('объём Диска с корзиной', async () => {
    const f = vi.fn(async () => json(200, { total_space: 5 * GB, used_space: 4 * GB, trash_size: 300 * MB }));
    vi.stubGlobal('fetch', f);
    expect(await disk().space()).toEqual({ total: 5 * GB, used: 4 * GB, trash: 300 * MB });
    expect(String((f.mock.calls[0] as unknown[])[0])).toBe(
      'https://cloud-api.yandex.net/v1/disk?fields=total_space,used_space,trash_size',
    );
  });
});

describe('Диск заполнен', () => {
  let n = 0;
  async function setup() {
    n += 1;
    const remote = new MockAdapter();
    const v = await createVault('Место-пароль-2026', `SP${n}`, TODAY, 1000);
    const session = { dek: v.dek, vaultId: v.header.vaultId };
    const local = new LocalStore(new KetsalDB(`space-${n}`), () => session);
    const D = baseData();
    const c = client(D, { id: 'c1' });
    proc(D, c, 10, { id: 'p1' });
    await local.replaceAll(D);
    const run = () => sync({ local, remote, session: () => session, header: v.header });
    await run();
    const deps: PhotoDeps = { local, remote, refs: () => photoRefs(local.data(TODAY)) };
    const p = () => local.data(TODAY).procedures.find((x) => x.id === 'p1') as Entity<Procedure>;
    const edit = (patch: Partial<Procedure>) =>
      local.writeChange({ puts: [{ coll: 'procedures', item: { ...p(), ...patch } }], dels: [] });
    const used = async () =>
      (await remote.space())?.used ?? Array.from(remote.files.values()).reduce((s, f) => s + f.data.length, 0);
    return { remote, local, run, deps, p, edit, used };
  }

  it('синхронизация останавливается с «нет места», данные на устройстве целы', async () => {
    const s = await setup();
    s.remote.capacity = await s.used();
    await s.edit({ note: 'после заполнения' });
    await expect(s.run()).rejects.toBeInstanceOf(NoSpaceError);
    expect(s.p().note).toBe('после заполнения');
    // Место освободили — всё уходит
    s.remote.capacity = 0;
    await s.run();
    expect(s.p().note).toBe('после заполнения');
  });

  it('фото ждут в очереди, пока не появится место, записи при этом уходят', async () => {
    const s = await setup();
    const ref: PhotoRef = { blobId: 'fB', thumbId: 'fT', width: 10, height: 10, bytes: 3 };
    await s.local.putBlobs([
      { id: ref.blobId, blob: new Blob(['orig-f']), kind: 'photo' },
      { id: ref.thumbId, blob: new Blob(['thumb-f']), kind: 'thumb' },
    ]);
    await s.edit({ photos: { ...s.p().photos, before: [ref] } });
    await s.run();
    s.remote.capacity = (await s.used()) + 10;
    await expect(uploadPhotos(s.deps)).rejects.toBeInstanceOf(NoSpaceError);
    expect(await s.local.uploadQueue()).toEqual(['fB', 'fT']);
    expect(s.remote.files.has(photoPath('photo', 'fB'))).toBe(false);
    s.remote.capacity = 0;
    expect(await uploadPhotos(s.deps)).toBe(0);
    expect(s.remote.files.has(photoPath('photo', 'fB'))).toBe(true);
  });
});

describe('нет права на сведения о Диске', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('403 на объём Диска — отдельная ошибка: нужно войти заново, а не «сбой»', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{}', { status: 403 })),
    );
    await expect(new YandexDiskAdapter(async () => 't').space()).rejects.toBeInstanceOf(NoSpaceInfoAccessError);
  });
});
