import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { endSession, startSession } from '../../src/crypto/session';
import { createVault } from '../../src/crypto/vault';
import { KetsalDB, setDb } from '../../src/db/local';
import {
  clearLegacy,
  forgetDecrypted,
  getBlob,
  loadData,
  loadLegacyData,
  putBlobs,
  replaceAll,
  saveVaultHeader,
  writeChange,
} from '../../src/db/repo';
import { shardOf } from '../../src/db/codec';
import type { Entity } from '../../src/domain/types';
import { TODAY, baseData, client } from './fixtures';

let n = 0;
let db: KetsalDB;

async function setup() {
  n += 1;
  db = new KetsalDB(`test-${n}`);
  setDb(db);
  forgetDecrypted();
  const v = await createVault('Пароль-для-теста-1', `V${n}`, TODAY, 1000);
  startSession({ dek: v.dek, vaultId: v.header.vaultId });
  await saveVaultHeader(v.header);
  const D = baseData();
  client(D, {
    id: 'c-secret',
    lastName: 'Секретова',
    firstName: 'Тайна',
    phone: '+79991234567',
    notes: 'аллергия на никель',
  });
  await replaceAll(D);
  return { v, D };
}

/** Все байты базы одной строкой — для поиска открытого текста. */
async function rawDump(): Promise<string> {
  const parts: string[] = [];
  for (const t of db.tables) {
    for (const row of await t.toArray()) {
      parts.push(JSON.stringify(row, (_, x) => (x instanceof Uint8Array ? new TextDecoder('latin1').decode(x) : x)));
    }
  }
  return parts.join('\n');
}

const contains = (hay: string, needle: string) =>
  hay.includes(needle) || hay.includes(new TextDecoder('latin1').decode(new TextEncoder().encode(needle)));

beforeEach(() => endSession());

describe('хранилище на устройстве', () => {
  it('в IndexedDB нет открытого текста', async () => {
    await setup();
    const dump = await rawDump();
    for (const s of ['Секретова', 'Тайна', '79991234567', 'никель', 'Пудровые брови', 'client']) {
      expect(contains(dump, s), s).toBe(false);
    }
    expect(dump).toContain('ketsal-vault');
  });

  it('после повторного входа данные те же', async () => {
    const { D } = await setup();
    forgetDecrypted();
    const data = await loadData(TODAY);
    expect(data.clients.map((c) => c.lastName)).toEqual(D.clients.map((c) => c.lastName));
    expect(data.services).toHaveLength(D.services.length);
    expect(data.settings.corrFrom).toBe(28);
  });

  it('изменения перешифровывают только свой шард и поднимают ревизии', async () => {
    await setup();
    await loadData(TODAY);
    const before = Object.fromEntries((await db.shards.toArray()).map((r) => [r.id, r.rev]));
    const catBefore = (await db.catalog.get('catalog'))!.rev;
    const outboxBefore = await db.outbox.count();
    const D = await loadData(TODAY);
    const c = D.clients[0];
    await writeChange({ puts: [{ coll: 'clients', item: { ...c, lastName: 'Новая' } as Entity<object> }], dels: [] });
    const after = Object.fromEntries((await db.shards.toArray()).map((r) => [r.id, r.rev]));
    const changed = Object.keys(after).filter((k) => after[k] !== before[k]);
    expect(changed).toEqual([shardOf(c.id)]);
    expect((await db.catalog.get('catalog'))!.rev).toBe(catBefore + 1);
    expect(await db.outbox.count()).toBe(outboxBefore + 1);
    forgetDecrypted();
    expect((await loadData(TODAY)).clients.find((x) => x.id === c.id)!.lastName).toBe('Новая');
    await writeChange({ puts: [], dels: [c.id] });
    forgetDecrypted();
    expect((await loadData(TODAY)).clients.some((x) => x.id === c.id)).toBe(false);
  });

  it('подмена байта в шарде — ошибка при загрузке', async () => {
    await setup();
    const row = (await db.shards.get(shardOf('c-secret')))!;
    const bad = row.ct.slice();
    bad[bad.length - 5] ^= 1;
    await db.shards.put({ ...row, ct: bad });
    forgetDecrypted();
    await expect(loadData(TODAY)).rejects.toThrow();
  });

  it('откат шарда к старой копии — ошибка при загрузке', async () => {
    await setup();
    const D = await loadData(TODAY);
    const id = shardOf('c-secret');
    const old = (await db.shards.get(id))!;
    const c = D.clients.find((x) => x.id === 'c-secret')!;
    await writeChange({ puts: [{ coll: 'clients', item: { ...c, notes: 'новое' } as Entity<object> }], dels: [] });
    await db.shards.put(old);
    forgetDecrypted();
    await expect(loadData(TODAY)).rejects.toThrow(/rev mismatch/);
  });

  it('фото шифруются и читаются обратно', async () => {
    await setup();
    const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, ...new TextEncoder().encode('JFIF секретное фото')]);
    await putBlobs([{ id: 'ph1', blob: new Blob([bytes]), kind: 'photo' }]);
    const row = (await db.blobs.get('ph1'))!;
    expect(new TextDecoder('latin1').decode(row.ct)).not.toContain('JFIF');
    const back = new Uint8Array(await (await getBlob('ph1'))!.arrayBuffer());
    expect(back).toEqual(bytes);
  });

  it('без входа данные не читаются', async () => {
    await setup();
    endSession();
    forgetDecrypted();
    await expect(loadData(TODAY)).rejects.toThrow(/locked/);
  });
});

describe('перенос открытых данных этапа 1', () => {
  it('читаются и стираются', async () => {
    n += 1;
    db = new KetsalDB(`legacy-${n}`);
    setDb(db);
    await db.devRecords.put({
      id: 'c1',
      kind: 'client',
      createdAt: TODAY,
      v: { lastName: 'Старая', firstName: 'Запись' },
    });
    await db.devCatalog.put({ key: 'settings', value: { corrFrom: 30 } });
    const legacy = await loadLegacyData(TODAY);
    expect(legacy!.data.clients[0]).toMatchObject({ id: 'c1', lastName: 'Старая' });
    expect(legacy!.data.settings.corrFrom).toBe(30);
    await clearLegacy();
    expect(await db.devRecords.count()).toBe(0);
    expect(await loadLegacyData(TODAY)).toBeNull();
  });
});
