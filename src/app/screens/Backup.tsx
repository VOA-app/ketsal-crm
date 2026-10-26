// Резервная копия и выгрузка (SPEC §9): зашифрованный файл .ketsal и открытые таблицы для Excel.
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import {
  backupFileName,
  BackupFormatError,
  fetchPhotosForExport,
  isRecoveryCode,
  makeBackup,
  needsSecret,
  openBackup,
  restoreBackup,
  unlockBackup,
  WrongSecretError,
  type BackupInfo,
  type BuildResult,
  type ImportMode,
} from '../../backup/service';
import { getBlob } from '../../db/repo';
import { toISO } from '../../domain/dates';
import { cap } from '../../domain/text';
import { fmtBytes, fmtDate, pl, relDay } from '../../i18n/format';
import { ru } from '../../i18n/ru';
import { clientsCsv, expensesCsv, openArchive, proceduresCsv } from '../exportCsv';
import { Icon } from '../components/Icon';
import { Check, Field, NavBar } from '../components/kit';
import { SheetBody, SheetFoot, SheetHead, useSheet } from '../components/Sheet';
import { pickFile, saveFile, shareAvailable } from '../share';
import { useData } from '../store';
import { ui } from '../ui';

const B = ru.backup;
const X = ru.exportCsv;

const counts = (c: number, p: number) => [pl(c, 'карта', 'карты', 'карт'), pl(p, 'процедура', 'процедуры', 'процедур')];
const photosText = (n: number) => pl(n, 'фото', 'фото', 'фото');

/** Строка прогресса для долгих операций. */
function ProgressLine({ text }: { text: string }) {
  return (
    <div className="backup-progress" role="status" aria-live="polite">
      <span className="spinner" aria-hidden="true" />
      <span>{text}</span>
    </div>
  );
}

// ── Сохранить копию ──

function MakeSheet() {
  const { close } = useSheet();
  const [step, setStep] = useState<string>(B.preparing);
  const [res, setRes] = useState<BuildResult | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    makeBackup((stage, done, total) => {
      if (!alive) return;
      setStep(stage === 'photos' ? B.fetching(done, total) : B.packing);
    })
      .then((r) => alive && setRes(r))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, []);

  const save = async () => {
    if (!res) return;
    const today = useData.getState().idx.today;
    const file = new File([res.blob], backupFileName(today), { type: 'application/octet-stream' });
    if (!(await saveFile(file))) return;
    useData.getState().apply((tx) => tx.settings({ lastBackup: today }));
    close();
    ui().toast(B.saved);
  };

  const [c, p] = res ? counts(res.manifest.counts.clients, res.manifest.counts.procedures) : ['', ''];
  return (
    <>
      <SheetHead title={res ? B.readyTitle : B.title} left={ru.common.close} />
      <SheetBody>
        {failed ? (
          <p>{B.failed}</p>
        ) : res ? (
          <>
            <p>{B.readyText(c, p, photosText(res.manifest.counts.photos), fmtBytes(res.blob.size))}</p>
            {res.missingPhotos > 0 && (
              <div className="warn-box">
                <div className="warn warn--danger">
                  <span className="dot dot--alert" />
                  <div>{B.missing(res.missingPhotos)}</div>
                </div>
              </div>
            )}
          </>
        ) : (
          <ProgressLine text={step} />
        )}
      </SheetBody>
      {res && (
        <SheetFoot>
          <button type="button" className="btn btn-primary" onClick={() => void save()}>
            <Icon name="download" /> {shareAvailable() ? B.saveFile : B.download}
          </button>
        </SheetFoot>
      )}
    </>
  );
}

// ── Восстановить ──

type RestoreStep =
  | { k: 'check'; text: string }
  | { k: 'error'; text: string }
  | { k: 'secret' }
  | { k: 'mode' }
  | { k: 'work'; text: string };

function RestoreSheet({ file }: { file: File }) {
  const { close } = useSheet();
  const navigate = useNavigate();
  const [step, setStep] = useState<RestoreStep>({ k: 'check', text: B.checking(0, 1) });
  const [info, setInfo] = useState<BackupInfo | null>(null);
  const [key, setKey] = useState<CryptoKey | null>(null);
  const [useRecovery, setUseRecovery] = useState(false);
  const [secret, setSecret] = useState('');
  const [secretErr, setSecretErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    openBackup(file, (_s, done, total) => alive && setStep({ k: 'check', text: B.checking(done, total) }))
      .then((i) => {
        if (!alive) return;
        setInfo(i);
        setStep(needsSecret(i) ? { k: 'secret' } : { k: 'mode' });
      })
      .catch((e) => {
        if (!alive) return;
        const notBackup = e instanceof BackupFormatError && e.reason === 'notBackup';
        setStep({ k: 'error', text: notBackup ? B.notBackup : B.damaged });
      });
    return () => {
      alive = false;
    };
  }, [file]);

  const unlock = async () => {
    if (!info || busy) return;
    if (useRecovery && !isRecoveryCode(secret)) {
      setSecretErr(B.wrong);
      return;
    }
    setBusy(true);
    try {
      setKey(await unlockBackup(info, useRecovery ? { recovery: secret } : { password: secret }));
      setSecret('');
      setStep({ k: 'mode' });
    } catch (e) {
      setSecretErr(e instanceof WrongSecretError ? B.wrong : B.damaged);
    } finally {
      setBusy(false);
    }
  };

  const run = async (mode: ImportMode) => {
    if (!info) return;
    if (mode === 'replace') {
      const ok = await ui().confirm({
        title: B.replaceConfirm,
        text: B.replaceConfirmText,
        ok: B.replaceOk,
        requireWord: B.replaceWord,
      });
      if (!ok) return;
    }
    setStep({ k: 'work', text: B.restoringData });
    try {
      const r = await restoreBackup(info, key, mode, (_s, done, total) =>
        setStep({ k: 'work', text: B.restoring(done, total) }),
      );
      useData.getState().reload();
      close();
      navigate('/clients', { replace: true });
      const [c, p] = counts(r.clients, r.procedures);
      ui().toast(B.restored(c, p));
    } catch {
      // Записи пишутся одним шагом: при ошибке до него данные не менялись
      useData.getState().reload();
      setStep({ k: 'error', text: B.restoreFailed });
    }
  };

  const m = info?.manifest;
  const [c, p] = m ? counts(m.counts.clients, m.counts.procedures) : ['', ''];
  return (
    <>
      <SheetHead
        title={step.k === 'secret' ? B.otherTitle : B.modeTitle}
        left={step.k === 'work' ? null : ru.common.close}
      />
      <SheetBody>
        {(step.k === 'check' || step.k === 'work') && <ProgressLine text={step.text} />}
        {step.k === 'error' && <p>{step.text}</p>}
        {step.k === 'secret' && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void unlock();
            }}
          >
            <p>{B.otherText}</p>
            <Field label={useRecovery ? B.recovery : B.password} err={secretErr}>
              <input
                className="input"
                type={useRecovery ? 'text' : 'password'}
                autoComplete="off"
                autoCapitalize={useRecovery ? 'characters' : 'off'}
                spellCheck={false}
                value={secret}
                onChange={(e) => {
                  setSecret(e.target.value);
                  setSecretErr('');
                }}
              />
            </Field>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => {
                setUseRecovery(!useRecovery);
                setSecret('');
                setSecretErr('');
              }}
            >
              {useRecovery ? B.usePassword : B.useRecovery}
            </button>
          </form>
        )}
        {step.k === 'mode' && m && (
          <>
            <p>{B.modeInfo(fmtDate(toISO(new Date(m.createdAt)), true), c, p, photosText(m.counts.photos))}</p>
            <div className="btn-stack">
              <button type="button" className="btn btn-primary" onClick={() => void run('merge')}>
                {B.merge}
              </button>
              <p className="hint">{B.mergeText}</p>
              <button type="button" className="btn btn-danger" onClick={() => void run('replace')}>
                {B.replace}
              </button>
              <p className="hint">{B.replaceText}</p>
            </div>
            <p className="hint">{B.deletedNote}</p>
          </>
        )}
      </SheetBody>
      {step.k === 'secret' && (
        <SheetFoot>
          <button type="button" className="btn btn-primary" disabled={!secret || busy} onClick={() => void unlock()}>
            {B.open}
          </button>
        </SheetFoot>
      )}
    </>
  );
}

// ── Открытая выгрузка ──

type ExportWhat = 'clients' | 'procedures' | 'expenses' | 'all';

function ExportSheet({ what }: { what: ExportWhat }) {
  const { close } = useSheet();
  const [health, setHealth] = useState(false);
  const [progress, setProgress] = useState('');
  const [archive, setArchive] = useState<File | null>(null);
  const [missing, setMissing] = useState(0);
  const today = useData((s) => s.idx.today);

  const done = async (file: File) => {
    if (!(await saveFile(file))) return;
    close();
    ui().toast(B.exported);
  };

  const go = () => {
    const idx = useData.getState().idx;
    const csv = (text: string, name: string) =>
      new File([text], `${X.fileName(name, today)}.csv`, { type: 'text/csv;charset=utf-8' });
    // Таблицы собираются сразу — «Поделиться» на iPhone срабатывает в том же нажатии
    if (what === 'clients') return void done(csv(clientsCsv(idx, health), 'klienty'));
    if (what === 'procedures') return void done(csv(proceduresCsv(idx), 'procedury'));
    if (what === 'expenses') return void done(csv(expensesCsv(idx), 'raskhodniki'));
    // Архив с фото собирается дольше: сохранить — вторым нажатием
    setProgress(B.preparing);
    void (async () => {
      await fetchPhotosForExport((d, t) => setProgress(B.fetching(d, t)));
      const r = await openArchive(idx, health, getBlob, (d, t) => setProgress(B.exportPhotos(d, t)));
      setMissing(r.missing);
      setArchive(new File([r.blob], `${X.fileName('vse', today)}.zip`, { type: 'application/zip' }));
      setProgress('');
    })();
  };

  const title = { clients: B.clients, procedures: B.procedures, expenses: B.expenses, all: B.all }[what];
  return (
    <>
      <SheetHead title={B.openTitle} left={ru.common.close} />
      <SheetBody>
        <div className="form-title mt-0">{title}</div>
        <div className="warn-box">
          <div className="warn warn--danger">
            <span className="dot dot--alert" />
            <div>{B.openWarn}</div>
          </div>
        </div>
        {what === 'clients' || what === 'all' ? (
          <Check checked={health} onChange={setHealth} className="check--plain">
            {B.withHealth}
          </Check>
        ) : (
          <p className="hint">{B.noHealth}</p>
        )}
        {progress && <ProgressLine text={progress} />}
        {archive && (
          <p>
            {fmtBytes(archive.size)}
            {missing > 0 ? `. ${B.exportMissing(missing)}` : ''}
          </p>
        )}
      </SheetBody>
      <SheetFoot>
        {archive ? (
          <button type="button" className="btn btn-primary" onClick={() => void done(archive)}>
            <Icon name="download" /> {shareAvailable() ? B.saveFile : B.download}
          </button>
        ) : (
          <button type="button" className="btn btn-primary" disabled={!!progress} onClick={go}>
            {B.exportGo}
          </button>
        )}
      </SheetFoot>
    </>
  );
}

// ── Экран ──

export function Backup() {
  const settings = useData((s) => s.data.settings);
  const today = useData((s) => s.idx.today);
  const lb = settings.lastBackup;

  const restore = async () => {
    const file = await pickFile();
    if (file) ui().openSheet(() => <RestoreSheet file={file} />, { auto: true });
  };
  const exportSheet = (what: ExportWhat) => ui().openSheet(() => <ExportSheet what={what} />, { auto: true });

  return (
    <div className="screen">
      <NavBar title={B.title} backTo="/more" />
      <div className="scroller">
        <div className="card card--mint mt-6">
          <div className="fw-600">{lb ? B.last(fmtDate(lb, true)) : B.never}</div>
          <div className="note mt-2">
            {lb ? `${cap(relDay(lb, today))}. ` : ''}
            {B.remind(settings.backupReminderDays)}
          </div>
        </div>
        <div className="section-title">{B.whole}</div>
        <div className="card">
          <p className="mb-14">{B.wholeText}</p>
          <div className="btn-stack">
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => ui().openSheet(() => <MakeSheet />, { auto: true })}
            >
              <Icon name="download" /> {B.save}
            </button>
            <button type="button" className="btn btn-outline" onClick={() => void restore()}>
              <Icon name="upload" /> {B.restore}
            </button>
          </div>
        </div>
        <div className="section-title">{B.excel}</div>
        <div className="card">
          <p className="mb-14">{B.excelText}</p>
          <div className="btn-stack">
            <button type="button" className="btn btn-outline" onClick={() => exportSheet('clients')}>
              <Icon name="download" /> {B.clients}
            </button>
            <button type="button" className="btn btn-outline" onClick={() => exportSheet('procedures')}>
              <Icon name="download" /> {B.procedures}
            </button>
            <button type="button" className="btn btn-outline" onClick={() => exportSheet('expenses')}>
              <Icon name="download" /> {B.expenses}
            </button>
            <button type="button" className="btn btn-outline" onClick={() => exportSheet('all')}>
              <Icon name="download" /> {B.all}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
