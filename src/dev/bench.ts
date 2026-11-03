// Нагрузочный замер (SPEC §12, этап 7): 5 000 записей и 1 000 фото во временном хранилище
// с облаком в памяти. Настоящие данные и Диск не трогаются: своя база, свой ключ, стирается в конце.
// Запускается из тестов (tests/unit/load.test.ts) и со страницы замера в демо-версии.
// Подписи шагов — в ru.bench (экран), здесь только ключи.
import { buildBackup, inspectBackup } from '../backup/ketsal';
import { createVault, unlockWithPassword } from '../crypto/vault';
import { KetsalDB } from '../db/local';
import { LocalStore } from '../db/localStore';
import { CLIENT_VIEWS } from '../domain/constants';
import { buildIndex } from '../domain/indexing';
import { photoRefs } from '../domain/photos';
import { viewItems } from '../domain/reminders';
import { monthlySeries, reportData } from '../domain/reports';
import { searchClients } from '../domain/search';
import type { Entity, Procedure } from '../domain/types';
import { sync } from '../sync/engine';
import { MockAdapter } from '../sync/mockAdapter';
import { uploadPhotos } from '../sync/photos';
import { attachLoadPhotos, buildLoad, LOAD_SIZE, type LoadSize } from './load';

export type BenchStep =
  | 'vault'
  | 'firstWrite'
  | 'password'
  | 'decrypt'
  | 'index'
  | 'views'
  | 'search'
  | 'reports'
  | 'oneEdit'
  | 'photosWrite'
  | 'firstSync'
  | 'photosUpload'
  | 'joinSync'
  | 'editSync'
  | 'backupBuild'
  | 'backupCheck'
  /** Замеряет экран: обработка снимков с камеры */
  | 'photoProcess';

export interface BenchRow {
  step: BenchStep;
  ms: number;
  /** Сколько обработано (записей, строк, совпадений, фото, файлов) */
  count?: number;
  /** Объём, МБ */
  mb?: number;
  /** Шаг остановился на ошибке (например, не хватило места) — имя ошибки */
  error?: string;
}

export interface BenchOptions {
  today: string;
  size?: LoadSize;
  photos: number;
  /** Содержимое фото i (JPEG на iPhone, случайные байты в тестах) */
  photoBytes: (i: number) => Promise<Uint8Array>;
  /** Итерации PBKDF2: в приложении 600 000, в быстрых тестах меньше */
  iterations?: number;
  onRow?: (row: BenchRow) => void;
  /** Имя временной базы */
  dbName?: string;
}

const PW = 'Замер-нагрузки-2026';
const MB = 1024 * 1024;

export async function runBench(o: BenchOptions): Promise<BenchRow[]> {
  const rows: BenchRow[] = [];
  const time = async <T>(
    step: BenchStep,
    fn: () => Promise<T> | T,
    extra?: (r: T) => Pick<BenchRow, 'count' | 'mb'>,
  ): Promise<T> => {
    const t0 = performance.now();
    const r = await fn();
    const row: BenchRow = { step, ms: Math.round(performance.now() - t0), ...extra?.(r) };
    rows.push(row);
    o.onRow?.(row);
    return r;
  };
  const name = o.dbName ?? 'ketsal-bench';
  const dbA = new KetsalDB(`${name}-a`);
  const dbB = new KetsalDB(`${name}-b`);
  try {
    const data = buildLoad(o.today, o.size ?? LOAD_SIZE);
    const refs = attachLoadPhotos(data, o.photos);
    const records = data.clients.length + data.procedures.length;

    const v = await time('vault', () => createVault(PW, 'BENCH', o.today, o.iterations));
    let session = { dek: v.dek, vaultId: v.header.vaultId };
    const A0 = new LocalStore(dbA, () => session);
    await time(
      'firstWrite',
      () => A0.replaceAll(data),
      () => ({ count: records }),
    );

    // Разблокировка «с нуля»: новый экземпляр хранилища, пароль, расшифровка всех шардов
    const A = new LocalStore(dbA, () => session);
    await time('password', async () => {
      session = { dek: await unlockWithPassword(v.header, PW), vaultId: v.header.vaultId };
    });
    const loaded = await time('decrypt', () => A.load(o.today));
    const idx = await time('index', () => buildIndex(loaded, o.today));

    await time(
      'views',
      () => CLIENT_VIEWS.reduce((n, view) => n + viewItems(idx, view).length, 0),
      (n) => ({ count: n }),
    );
    await time(
      'search',
      () => ['Смир', 'Анна', '917', '0012', '5'].reduce((n, q) => n + searchClients(idx, q).length, 0),
      (n) => ({ count: n }),
    );
    await time('reports', () => {
      reportData(idx, 'month', o.today);
      reportData(idx, 'year', o.today);
      return monthlySeries(idx, o.today);
    });

    const p0 = loaded.procedures[0] as Entity<Procedure>;
    await time('oneEdit', () =>
      A.writeChange({ puts: [{ coll: 'procedures', item: { ...p0, note: 'замер' } as Entity<object> }], dels: [] }),
    );

    // Не хватило места (во вкладке Safari лимит меньше, чем у значка «Домой») — записываем сколько
    // получилось и идём дальше: синхронизация и копия замеряются на том, что есть
    let photoBytes = 0;
    let written = 0;
    let photoError = '';
    await time(
      'photosWrite',
      async () => {
        try {
          for (; written < refs.length; written += 1) {
            const bytes = await o.photoBytes(written);
            await A.putBlobs([
              { id: refs[written].blobId, blob: new Blob([bytes.slice().buffer as ArrayBuffer]), kind: 'photo' },
              {
                id: refs[written].thumbId,
                blob: new Blob([bytes.slice(0, 30_000).buffer as ArrayBuffer]),
                kind: 'thumb',
              },
            ]);
            photoBytes += bytes.length;
          }
        } catch (e) {
          photoError = e instanceof Error ? e.name : 'Error';
        }
      },
      () => ({ count: written, mb: Math.round(photoBytes / MB), error: photoError || undefined }),
    );

    const remote = new MockAdapter();
    const syncA = () => sync({ local: A, remote, session: () => session, header: v.header });
    await time('firstSync', syncA);
    await time(
      'photosUpload',
      () => uploadPhotos({ local: A, remote, refs: () => photoRefs(A.data(o.today)) }),
      () => ({ count: written * 2 }),
    );

    const B = new LocalStore(dbB, () => session);
    await time('joinSync', async () => {
      await B.initEmpty();
      await sync({ local: B, remote, session: () => session, header: v.header });
    });

    await time('editSync', async () => {
      await A.writeChange({
        puts: [{ coll: 'procedures', item: { ...p0, note: 'замер 2' } as Entity<object> }],
        dels: [],
      });
      await syncA();
    });

    const backup = await time(
      'backupBuild',
      () => buildBackup({ local: A, session: () => session, header: v.header, today: o.today }),
      (r) => ({ mb: Math.round(r.blob.size / MB) }),
    );
    await time('backupCheck', () => inspectBackup(backup.blob));
    return rows;
  } finally {
    await Promise.all([dbA.delete(), dbB.delete()]).catch(() => undefined);
  }
}
