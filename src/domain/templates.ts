// Шаблоны сообщений: подстановки {имя} {зона} {дата} {дней} (SPEC §4.2).
import { daysBetween } from './dates';
import { lc } from './text';
import type { Client, Procedure } from './types';

export interface TemplateContext {
  zoneName?: string;
  proc?: Pick<Procedure, 'date'>;
  today: string;
  /** Дата прописью, с годом */
  fmtDate: (iso: string) => string;
  /** Подстановка для {зона}, если зоны нет */
  noZone: string;
}

export function fillTemplate(tpl: string, c: Client, ctx: TemplateContext): string {
  const zoneTxt = ctx.zoneName ? lc(ctx.zoneName) : ctx.noZone;
  const days = ctx.proc ? String(daysBetween(ctx.proc.date, ctx.today)) : '';
  return String(tpl || '')
    .replace(/\{имя\}/g, c.firstName || '')
    .replace(/\{зона\}/g, zoneTxt)
    .replace(/\{дата\}/g, ctx.proc ? ctx.fmtDate(ctx.proc.date) : '')
    .replace(/\{дней\}/g, days);
}
