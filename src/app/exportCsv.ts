// Открытая выгрузка (SPEC §9.2): таблицы CSV для Excel (UTF-8 с BOM, разделитель «;»).
// Данные о здоровье — только по отдельной галочке. Колонки — как в прототипе.
import { clientInfo } from '../domain/client';
import type { DomainIndex } from '../domain/indexing';
import { formalName } from '../domain/search';
import { fmtPhone } from '../domain/phone';
import type { Client, Entity } from '../domain/types';
import { fmtDateNum } from '../i18n/format';
import { CONTACT, HEALING, PAYMENT, PHOTO_STAGE, STATUS, VISIT_TYPE, ru } from '../i18n/ru';
import { ZipWriter } from '../backup/zip';
import { anestName, courseName, healthMarks, needleName, pigmentFull, procTotal, serviceName, zoneName } from './names';

type Cell = string | number | null | undefined;

function cell(v: Cell): string {
  const s = String(v ?? '');
  // Формулы Excel из текста не выполняем: =, +, -, @ в начале экранируем апострофом
  const safe = /^[=+\-@\t\r]/.test(s) && !/^-?\d+([.,]\d+)?$/.test(s) ? `'${s}` : s;
  return /[;"\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** Метка UTF-8 в начале файла: без неё Excel откроет кириллицу кракозябрами. */
const BOM = String.fromCharCode(0xfeff);

export function toCsv(rows: Cell[][]): string {
  return BOM + rows.map((r) => r.map(cell).join(';')).join('\r\n');
}

const X = ru.exportCsv;

export function clientsCsv(idx: DomainIndex, withHealth: boolean): string {
  const head: Cell[] = [...X.clientCols];
  if (withHealth) head.push(...X.healthCols);
  const rows: Cell[][] = [head];
  for (const c of idx.data.clients.slice().sort((a, b) => a.cardNo - b.cardNo)) {
    const inf = clientInfo(idx, c);
    const cons = c.consents;
    const r: Cell[] = [
      c.cardNo,
      c.lastName,
      c.firstName,
      c.middleName,
      fmtPhone(c.phone),
      c.contact ? CONTACT[c.contact.kind] : '',
      c.contact?.handle ?? '',
      fmtDateNum(c.birth),
      c.source,
      (c.tags || []).join(', '),
      fmtDateNum(cons?.pd?.date ?? ''),
      fmtDateNum(cons?.procedure?.date ?? ''),
      fmtDateNum(cons?.health?.date ?? ''),
      inf.first ? fmtDateNum(inf.first.date) : '',
      inf.last ? fmtDateNum(inf.last.date) : '',
      inf.visits,
      inf.spent,
      c.notes,
    ];
    if (withHealth) r.push(c.health?.filledAt ? fmtDateNum(c.health.filledAt) : '', healthMarks(c).join('; '));
    rows.push(r);
  }
  return toCsv(rows);
}

export function proceduresCsv(idx: DomainIndex): string {
  const rows: Cell[][] = [[...X.procCols]];
  for (const p of idx.data.procedures.slice().sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))) {
    const c = idx.client.get(p.clientId);
    const cert = p.certificateId ? idx.data.certificates.find((x) => x.id === p.certificateId) : null;
    const disc = p.discount?.value ? p.discount : null;
    rows.push([
      c?.cardNo ?? '',
      c ? formalName(c) : '',
      fmtDateNum(p.date),
      serviceName(idx, p.serviceId),
      VISIT_TYPE[p.type],
      zoneName(idx, p.zone),
      p.technique,
      p.anesthesia.primary ? anestName(idx, p.anesthesia.primary) : '',
      p.anesthesia.secondary ? anestName(idx, p.anesthesia.secondary) : '',
      p.pigments.map((g) => X.pigment(pigmentFull(idx, g.pigmentId), g.lot, g.ratio)).join(' + '),
      p.needles.map((id) => needleName(idx, id)).join(', '),
      p.price,
      disc ? disc.value : '',
      disc ? (disc.mode === 'pct' ? '%' : '₽') : '',
      p.discount?.reason ?? '',
      procTotal(p),
      PAYMENT[p.payment] ?? '',
      cert?.no ?? '',
      STATUS[p.status],
      p.model?.on ? X.yes : '',
      p.model?.on ? courseName(idx, p.model.courseId) : '',
      p.healing?.status ? HEALING[p.healing.status] : '',
      p.note,
    ]);
  }
  return toCsv(rows);
}

export function expensesCsv(idx: DomainIndex): string {
  const rows: Cell[][] = [[...X.expenseCols]];
  for (const e of idx.data.expenses.slice().sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))) {
    rows.push([fmtDateNum(e.date), e.category, e.name, e.amount]);
  }
  return toCsv(rows);
}

/** Имена файлов фото в открытом архиве: папка клиента, дата, подпись стадии. */
export function photoFileNames(idx: DomainIndex, c: Entity<Client>): { blobId: string; path: string }[] {
  const folder = clean(`${c.cardNo} ${formalName(c)}`);
  const out: { blobId: string; path: string }[] = [];
  const used = new Set<string>();
  const put = (blobId: string, base: string) => {
    let name = clean(base);
    for (let i = 2; used.has(name); i += 1) name = clean(`${base} (${i})`);
    used.add(name);
    out.push({ blobId, path: `${X.photosDir}/${folder}/${name}.jpg` });
  };
  if (c.facePhoto) put(c.facePhoto.blobId, X.facePhoto);
  c.consents?.pd?.photos?.forEach((r, i) => put(r.blobId, X.consentPd(i + 1)));
  c.consents?.procedure?.photos?.forEach((r, i) => put(r.blobId, X.consentProc(i + 1)));
  for (const p of idx.data.procedures.filter((x) => x.clientId === c.id)) {
    for (const st of ['before', 'after', 'month'] as const) {
      (p.photos?.[st] || []).forEach((r, i) =>
        put(r.blobId, `${p.date} ${zoneName(idx, p.zone)} ${PHOTO_STAGE[st]} ${i + 1}`),
      );
    }
  }
  return out.filter((x) => !x.blobId.startsWith('demo:'));
}

/** Убрать из имени файла символы, запрещённые в Windows и macOS. */
const clean = (s: string) =>
  s
    .split('')
    .map((ch) => (ch.charCodeAt(0) < 32 || '\\/:*?"<>|'.includes(ch) ? ' ' : ch))
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100);

/** Всё одним архивом: три таблицы и папка фото (оригиналы, расшифрованные). */
export async function openArchive(
  idx: DomainIndex,
  withHealth: boolean,
  getBlob: (id: string) => Promise<Blob | null>,
  onProgress?: (done: number, total: number) => void,
): Promise<{ blob: Blob; missing: number }> {
  const zip = new ZipWriter();
  const enc = new TextEncoder();
  zip.add(X.fileClients, enc.encode(clientsCsv(idx, withHealth)));
  zip.add(X.fileProcedures, enc.encode(proceduresCsv(idx)));
  zip.add(X.fileExpenses, enc.encode(expensesCsv(idx)));
  const photos = idx.data.clients.flatMap((c) => photoFileNames(idx, c));
  let missing = 0;
  let done = 0;
  for (const ph of photos) {
    const b = await getBlob(ph.blobId).catch(() => null);
    if (b) zip.add(ph.path, new Uint8Array(await b.arrayBuffer()));
    else missing += 1;
    done += 1;
    onProgress?.(done, photos.length);
  }
  return { blob: zip.finish(), missing };
}
