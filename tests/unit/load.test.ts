// Нагрузочный замер этапа 7 на ПК: KETSAL_PERF=1 npx vitest run tests/unit/load.test.ts
// Без переменной — короткий прогон на маленькой базе, чтобы замер не ломался незаметно.
import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { runBench } from '../../src/dev/bench';
import { buildLoad, LOAD_SIZE } from '../../src/dev/load';
import { TODAY } from './fixtures';

const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};
const FULL = env.KETSAL_PERF === '1';

describe('нагрузочная база', () => {
  it('собирается нужного размера, id уникальны, процедуры ссылаются на свои карты', () => {
    const D = buildLoad(TODAY, LOAD_SIZE);
    expect(D.clients).toHaveLength(LOAD_SIZE.clients);
    expect(D.procedures).toHaveLength(LOAD_SIZE.procedures);
    const ids = new Set([...D.clients, ...D.procedures].map((x) => x.id));
    expect(ids.size).toBe(LOAD_SIZE.clients + LOAD_SIZE.procedures);
    const clientIds = new Set(D.clients.map((c) => c.id));
    expect(D.procedures.every((p) => clientIds.has(p.clientId))).toBe(true);
    expect(new Set(D.clients.map((c) => c.cardNo)).size).toBe(LOAD_SIZE.clients);
  });
});

describe('замер', () => {
  it(
    FULL ? '5 000 записей и 1 000 фото' : 'короткий прогон',
    async () => {
      const photo = new Uint8Array(FULL ? 200_000 : 5_000).map((_, i) => (i * 31) & 255);
      const rows = await runBench({
        today: TODAY,
        size: FULL ? LOAD_SIZE : { clients: 50, procedures: 150 },
        photos: FULL ? 1000 : 10,
        photoBytes: async () => photo,
        iterations: FULL ? 600_000 : 1000,
        dbName: `bench-${FULL ? 'full' : 'quick'}`,
      });
      // eslint-disable-next-line no-console -- таблица замера в консоли — смысл этого прогона
      if (FULL) console.table(rows);
      expect(rows.length).toBeGreaterThan(10);
    },
    FULL ? 600_000 : 60_000,
  );
});
