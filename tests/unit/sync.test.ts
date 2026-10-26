// Два «устройства» на одном облаке в памяти (MockAdapter) — SPEC §12, этап 3.
import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { aadFor, open } from '../../src/crypto/aead';
import { createVault, unlockWithPassword, type VaultHeader } from '../../src/crypto/vault';
import { unpack } from '../../src/db/codec';
import { KetsalDB } from '../../src/db/local';
import { LocalStore } from '../../src/db/localStore';
import type { Data, Entity, Procedure } from '../../src/domain/types';
import { MockAdapter } from '../../src/sync/mockAdapter';
import { fetchRemoteHeader, OtherVaultError, RollbackError, sync } from '../../src/sync/engine';
import { TODAY, baseData, client, proc } from './fixtures';

const PW = 'Общий-пароль-2026';
let n = 0;

interface Device {
  local: LocalStore;
  header: VaultHeader;
  dek: CryptoKey;
  run: () => ReturnType<typeof sync>;
  data: () => Data;
  put: (coll: 'procedures' | 'clients', item: object) => Promise<void>;
}

function device(remote: MockAdapter, header: VaultHeader, dek: CryptoKey): Device {
  n += 1;
  const session = { dek, vaultId: header.vaultId };
  const local = new LocalStore(new KetsalDB(`sync-${n}`), () => session);
  return {
    local,
    header,
    dek,
    run: () => sync({ local, remote, session: () => session, header }),
    data: () => local.data(TODAY),
    put: (coll, item) => local.writeChange({ puts: [{ coll, item: item as Entity<object> }], dels: [] }),
  };
}

/** Первое устройство создаёт хранилище с данными, второе подключается по паролю. */
async function twoDevices() {
  const remote = new MockAdapter();
  const v = await createVault(PW, `V${n}`, TODAY, 1000);
  const A = device(remote, v.header, v.dek);
  const D = baseData();
  const c = client(D, { id: 'c1', lastName: 'Смирнова' });
  proc(D, c, 10, { id: 'p1', price: 7000 });
  await A.local.replaceAll(D);
  await A.run();
  // Второе устройство: vault.json с Диска, тот же пароль, пустая база
  const header = (await fetchRemoteHeader(remote))!;
  const B = device(remote, header, await unlockWithPassword(header, PW));
  await B.local.initEmpty();
  await B.run();
  return { remote, A, B };
}

const procOf = (d: Device, id = 'p1') => d.data().procedures.find((p) => p.id === id) as Entity<Procedure>;

describe('синхронизация двух устройств', () => {
  it('второе устройство получает данные первого', async () => {
    const { B } = await twoDevices();
    expect(B.data().clients.map((c) => c.lastName)).toEqual(['Смирнова']);
    expect(procOf(B).price).toBe(7000);
  });

  it('правки разных полей одной процедуры сохраняются обе', async () => {
    const { A, B } = await twoDevices();
    await A.put('procedures', { ...procOf(A), price: 6500 });
    await B.put('procedures', { ...procOf(B), status: 'noshow' });
    await A.run();
    await B.run();
    await A.run();
    for (const d of [A, B]) expect(procOf(d)).toMatchObject({ price: 6500, status: 'noshow' });
  });

  it('удаление доходит до другого устройства', async () => {
    const { A, B } = await twoDevices();
    await A.local.writeChange({ puts: [], dels: ['p1'] });
    await A.run();
    await B.run();
    expect(procOf(B)).toBeUndefined();
  });

  it('полное удаление побеждает офлайн-правку на другом устройстве', async () => {
    const { A, B } = await twoDevices();
    await A.local.writeChange({ puts: [], dels: [], purges: ['c1', 'p1'] });
    await B.put('clients', { ...B.data().clients[0], notes: 'правка без сети' });
    await B.run();
    await A.run();
    await B.run();
    for (const d of [A, B]) expect(d.data().clients).toEqual([]);
  });

  it('настройки сливаются пополевно', async () => {
    const { A, B } = await twoDevices();
    await A.local.writeChange({ puts: [], dels: [], settings: { ...A.data().settings, corrFrom: 30 } });
    await B.local.writeChange({ puts: [], dels: [], lists: { ...B.data().lists, tags: ['Новая метка'] } });
    await A.run();
    await B.run();
    await A.run();
    for (const d of [A, B]) {
      expect(d.data().settings.corrFrom).toBe(30);
      expect(d.data().lists.tags).toEqual(['Новая метка']);
    }
  });

  it('одинаковый номер карты на двух устройствах — дубль получает следующий', async () => {
    const { A, B } = await twoDevices();
    const base = A.data().clients[0];
    await A.put('clients', { ...base, id: 'ca', cardNo: 2, createdAt: '2026-10-25T10:00', lastName: 'Первая' });
    await B.put('clients', { ...base, id: 'cb', cardNo: 2, createdAt: '2026-10-25T11:00', lastName: 'Вторая' });
    await A.run();
    await B.run();
    await A.run();
    const next = Math.max(base.cardNo, 2) + 1;
    for (const d of [A, B]) {
      const byId = Object.fromEntries(d.data().clients.map((c) => [c.id, c]));
      expect(byId.ca.cardNo).toBe(2);
      expect(byId.cb).toMatchObject({ cardNo: next, cardNoChanged: true });
    }
  });

  it('одновременная запись: изменения проигравшего не теряются', async () => {
    const { remote, A, B } = await twoDevices();
    await A.put('procedures', { ...procOf(A), note: 'с телефона' });
    await B.put('procedures', { ...procOf(B), price: 5000 });
    // B пишет свой каталог сразу после того, как A записал свой (A уже проверил запись)
    let raced = false;
    remote.beforeWrite = async (path) => {
      if (path === 'catalog.enc' && !raced) {
        raced = true;
        remote.beforeWrite = undefined;
        await B.run();
      }
    };
    await A.run();
    await A.run();
    await B.run();
    await A.run();
    for (const d of [A, B]) expect(procOf(d)).toMatchObject({ note: 'с телефона', price: 5000 });
  });

  it('на Диске только шифротекст и открытый vault.json', async () => {
    const { remote } = await twoDevices();
    const enc = (s: string) => new TextDecoder('latin1').decode(new TextEncoder().encode(s));
    for (const [path, f] of remote.files) {
      const text = new TextDecoder('latin1').decode(f.data);
      if (path === 'vault.json') continue;
      expect(text.includes(enc('Смирнова')), path).toBe(false);
      expect(text.includes('procedure'), path).toBe(false);
    }
    expect(Array.from(remote.files.keys()).some((p) => p.startsWith('shards/'))).toBe(true);
  });

  it('откат каталога на Диске обнаруживается', async () => {
    const { remote, A } = await twoDevices();
    const old = remote.files.get('catalog.enc')!;
    await A.put('procedures', { ...procOf(A), note: 'новое' });
    await A.run();
    remote.files.set('catalog.enc', old);
    await expect(A.run()).rejects.toBeInstanceOf(RollbackError);
  });

  it('чужое хранилище на Диске не смешивается', async () => {
    const { remote } = await twoDevices();
    const other = await createVault(PW, 'OTHER', TODAY, 1000);
    const C = device(remote, other.header, other.dek);
    await C.local.initEmpty();
    await expect(C.run()).rejects.toBeInstanceOf(OtherVaultError);
  });

  it('каталог на Диске расшифровывается ключом хранилища', async () => {
    const { remote, A } = await twoDevices();
    const bytes = remote.files.get('catalog.enc')!.data;
    const rev = new DataView(bytes.buffer, bytes.byteOffset, 4).getUint32(0);
    const body = unpack<{ catalogRev: number }>(
      await open(A.dek, bytes.subarray(4), aadFor(A.header.vaultId, 'catalog', 'catalog', rev)),
    );
    expect(body.catalogRev).toBe(rev);
  });
});
