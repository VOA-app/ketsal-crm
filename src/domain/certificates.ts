// Подарочные сертификаты (SPEC §4.4).
import type { DomainIndex } from './indexing';
import type { Certificate, Entity, ID, Procedure } from './types';

export type CertStatus = 'active' | 'used' | 'expired';

export function certStatus(cert: Certificate, today: string): CertStatus {
  if (cert.usedProcId) return 'used';
  if (cert.validTo && cert.validTo < today) return 'expired';
  return 'active';
}

/** Сертификаты, которыми можно оплатить процедуру на эту дату (плюс уже выбранный). */
export function availableCerts(idx: DomainIndex, d: { certificateId: ID | ''; date: string }): Entity<Certificate>[] {
  const on = d.date || idx.today;
  return idx.data.certificates.filter(
    (x) => x.id === d.certificateId || (!x.usedProcId && (!x.validTo || x.validTo >= on)),
  );
}

/**
 * Привязка сертификатов после сохранения процедуры: при оплате сертификатом и статусе «состоялась»
 * он становится использованным; если процедура больше его не использует — освобождается.
 */
export function relinkCertificates(
  certs: Entity<Certificate>[],
  proc: Entity<Procedure> | null,
  procId: ID,
): Entity<Certificate>[] {
  const useId = proc && proc.payment === 'cert' && proc.status === 'done' ? proc.certificateId : '';
  return certs.map((x) => {
    if (x.id === useId && x.usedProcId !== procId) return { ...x, usedProcId: procId, usedAt: proc!.date };
    if (x.id === useId && x.usedProcId === procId && x.usedAt !== proc!.date) return { ...x, usedAt: proc!.date };
    if (x.id !== useId && x.usedProcId === procId) return { ...x, usedProcId: '', usedAt: '' };
    return x;
  });
}
