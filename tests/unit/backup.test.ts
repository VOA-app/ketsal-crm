// Резервная копия .ketsal и открытая выгрузка (SPEC §9, этап 5).
import 'fake-indexeddb/auto';
import { unzipSync, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { clientsCsv, expensesCsv, photoFileNames, proceduresCsv, toCsv } from '../../src/app/exportCsv';
import { buildBackup, BackupFormatError, decodeBackup, importBackup, inspectBackup } from '../../src/backup/ketsal';
import { ZipReader, ZipWriter } from '../../src/backup/zip';
import { createVault, unlockWithPassword, type VaultHeader } from '../../src/crypto/vault';
import { KetsalDB } from '../../src/db/local';
import { LocalStore } from '../../src/db/localStore';
import { buildIndex } from '../../src/domain/indexing';
import type { Entity, PhotoRef, Procedure } from '../../src/domain/types';
import { TODAY, baseData, client, proc } from './fixtures';

const PW = 'Пароль-копии-2026';
let n = 0;

async function vault(id: string) {
  const v = await createVault(PW, id, TODAY, 1000);
  return v;
}

function store(header: VaultHeader, dek: CryptoKey) {
  n += 1;
  const session = { dek, vaultId: header.vaultId };
  const local = new LocalStore(new KetsalDB(`backup-${n}`), () => session);
  return { local, session: () => session, header };
}

const photo = (id: string): PhotoRef => ({ blobId: `${id}B`, thumbId: `${id}T`, width: 1, height: 1, bytes: 1 });

/** Хранилище с одной клиенткой, процедурой и фото «до». */
async function filled(vaultId = `BV${n}`) {
  const v = await vault(vaultId);
  const s = store(v.header, v.dek);
  const D = baseData();
  const c = client(D, { id: 'c1', lastName: 'Смирнова', cardNo: 1 });
  proc(D, c, 10, { id: 'p1', price: 7000, photos: { before: [photo('ph1')], after: [], month: [] } });
  await s.local.replaceAll(D);
  await s.local.putBlobs([
    { id: 'ph1B', blob: new Blob(['оригинал']), kind: 'photo' },
    { id: 'ph1T', blob: new Blob(['превью']), kind: 'thumb' },
  ]);
  return { ...s, v };
}

const text = async (b: Blob | null) => (b ? new TextDecoder().decode(new Uint8Array(await b.arrayBuffer())) : null);

describe('ZIP без сжатия', () => {
  it('свой файл читает fflate, файл fflate читаем мы', async () => {
    const w = new ZipWriter(new Date(2026, 9, 27, 12, 0, 0));
    w.add('a.txt', new TextEncoder().encode('привет'));
    w.add('Фото/№ 1 Смирнова/до 1.jpg', new Uint8Array([1, 2, 3]));
    const blob = w.finish();
    const theirs = unzipSync(new Uint8Array(await blob.arrayBuffer()));
    expect(new TextDecoder().decode(theirs['a.txt'])).toBe('привет');
    expect(Array.from(theirs['Фото/№ 1 Смирнова/до 1.jpg'])).toEqual([1, 2, 3]);

    const other = zipSync({ 'x/y.bin': new Uint8Array([9, 8]) }, { level: 0 });
    const r = await ZipReader.open(new Blob([other.slice().buffer as ArrayBuffer]));
    expect(Array.from(await r.read('x/y.bin'))).toEqual([9, 8]);
  });
});

describe('резервная копия', () => {
  it('копия своего хранилища восстанавливается на пустом устройстве', async () => {
    const A = await filled();
    const { blob, manifest, missingPhotos } = await buildBackup({ ...A, today: TODAY });
    expect(missingPhotos).toBe(0);
    expect(manifest.counts).toEqual({ clients: 1, procedures: 1, photos: 1 });
    // Ничего открытого: только vault.json и manifest.json читаются без ключа
    const raw = new TextDecoder().decode(new Uint8Array(await blob.arrayBuffer()));
    expect(raw).not.toContain('Смирнова');
    expect(raw).not.toContain('оригинал');

    const B = store(A.header, A.v.dek);
    await B.local.initEmpty();
    const info = await inspectBackup(blob);
    const r = await importBackup({ ...B, info, backupDek: A.v.dek, mode: 'merge', today: TODAY });
    expect(r).toEqual({ clients: 1, procedures: 1, photos: 1 });
    expect(B.local.data(TODAY).clients.map((c) => c.lastName)).toEqual(['Смирнова']);
    expect(await text(await B.local.getBlob('ph1B'))).toBe('оригинал');
    // Восстановленное уйдёт на Диск при синхронизации
    expect((await B.local.pending()).ids.size).toBeGreaterThan(0);
    expect(await B.local.uploadQueue()).toEqual(expect.arrayContaining(['ph1B', 'ph1T']));
  });

  it('копия другого хранилища: по её паролю, фото перешифровываются', async () => {
    const A = await filled('OLD');
    const { blob } = await buildBackup({ ...A, today: TODAY });
    const v2 = await vault('NEW');
    const B = store(v2.header, v2.dek);
    await B.local.initEmpty();
    const info = await inspectBackup(blob);
    const key = await unlockWithPassword(info.header, PW);
    await importBackup({ ...B, info, backupDek: key, mode: 'merge', today: TODAY });
    expect(B.local.data(TODAY).procedures[0].price).toBe(7000);
    expect(await text(await B.local.getBlob('ph1T'))).toBe('превью');
  });

  it('чужим ключом копию не открыть', async () => {
    const A = await filled();
    const { blob } = await buildBackup({ ...A, today: TODAY });
    const other = await vault('X');
    await expect(decodeBackup(await inspectBackup(blob), other.dek)).rejects.toThrow();
  });

  it('изменённый байт в файле — «повреждён», чужой ZIP — «не копия»', async () => {
    const A = await filled();
    const { blob } = await buildBackup({ ...A, today: TODAY });
    const bytes = new Uint8Array(await blob.arrayBuffer());
    // Портим байт внутри данных первого шифрованного файла (после vault.json)
    const at = new TextDecoder('latin1').decode(bytes).indexOf('catalog.enc') + 40;
    bytes[at] ^= 1;
    await expect(inspectBackup(new Blob([bytes]))).rejects.toMatchObject({ reason: 'damaged' });
    const other = zipSync({ 'a.txt': new Uint8Array([1]) }, { level: 0 });
    await expect(inspectBackup(new Blob([other.slice().buffer as ArrayBuffer]))).rejects.toBeInstanceOf(
      BackupFormatError,
    );
    await expect(inspectBackup(new Blob(['не zip']))).rejects.toMatchObject({ reason: 'notBackup' });
  });

  it('«Объединить» сохраняет текущие правки и добавляет недостающее', async () => {
    const A = await filled();
    const { blob } = await buildBackup({ ...A, today: TODAY });
    // После копии: правка процедуры и новая клиентка с тем же номером карты, что был в копии у другой
    const p = A.local.data(TODAY).procedures[0] as Entity<Procedure>;
    await A.local.writeChange({
      puts: [{ coll: 'procedures', item: { ...p, price: 6500 } as Entity<object> }],
      dels: [],
    });
    await A.local.writeChange({ puts: [], dels: ['c1'] });
    const D = baseData();
    const c2 = client(D, { id: 'c2', lastName: 'Новая', cardNo: 1 });
    await A.local.writeChange({ puts: [{ coll: 'clients', item: c2 }], dels: [] });
    await importBackup({ ...A, info: await inspectBackup(blob), backupDek: A.v.dek, mode: 'merge', today: TODAY });
    const d = A.local.data(TODAY);
    expect(d.procedures[0].price).toBe(6500);
    // Удалённая после копии карта не вернулась
    expect(d.clients.map((c) => c.lastName)).toEqual(['Новая']);
  });

  it('«Заменить всё»: данные как в копии, удалённое после неё не возвращается', async () => {
    const A = await filled();
    const { blob } = await buildBackup({ ...A, today: TODAY });
    const p = A.local.data(TODAY).procedures[0] as Entity<Procedure>;
    await A.local.writeChange({ puts: [{ coll: 'procedures', item: { ...p, price: 1 } as Entity<object> }], dels: [] });
    const D = baseData();
    await A.local.writeChange({ puts: [{ coll: 'clients', item: client(D, { id: 'c9', cardNo: 9 }) }], dels: [] });
    await importBackup({ ...A, info: await inspectBackup(blob), backupDek: A.v.dek, mode: 'replace', today: TODAY });
    const d = A.local.data(TODAY);
    expect(d.procedures[0].price).toBe(7000);
    expect(d.clients.map((c) => c.id)).toEqual(['c1']);
  });
});

describe('открытая выгрузка', () => {
  it('CSV: BOM, «;», кавычки, формулы Excel не выполняются', () => {
    const csv = toCsv([
      ['a;b', 'с "кавычками"', '=1+1', -5, '+7 917'],
      ['многострочный\nтекст', '', null, undefined, 0],
    ]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv.slice(1).split('\r\n')[0]).toBe(`"a;b";"с ""кавычками""";'=1+1;-5;'+7 917`);
  });

  it('здоровье — только по галочке; таблицы процедур и расходников', () => {
    const D = baseData();
    const c = client(D, {
      id: 'c1',
      cardNo: 3,
      lastName: 'Иванова',
      health: { filledAt: TODAY, flags: { diabetes: true }, allergies: ['лидокаин'], meds: '', other: '' },
    });
    proc(D, c, 5, { id: 'p1', price: 5000, photos: { before: [photo('x')], after: [], month: [] } });
    D.expenses.push({ id: 'e1', createdAt: TODAY, category: 'Пигменты', name: 'Набор', amount: 3000, date: TODAY });
    const idx = buildIndex(D, TODAY);
    expect(clientsCsv(idx, false)).not.toContain('лидокаин');
    expect(clientsCsv(idx, false)).not.toContain('Анкета');
    expect(clientsCsv(idx, true)).toContain('лидокаин');
    expect(proceduresCsv(idx).split('\r\n')).toHaveLength(2);
    expect(expensesCsv(idx)).toContain('Набор;3000');
    const names = photoFileNames(idx, c);
    expect(names).toHaveLength(1);
    expect(names[0].path).toMatch(/^Фото\/3 Иванова .+\/\d{4}-\d{2}-\d{2} .+ До 1\.jpg$/);
  });
});
