// Поиск клиенток (SPEC §4.4): цифры — номер карты или фрагмент телефона, иначе — слова в ФИО и нике.
import { clientInfo, type ClientInfo } from './client';
import type { DomainIndex } from './indexing';
import { normPhone, phoneQueryDigits } from './phone';
import { sortClientItems } from './reminders';
import { norm } from './text';
import type { Client, Entity, ID } from './types';

export interface SearchHit {
  c: Entity<Client>;
  inf: ClientInfo;
  byCard?: boolean;
}

const DIGITS_QUERY = /^[\d\s()+\-№.]+$/;

export function searchClients(idx: DomainIndex, q: string): SearchHit[] {
  const raw = String(q || '').trim();
  if (!raw) return [];
  const res: SearchHit[] = [];
  if (DIGITS_QUERY.test(raw)) {
    const card = raw.replace(/[^\d]/g, '');
    const digits = phoneQueryDigits(raw);
    for (const c of idx.data.clients) {
      const byCard = String(c.cardNo) === card;
      const byPhone = digits.length >= 3 && String(c.phone).replace(/\D/g, '').includes(digits);
      if (byCard || byPhone) res.push({ c, inf: clientInfo(idx, c), byCard });
    }
    res.sort((a, b) => (b.byCard ? 1 : 0) - (a.byCard ? 1 : 0) || a.c.cardNo - b.c.cardNo);
    return res;
  }
  const words = norm(raw).split(/\s+/).filter(Boolean);
  for (const c of idx.data.clients) {
    const hay = norm(`${c.lastName} ${c.firstName} ${c.middleName} ${c.contact?.handle || ''}`);
    if (words.every((w) => hay.includes(w))) res.push({ c, inf: clientInfo(idx, c) });
  }
  return sortClientItems(res, 'name');
}

/** Другая клиентка с тем же телефоном (предупреждение о дубле при создании карты). */
export function findByPhone(idx: DomainIndex, phone: string, exceptId?: ID): Entity<Client> | null {
  const p = normPhone(phone);
  if (!p || p.length < 12) return null;
  return idx.data.clients.find((c) => c.phone === p && c.id !== exceptId) ?? null;
}

export const fullName = (c: Client): string => [c.firstName, c.lastName].filter(Boolean).join(' ');
export const formalName = (c: Client): string => [c.lastName, c.firstName, c.middleName].filter(Boolean).join(' ');
export const initials = (c: Client): string =>
  `${(c.firstName || '')[0] || ''}${(c.lastName || '')[0] || ''}`.toUpperCase() || '·';

/** Номер для новой карты: счётчик из настроек, но не меньше «самый большой номер + 1». */
export const nextCardNo = (data: { settings: { nextCardNo: number }; clients: { cardNo: number }[] }): number =>
  Math.max(data.settings.nextCardNo, ...data.clients.map((c) => c.cardNo + 1), 1);
