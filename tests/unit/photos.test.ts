// Фото на Диске (SPEC §8, этап 4): очередь загрузки, скачивание на другом устройстве, удаление, уборка.
import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { createVault, unlockWithPassword, type VaultHeader } from '../../src/crypto/vault';
import { KetsalDB } from '../../src/db/local';
import { LocalStore } from '../../src/db/localStore';
import { photoRefs } from '../../src/domain/photos';
import type { Entity, PhotoRef, Procedure } from '../../src/domain/types';
import { exifTakenAt } from '../../src/media/exif';
import { fetchRemoteHeader, sync } from '../../src/sync/engine';
import { MockAdapter } from '../../src/sync/mockAdapter';
import {
  deleteRemotePhotos,
  fetchPhoto,
  localPhotoGc,
  LOCAL_GRACE_MS,
  photoPath,
  PhotoCorruptError,
  prefetchThumbs,
  remotePhotoGc,
  REMOTE_GRACE_MS,
  uploadPhotos,
  type PhotoDeps,
} from '../../src/sync/photos';
import { TODAY, baseData, client, proc } from './fixtures';

const PW = 'Фото-пароль-2026';
let n = 0;

function device(remote: MockAdapter, header: VaultHeader, dek: CryptoKey) {
  n += 1;
  const session = { dek, vaultId: header.vaultId };
  const local = new LocalStore(new KetsalDB(`photos-${n}`), () => session);
  let now = Date.now();
  const deps: PhotoDeps = { local, remote, refs: () => photoRefs(local.data(TODAY)), now: () => now };
  return {
    local,
    deps,
    run: () => sync({ local, remote, session: () => session, header }),
    later: (ms: number) => {
      now += ms;
    },
    proc: (id = 'p1') => local.data(TODAY).procedures.find((p) => p.id === id) as Entity<Procedure>,
    putProc: (p: Entity<Procedure>) => local.writeChange({ puts: [{ coll: 'procedures', item: p }], dels: [] }),
    /** «Снять» фото: два файла в базе этого устройства */
    async shoot(id: string): Promise<PhotoRef> {
      const ref: PhotoRef = { blobId: `${id}B`, thumbId: `${id}T`, width: 10, height: 10, bytes: 3 };
      await local.putBlobs([
        { id: ref.blobId, blob: new Blob([`orig-${id}`]), kind: 'photo' },
        { id: ref.thumbId, blob: new Blob([`thumb-${id}`]), kind: 'thumb' },
      ]);
      return ref;
    },
  };
}

async function twoDevices() {
  const remote = new MockAdapter();
  const v = await createVault(PW, `PV${n}`, TODAY, 1000);
  const A = device(remote, v.header, v.dek);
  const D = baseData();
  const c = client(D, { id: 'c1' });
  proc(D, c, 10, { id: 'p1' });
  await A.local.replaceAll(D);
  await A.run();
  const header = (await fetchRemoteHeader(remote))!;
  const B = device(remote, header, await unlockWithPassword(header, PW));
  await B.local.initEmpty();
  await B.run();
  return { remote, A, B };
}

/** Снять фото «до» на устройстве и сохранить процедуру. */
async function addBefore(d: ReturnType<typeof device>, id: string) {
  const ref = await d.shoot(id);
  const p = d.proc();
  await d.putProc({ ...p, photos: { ...p.photos, before: [...p.photos.before, ref] } });
  return ref;
}

const text = async (b: Blob | null) => (b ? new TextDecoder().decode(new Uint8Array(await b.arrayBuffer())) : null);

describe('фото на Диске', () => {
  it('загружаются только сохранённые фото, на Диске — шифротекст', async () => {
    const { remote, A } = await twoDevices();
    const ref = await addBefore(A, 'f1');
    await A.shoot('draft'); // фото из незакрытой формы
    await A.run();
    expect(await uploadPhotos(A.deps)).toBe(0);
    expect(remote.files.has(photoPath('photo', ref.blobId))).toBe(true);
    expect(remote.files.has(photoPath('thumb', ref.thumbId))).toBe(true);
    expect(Array.from(remote.files.keys()).some((p) => p.includes('draft'))).toBe(false);
    const bytes = remote.files.get(photoPath('photo', ref.blobId))!.data;
    expect(new TextDecoder().decode(bytes)).not.toContain('orig-f1');
    // Фото из формы осталось в очереди
    expect(await A.local.uploadQueue()).toEqual(['draftB', 'draftT']);
  });

  it('второе устройство сразу получает превью, а оригинал — при открытии', async () => {
    const { A, B } = await twoDevices();
    const ref = await addBefore(A, 'f2');
    await A.run();
    await uploadPhotos(A.deps);
    await B.run();
    expect(await prefetchThumbs(B.deps)).toBe(1);
    expect(await text(await B.local.getBlob(ref.thumbId))).toBe('thumb-f2');
    expect(await B.local.getBlob(ref.blobId)).toBeNull();
    expect(await text(await fetchPhoto(B.deps, ref.blobId, 'photo'))).toBe('orig-f2');
    expect(await text(await B.local.getBlob(ref.blobId))).toBe('orig-f2');
    // Повторно уже не качается
    expect(await prefetchThumbs(B.deps)).toBe(0);
  });

  it('ещё не загруженное фото: превью нет, ошибки нет', async () => {
    const { A, B } = await twoDevices();
    const ref = await addBefore(A, 'f3');
    await A.run();
    await B.run();
    expect(await prefetchThumbs(B.deps)).toBe(0);
    expect(await fetchPhoto(B.deps, ref.blobId, 'photo')).toBeNull();
  });

  it('подменённый файл на Диске не принимается', async () => {
    const { remote, A, B } = await twoDevices();
    const r1 = await addBefore(A, 'f4');
    const r2 = await addBefore(A, 'f5');
    await A.run();
    await uploadPhotos(A.deps);
    // Чужой файл под именем нашего: AAD с id не совпадёт
    remote.files.set(photoPath('thumb', r1.thumbId), { ...remote.files.get(photoPath('thumb', r2.thumbId))! });
    await B.run();
    await expect(fetchPhoto(B.deps, r1.thumbId, 'thumb')).rejects.toBeInstanceOf(PhotoCorruptError);
    expect(await prefetchThumbs(B.deps)).toBe(1);
    expect(await B.local.getBlob(r1.thumbId)).toBeNull();
  });

  it('убранное из процедуры фото удаляется с Диска и с другого устройства', async () => {
    const { remote, A, B } = await twoDevices();
    const ref = await addBefore(A, 'f6');
    await A.run();
    await uploadPhotos(A.deps);
    await B.run();
    await prefetchThumbs(B.deps);
    // На A фото убрали из процедуры
    const p = A.proc();
    await A.putProc({ ...p, photos: { ...p.photos, before: [] } });
    await A.local.deletePhotos([ref]);
    await A.run();
    await deleteRemotePhotos(A.deps);
    expect(remote.files.has(photoPath('photo', ref.blobId))).toBe(false);
    expect(remote.files.has(photoPath('thumb', ref.thumbId))).toBe(false);
    // B после синхронизации убирает свою копию (по истечении паузы для открытых форм)
    await B.run();
    B.later(LOCAL_GRACE_MS + 60_000);
    expect(await localPhotoGc(B.deps)).toBe(1);
    expect(await B.local.getBlob(ref.thumbId)).toBeNull();
  });

  it('не загруженное фото удаляется без запроса к Диску', async () => {
    const { A } = await twoDevices();
    const ref = await A.shoot('f7');
    await A.local.deletePhotos([ref]);
    expect(await A.local.uploadQueue()).toEqual([]);
    expect(await A.local.deleteQueue()).toEqual([]);
  });

  it('полное удаление карты убирает её фото с Диска', async () => {
    const { remote, A } = await twoDevices();
    const ref = await addBefore(A, 'f8');
    await A.run();
    await uploadPhotos(A.deps);
    // Как на экране карты: фото карты и её процедур собираются до удаления
    const refs = photoRefs(A.local.data(TODAY));
    expect(refs).toEqual([ref]);
    await A.local.writeChange({ puts: [], dels: [], purges: ['p1', 'c1'] });
    await A.local.deletePhotos(refs);
    await A.run();
    await deleteRemotePhotos(A.deps);
    const photoFiles = Array.from(remote.files.keys()).filter((p) => p.startsWith('blobs/') || p.startsWith('thumbs/'));
    expect(photoFiles).toEqual([]);
  });

  it('уборка: фото открытой формы и недавние не трогаются', async () => {
    const { A } = await twoDevices();
    const draft = await A.shoot('f9');
    expect(await localPhotoGc(A.deps)).toBe(0);
    A.later(LOCAL_GRACE_MS + 60_000);
    expect(await localPhotoGc(A.deps, new Set([draft.blobId, draft.thumbId]))).toBe(0);
    expect(await localPhotoGc(A.deps)).toBe(2);
  });

  it('уборка на Диске: файлы без ссылок старше 7 дней', async () => {
    const { remote, A } = await twoDevices();
    const ref = await addBefore(A, 'f10');
    await A.run();
    await uploadPhotos(A.deps);
    // Файл, на который ссылаются записи, ещё не дошедшие с другого устройства
    remote.files.set(photoPath('photo', 'ORPHAN'), { data: new Uint8Array([1]), modified: new Date().toISOString() });
    expect(await remotePhotoGc(A.deps)).toBe(0);
    A.later(REMOTE_GRACE_MS + 60_000);
    expect(await remotePhotoGc(A.deps)).toBe(1);
    expect(remote.files.has(photoPath('photo', 'ORPHAN'))).toBe(false);
    expect(remote.files.has(photoPath('photo', ref.blobId))).toBe(true);
  });
});

// ── Дата съёмки из EXIF ──

/** Минимальный JPEG: SOI, APP1 с EXIF (IFD0 → ExifIFD → DateTimeOriginal), SOS. */
function jpegWithExif(date: string, le: boolean): Uint8Array {
  const tiff: number[] = [];
  const u16 = (v: number) => (le ? [v & 255, v >> 8] : [v >> 8, v & 255]);
  const u32 = (v: number) =>
    le ? [v & 255, (v >> 8) & 255, (v >> 16) & 255, v >>> 24] : [v >>> 24, (v >> 16) & 255, (v >> 8) & 255, v & 255];
  // Заголовок TIFF, IFD0 по смещению 8: одна запись — указатель на ExifIFD (смещение 26)
  tiff.push(...(le ? [0x49, 0x49] : [0x4d, 0x4d]), ...u16(42), ...u32(8));
  tiff.push(...u16(1), ...u16(0x8769), ...u16(4), ...u32(1), ...u32(26), ...u32(0));
  // ExifIFD по смещению 26: DateTimeOriginal, строка из 20 байт по смещению 44
  tiff.push(...u16(1), ...u16(0x9003), ...u16(2), ...u32(20), ...u32(44), ...u32(0));
  tiff.push(...Array.from(new TextEncoder().encode(date)), 0);
  const app1 = [...Array.from(new TextEncoder().encode('Exif')), 0, 0, ...tiff];
  const len = app1.length + 2;
  return new Uint8Array([0xff, 0xd8, 0xff, 0xe1, len >> 8, len & 255, ...app1, 0xff, 0xda, 0, 2]);
}

describe('дата съёмки', () => {
  it('читается из EXIF в обоих порядках байт', () => {
    expect(exifTakenAt(jpegWithExif('2026:03:12 14:05:09', true))).toBe('2026-03-12T14:05:09');
    expect(exifTakenAt(jpegWithExif('2025:12:31 23:59:59', false))).toBe('2025-12-31T23:59:59');
  });
  it('нет EXIF, пустая дата или не JPEG — undefined', () => {
    expect(exifTakenAt(new Uint8Array([0xff, 0xd8, 0xff, 0xda, 0, 2]))).toBeUndefined();
    expect(exifTakenAt(jpegWithExif('0000:00:00 00:00:00', true))).toBeUndefined();
    expect(exifTakenAt(new TextEncoder().encode('not a jpeg'))).toBeUndefined();
    expect(exifTakenAt(jpegWithExif('2026:03:12 14:05:09', true).slice(0, 30))).toBeUndefined();
  });
});
