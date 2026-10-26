// Требования к мастер-паролю (SPEC §10.3): индикатор надёжности как в прототипе.

/** Надёжность пароля 0…5 — как в прототипе: длина, регистр, цифры, знаки. */
export function passwordStrength(p: string): number {
  let s = 0;
  if (p.length >= 10) s += 1;
  if (p.length >= 14) s += 1;
  if (/[a-zа-яё]/.test(p) && /[A-ZА-ЯЁ]/.test(p)) s += 1;
  if (/\d/.test(p)) s += 1;
  if (/[^\wа-яё]/i.test(p)) s += 1;
  return s;
}

export const MIN_STRENGTH = 3;
