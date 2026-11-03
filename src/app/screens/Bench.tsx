// Замер скорости (этап 7): только в демо-сборке и сборке для разработки. Код замера и временное
// хранилище — src/dev/bench.ts; здесь — снимки для фото, кнопка и таблица результатов.
import { useState } from 'react';
import { todayISO } from '../../domain/dates';
import { ru } from '../../i18n/ru';
import { processPhoto } from '../../media/process';
import { Icon } from '../components/Icon';
import { NavBar } from '../components/kit';
import { ui } from '../ui';
import type { BenchRow } from '../../dev/bench';

const B = ru.bench;

/** Холст размером снимка: градиент и шум, чтобы JPEG был похож по объёму на фото. */
function canvasJpeg(w: number, h: number, q: number): Promise<Blob> {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const g = cv.getContext('2d')!;
  const grad = g.createLinearGradient(0, 0, w, h);
  grad.addColorStop(0, '#d8bfa8');
  grad.addColorStop(1, '#6e4f3c');
  g.fillStyle = grad;
  g.fillRect(0, 0, w, h);
  for (let i = 0; i < 4000; i += 1) {
    g.fillStyle = `rgba(${(i * 37) % 255},${(i * 91) % 255},${(i * 53) % 255},0.25)`;
    g.fillRect((i * 7919) % w, (i * 104729) % h, 24, 24);
  }
  return new Promise((resolve, reject) =>
    cv.toBlob((b) => (b ? resolve(b) : reject(new Error('jpeg'))), 'image/jpeg', q),
  );
}

const fmtMs = (ms: number) => (ms < 1000 ? `${ms} мс` : `${(ms / 1000).toFixed(1).replace('.', ',')} с`);

function noteOf(r: BenchRow): string {
  if (r.step === 'photoProcess' && r.count) return B.perPhoto(Math.round(r.ms / r.count));
  return [r.count ? B.count(r.count) : '', r.mb ? B.mb(r.mb) : '', r.error ? B.stopped(r.error) : '']
    .filter(Boolean)
    .join(', ');
}

export function Bench() {
  const [rows, setRows] = useState<BenchRow[]>([]);
  const [state, setState] = useState<'idle' | 'running' | 'done' | 'failed'>('idle');
  const [error, setError] = useState('');

  const run = async () => {
    setState('running');
    setRows([]);
    setError('');
    try {
      const { runBench } = await import('../../dev/bench');
      // Обработка снимков с камеры: 12 Мп → 2560 px, как при добавлении фото в процедуру
      const camera = await canvasJpeg(3024, 4032, 0.9);
      const t0 = performance.now();
      for (let i = 0; i < 5; i += 1) await processPhoto(camera, 2560);
      const proc: BenchRow = { step: 'photoProcess', ms: Math.round(performance.now() - t0), count: 5 };
      setRows([proc]);
      const photo = new Uint8Array(await (await canvasJpeg(1440, 2560, 0.85)).arrayBuffer());
      await runBench({
        today: todayISO(),
        photos: 1000,
        photoBytes: async () => photo,
        onRow: (r) => setRows((prev) => [...prev, r]),
      });
      setState('done');
    } catch (e) {
      const name = e instanceof Error ? e.name : 'Error';
      console.error(name);
      setError(name);
      setState('failed');
    }
  };

  const copy = async () => {
    const text = [
      `${B.title} · ${navigator.userAgent}`,
      ...(error ? [B.failedWith(error)] : []),
      ...rows.map((r) => `${B.steps[r.step]}: ${fmtMs(r.ms)}${noteOf(r) ? ` (${noteOf(r)})` : ''}`),
    ].join('\n');
    try {
      await navigator.clipboard.writeText(text);
      ui().toast(B.copied);
    } catch {
      ui().toast(ru.common.saveFailed);
    }
  };

  return (
    <div className="screen">
      <NavBar title={B.title} backTo="/more/settings" />
      <div className="scroller">
        <div className="card">
          <p className="mb-14">{B.text}</p>
          <p className="hint mb-14">{B.warn}</p>
          <button
            type="button"
            className="btn btn-primary btn-block"
            disabled={state === 'running'}
            onClick={() => void run()}
          >
            {state === 'running' ? B.running : B.run}
          </button>
        </div>
        {rows.length > 0 && (
          <>
            <div className="section-title">
              {state === 'done' ? B.done : state === 'failed' ? B.failedWith(error) : B.running}
            </div>
            <div className="card card--tight">
              <table className="bench-table">
                <thead>
                  <tr>
                    <th>{B.step}</th>
                    <th>{B.time}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.step}>
                      <td>
                        {B.steps[r.step]}
                        {noteOf(r) && <small className="block">{noteOf(r)}</small>}
                      </td>
                      <td>{fmtMs(r.ms)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {state !== 'running' && (
              <button type="button" className="btn btn-secondary btn-block mt-8" onClick={() => void copy()}>
                <Icon name="doc" /> {B.copy}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
