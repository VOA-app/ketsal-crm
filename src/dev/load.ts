// Нагрузочная база для этапа 7 (SPEC §12): демо-набор, размноженный до нужного числа карт и процедур.
// Только выдуманные данные. Используется в тестах (tests/unit/load.test.ts) и на странице замера демо-версии.
import type { Data, Entity, PhotoRef, Procedure } from '../domain/types';
import { buildDemo } from './demo';

export interface LoadSize {
  clients: number;
  procedures: number;
}

export const LOAD_SIZE: LoadSize = { clients: 1000, procedures: 4000 };

/**
 * Копии демо-клиентов с их процедурами, пока не наберётся нужное число. У копии свой id, № карты
 * и телефон, имена те же — так поиск по фамилии находит много совпадений, как в живой базе.
 */
export function buildLoad(T: string, size: LoadSize = LOAD_SIZE): Data {
  const demo = buildDemo(T);
  const D: Data = { ...demo, clients: [], procedures: [] };
  const byClient = new Map<string, Entity<Procedure>[]>();
  for (const p of demo.procedures) {
    if (!byClient.has(p.clientId)) byClient.set(p.clientId, []);
    byClient.get(p.clientId)!.push(p);
  }
  let cardNo = 0;
  // Карты — копиями демо-клиентов вместе с их процедурами
  for (let k = 0; D.clients.length < size.clients; k += 1) {
    for (const c of demo.clients) {
      if (D.clients.length >= size.clients) break;
      const id = k ? `${c.id}_${k}` : c.id;
      cardNo += 1;
      const phone = `+7917${String(1_000_000 + cardNo).slice(-7)}`;
      D.clients.push({ ...c, id, cardNo, phone, reminded: {} });
      for (const p of byClient.get(c.id) ?? []) {
        if (D.procedures.length >= size.procedures) break;
        D.procedures.push({
          ...p,
          id: k ? `${p.id}_${k}` : p.id,
          clientId: id,
          certificateId: k ? '' : p.certificateId,
        });
      }
    }
  }
  // Процедур не хватает — ещё визиты тех же клиенток
  for (let k = 0; D.procedures.length < size.procedures; k += 1) {
    for (let i = 0; i < D.clients.length && D.procedures.length < size.procedures; i += 1) {
      const base = demo.procedures[(i + k) % demo.procedures.length];
      D.procedures.push({ ...base, id: `${base.id}_x${k}_${i}`, clientId: D.clients[i].id, certificateId: '' });
    }
  }
  D.settings = { ...demo.settings, nextCardNo: cardNo + 1 };
  return D;
}

/**
 * Заменить фото первых процедур на n настоящих ссылок (до, сразу после, через месяц по очереди).
 * Возвращает ссылки: файлы для них создаёт вызывающий код.
 */
export function attachLoadPhotos(D: Data, n: number): PhotoRef[] {
  const refs: PhotoRef[] = [];
  const stages = ['before', 'after', 'month'] as const;
  for (const p of D.procedures) p.photos = { before: [], after: [], month: [] };
  for (let i = 0; i < n; i += 1) {
    const p = D.procedures[Math.floor(i / stages.length) % D.procedures.length];
    const ref: PhotoRef = {
      blobId: `LOADB${String(i).padStart(6, '0')}`,
      thumbId: `LOADT${String(i).padStart(6, '0')}`,
      width: 1440,
      height: 2560,
      bytes: 0,
    };
    p.photos[stages[i % stages.length]].push(ref);
    refs.push(ref);
  }
  return refs;
}
