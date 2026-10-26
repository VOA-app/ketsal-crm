// Слияние записей и каталога (SPEC §7.1). Чистые функции без ввода-вывода.
// Слияние детерминированно и коммутативно: merge(A, B) = merge(B, A), merge(A, A) = A.
import { maxHlc, type HLC } from '../domain/hlc';
import type { Kind } from '../db/kinds';

/** Конверт записи (SPEC §4.1). У tombstone нет v; у purged — только служебные поля. */
export interface Envelope {
  id: string;
  kind: Kind;
  createdAt: string;
  updatedAt: HLC;
  /** Для пополевого слияния: поле верхнего уровня v → время его последнего изменения */
  fieldUpdatedAt: Record<string, HLC>;
  v?: Record<string, unknown>;
  deleted?: true;
  purged?: true;
}

const json = (x: unknown) => JSON.stringify(x ?? null);

/** Детерминированный выбор при равных отметках времени. */
const later = (a: Envelope, b: Envelope) =>
  a.updatedAt !== b.updatedAt ? a.updatedAt > b.updatedAt : json(a) >= json(b);

/**
 * Порядок: полное удаление > удаление > живая запись. Внутри одного вида — более позднее.
 * Удаление окончательно: правка с другого устройства его не отменяет. Так слияние остаётся
 * ассоциативным и все устройства приходят к одному результату при любом порядке обмена.
 * «Вернуть» после удаления создаёт запись заново под новым id.
 */
const rank = (e: Envelope) => (e.purged ? 2 : e.deleted ? 1 : 0);

export function mergeEnvelope(a: Envelope, b: Envelope): Envelope {
  if (a === b) return a;
  const ra = rank(a);
  const rb = rank(b);
  if (ra !== rb) return ra > rb ? a : b;
  if (ra > 0) return later(a, b) ? a : b;
  // Обе живые: по каждому полю — значение с более поздней отметкой
  const fields = new Set([
    ...Object.keys(a.fieldUpdatedAt),
    ...Object.keys(b.fieldUpdatedAt),
    ...Object.keys(a.v ?? {}),
    ...Object.keys(b.v ?? {}),
  ]);
  const v: Record<string, unknown> = {};
  const fu: Record<string, HLC> = {};
  for (const f of Array.from(fields).sort()) {
    const ta = a.fieldUpdatedAt[f] ?? '';
    const tb = b.fieldUpdatedAt[f] ?? '';
    const va = a.v?.[f];
    const vb = b.v?.[f];
    let takeA: boolean;
    if (ta !== tb) takeA = ta > tb;
    else takeA = json(va) >= json(vb);
    const val = takeA ? va : vb;
    if (val !== undefined || (takeA ? f in (a.v ?? {}) : f in (b.v ?? {}))) v[f] = val;
    const t = takeA ? ta : tb;
    if (t) fu[f] = t;
  }
  return {
    id: a.id,
    kind: a.kind,
    createdAt: a.createdAt <= b.createdAt ? a.createdAt : b.createdAt,
    updatedAt: maxHlc(a.updatedAt, b.updatedAt),
    fieldUpdatedAt: fu,
    v,
  };
}

/** Слить два набора записей (шард): по id. Результат отсортирован по id. */
export function mergeRecords(a: Iterable<Envelope>, b: Iterable<Envelope>): Envelope[] {
  const m = new Map<string, Envelope>();
  for (const e of a) m.set(e.id, e);
  for (const e of b) {
    const cur = m.get(e.id);
    m.set(e.id, cur ? mergeEnvelope(cur, e) : e);
  }
  return Array.from(m.values()).sort((x, y) => (x.id < y.id ? -1 : x.id > y.id ? 1 : 0));
}

// ── Каталог: настройки и списки вариантов, пополевно ──

export interface CatalogState {
  /** Ключи вида `settings.corrFrom`, `lists.tags` */
  values: Record<string, unknown>;
  fieldUpdatedAt: Record<string, HLC>;
}

/** Поля, которые сливаются по максимуму, а не по времени (§7.1). */
const MAX_FIELDS = new Set(['settings.nextCardNo', 'settings.nextCertNo']);

export function mergeCatalog(a: CatalogState, b: CatalogState): CatalogState {
  const keys = new Set([...Object.keys(a.values), ...Object.keys(b.values)]);
  const values: Record<string, unknown> = {};
  const fu: Record<string, HLC> = {};
  for (const k of Array.from(keys).sort()) {
    const ta = a.fieldUpdatedAt[k] ?? '';
    const tb = b.fieldUpdatedAt[k] ?? '';
    if (MAX_FIELDS.has(k)) {
      values[k] = Math.max(Number(a.values[k]) || 0, Number(b.values[k]) || 0);
    } else if (!(k in b.values)) values[k] = a.values[k];
    else if (!(k in a.values)) values[k] = b.values[k];
    else if (ta !== tb) values[k] = ta > tb ? a.values[k] : b.values[k];
    else values[k] = json(a.values[k]) >= json(b.values[k]) ? a.values[k] : b.values[k];
    const t = maxHlc(ta, tb);
    if (t) fu[k] = t;
  }
  return { values, fieldUpdatedAt: fu };
}

// ── Дубль номера карты (§7.1) ──

/**
 * Если после слияния у двух живых карт один номер — карта, созданная позже, получает следующий
 * свободный номер и отметку «номер изменён при синхронизации». Возвращает изменённые записи.
 * На всех устройствах результат одинаковый: решение зависит только от данных.
 */
export function fixDuplicateCardNos(records: Envelope[], stamp: () => HLC): Envelope[] {
  const clients = records
    .filter((e) => e.kind === 'client' && !e.deleted && e.v)
    .sort((x, y) => (x.createdAt !== y.createdAt ? (x.createdAt < y.createdAt ? -1 : 1) : x.id < y.id ? -1 : 1));
  const used = new Set<number>();
  let maxNo = clients.reduce((m, e) => Math.max(m, Number(e.v!.cardNo) || 0), 0);
  const changed: Envelope[] = [];
  for (const e of clients) {
    const no = Number(e.v!.cardNo) || 0;
    if (!used.has(no)) {
      used.add(no);
      continue;
    }
    maxNo += 1;
    used.add(maxNo);
    const t = stamp();
    changed.push({
      ...e,
      updatedAt: t,
      v: { ...e.v, cardNo: maxNo, cardNoChanged: true },
      fieldUpdatedAt: { ...e.fieldUpdatedAt, cardNo: t, cardNoChanged: t },
    });
  }
  return changed;
}
