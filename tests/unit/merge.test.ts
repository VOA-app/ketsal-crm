import { describe, expect, it } from 'vitest';
import { Clock, hlcString, parseHlc } from '../../src/domain/hlc';
import {
  fixDuplicateCardNos,
  mergeCatalog,
  mergeEnvelope,
  mergeRecords,
  type CatalogState,
  type Envelope,
} from '../../src/sync/merge';
import { mulberry32 } from '../../src/dev/demo';

const h = (ms: number, node = 'A', c = 0) => hlcString(ms, c, node);

const live = (id: string, fields: Record<string, [unknown, number, string?]>, createdAt = '2026-01-01'): Envelope => {
  const v: Record<string, unknown> = {};
  const fu: Record<string, string> = {};
  let max = '';
  for (const [k, [val, ms, node]] of Object.entries(fields)) {
    v[k] = val;
    fu[k] = h(ms, node ?? 'A');
    if (fu[k] > max) max = fu[k];
  }
  return { id, kind: 'procedure', createdAt, updatedAt: max, fieldUpdatedAt: fu, v };
};
const tomb = (id: string, ms: number, purged = false, node = 'A'): Envelope => ({
  id,
  kind: 'procedure',
  createdAt: '2026-01-01',
  updatedAt: h(ms, node),
  fieldUpdatedAt: {},
  deleted: true,
  ...(purged ? { purged: true as const } : {}),
});

describe('часы HLC', () => {
  it('строки сравниваются как время', () => {
    expect(h(1000) < h(1001)).toBe(true);
    expect(hlcString(1000, 1, 'A') > hlcString(1000, 0, 'Z')).toBe(true);
    expect(parseHlc(hlcString(0x17f3a2b4c, 3, 'dev-1'))).toEqual({ ms: 0x17f3a2b4c, counter: 3, node: 'dev-1' });
  });
  it('каждое событие позже предыдущего, даже если время стоит или ушло назад', () => {
    let t = 1000;
    const c = new Clock('A', () => t);
    const a = c.tick();
    const b = c.tick();
    t = 500;
    const d = c.tick();
    expect(a < b && b < d).toBe(true);
  });
  it('учитывает время с другого устройства', () => {
    const c = new Clock('A', () => 1000);
    c.receive(h(5000, 'B', 7));
    expect(c.tick() > h(5000, 'B', 7)).toBe(true);
  });
});

describe('слияние записей', () => {
  it('пополевое: правки разных полей сохраняются обе', () => {
    const base = { price: [7000, 1] as [unknown, number], status: ['done', 1] as [unknown, number] };
    const phone = live('p1', { ...base, price: [6500, 5, 'A'] });
    const pc = live('p1', { ...base, status: ['noshow', 6, 'B'] });
    const m = mergeEnvelope(phone, pc);
    expect(m.v).toEqual({ price: 6500, status: 'noshow' });
    expect(mergeEnvelope(pc, phone)).toEqual(m);
  });

  it('одно поле: побеждает более поздняя правка', () => {
    const a = live('p1', { note: ['утро', 5, 'A'] });
    const b = live('p1', { note: ['вечер', 9, 'B'] });
    expect(mergeEnvelope(a, b).v!.note).toBe('вечер');
    expect(mergeEnvelope(b, a).v!.note).toBe('вечер');
  });

  it('удаление против правки: удаление окончательно', () => {
    const edit = live('p1', { note: ['после', 9] });
    const del = tomb('p1', 5);
    expect(mergeEnvelope(edit, del).deleted).toBe(true);
    expect(mergeEnvelope(del, edit).deleted).toBe(true);
  });

  it('purged побеждает любые правки, даже более поздние', () => {
    const edit = live('c1', { lastName: ['Офлайн-правка', 99] });
    const purged = tomb('c1', 1, true);
    const m = mergeEnvelope(edit, purged);
    expect(m.purged).toBe(true);
    expect(m.v).toBeUndefined();
    expect(mergeEnvelope(tomb('c1', 50), purged).purged).toBe(true);
  });

  it('набор записей: новые с обеих сторон, общие — сливаются', () => {
    const a = [live('a', { x: [1, 1] }), live('b', { x: [1, 1] })];
    const b = [live('b', { x: [2, 2] }), live('c', { x: [3, 3] })];
    const m = mergeRecords(a, b);
    expect(m.map((e) => [e.id, e.v!.x])).toEqual([
      ['a', 1],
      ['b', 2],
      ['c', 3],
    ]);
  });
});

// ── Property-тесты: случайные версии одной записи ──

function randomVersions(seed: number, n: number): Envelope[] {
  const r = mulberry32(seed);
  const pick = <T>(arr: T[]) => arr[Math.floor(r() * arr.length)];
  const out: Envelope[] = [];
  for (let i = 0; i < n; i += 1) {
    const kind = r();
    if (kind < 0.12) out.push(tomb('x', Math.floor(r() * 20), r() < 0.3, pick(['A', 'B', 'C'])));
    else {
      const fields: Record<string, [unknown, number, string]> = {};
      for (const f of ['price', 'note', 'status', 'zone']) {
        // Одинаковые отметки времени с разными значениями тоже встречаются
        fields[f] = [pick([1, 2, 3, 'а', 'б', null]), Math.floor(r() * 10), pick(['A', 'B'])];
      }
      out.push(live('x', fields, pick(['2026-01-01', '2026-01-02'])));
    }
  }
  return out;
}

describe('свойства слияния', () => {
  it('коммутативность, идемпотентность, ассоциативность', () => {
    for (let seed = 1; seed <= 400; seed += 1) {
      const [a, b, c] = randomVersions(seed, 3);
      expect(mergeEnvelope(a, b)).toEqual(mergeEnvelope(b, a));
      expect(mergeEnvelope(a, a)).toEqual(a);
      expect(mergeEnvelope(mergeEnvelope(a, b), c)).toEqual(mergeEnvelope(a, mergeEnvelope(b, c)));
    }
  });

  it('любой порядок обмена между устройствами даёт одно и то же', () => {
    for (let seed = 1; seed <= 100; seed += 1) {
      const versions = randomVersions(seed * 7, 5);
      const forward = versions.reduce(mergeEnvelope);
      const backward = versions.slice().reverse().reduce(mergeEnvelope);
      const shuffled = versions
        .map((v, i) => ({ v, k: mulberry32(seed + i)() }))
        .sort((x, y) => x.k - y.k)
        .map((x) => x.v)
        .reduce(mergeEnvelope);
      expect(backward).toEqual(forward);
      expect(shuffled).toEqual(forward);
    }
  });
});

describe('каталог', () => {
  const cat = (values: Record<string, unknown>, times: Record<string, number>): CatalogState => ({
    values,
    fieldUpdatedAt: Object.fromEntries(Object.entries(times).map(([k, t]) => [k, h(t)])),
  });

  it('пополевое слияние, номера карт и сертификатов — по максимуму', () => {
    const a = cat(
      { 'settings.corrFrom': 30, 'settings.nextCardNo': 12, 'lists.tags': ['A'] },
      { 'settings.corrFrom': 5, 'settings.nextCardNo': 1, 'lists.tags': 2 },
    );
    const b = cat(
      { 'settings.corrFrom': 28, 'settings.nextCardNo': 15, 'lists.tags': ['A', 'B'] },
      { 'settings.corrFrom': 3, 'settings.nextCardNo': 9, 'lists.tags': 8 },
    );
    const m = mergeCatalog(a, b);
    expect(m.values).toEqual({ 'settings.corrFrom': 30, 'settings.nextCardNo': 15, 'lists.tags': ['A', 'B'] });
    expect(mergeCatalog(b, a)).toEqual(m);
    expect(mergeCatalog(a, a)).toEqual(a);
  });
});

describe('дубль номера карты', () => {
  const client = (id: string, cardNo: number, createdAt: string): Envelope => ({
    id,
    kind: 'client',
    createdAt,
    updatedAt: h(1),
    fieldUpdatedAt: { cardNo: h(1) },
    v: { cardNo },
  });

  it('карта, созданная позже, получает следующий свободный номер', () => {
    let t = 100;
    const stamp = () => h((t += 1), 'A');
    const recs = [client('a', 1, '2026-01-01'), client('b', 2, '2026-01-02'), client('c', 2, '2026-01-03')];
    const changed = fixDuplicateCardNos(recs, stamp);
    expect(changed).toHaveLength(1);
    expect(changed[0]).toMatchObject({ id: 'c', v: { cardNo: 3, cardNoChanged: true } });
    expect(fixDuplicateCardNos(recs.slice().reverse(), stamp).map((e) => [e.id, e.v!.cardNo])).toEqual([['c', 3]]);
  });

  it('удалённые карты номер не занимают', () => {
    const recs = [
      client('a', 1, '2026-01-01'),
      { ...tomb('b', 5), kind: 'client' as const },
      client('c', 2, '2026-01-03'),
    ];
    expect(fixDuplicateCardNos(recs, () => h(200))).toEqual([]);
  });
});
