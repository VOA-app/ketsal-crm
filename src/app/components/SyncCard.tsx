// Состояние синхронизации (SPEC §7.2): «Синхронизировано · 2 мин назад», «Нет сети…», «Ошибка…».
import { useEffect, useState } from 'react';
import { ru } from '../../i18n/ru';
import { connectYandex, syncNow, useSync, type SyncState } from '../sync';
import { ui } from '../ui';
import { Icon } from './Icon';
import { SheetBody, SheetFoot, SheetHead } from './Sheet';

const S = ru.sync;

function useMinuteTick() {
  const [, setN] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setN((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, []);
}

export function syncText(state: SyncState, at: string): string {
  switch (state) {
    case 'off':
      return S.off;
    case 'syncing':
      return S.syncing;
    case 'ok': {
      if (!at) return S.never;
      const min = Math.floor((Date.now() - Date.parse(at)) / 60_000);
      return S.ok(min < 1 ? S.justNow : S.minutesAgo(min));
    }
    default:
      return S[state];
  }
}

const isAlert = (s: SyncState) => s === 'rollback' || s === 'otherVault' || s === 'corrupt';

/** Строка состояния и, если есть, сколько фото ждут загрузки. */
function statusLine(state: SyncState, at: string, photosLeft: number) {
  const t = syncText(state, at);
  return photosLeft > 0 && state !== 'off' ? `${t} · ${S.photosLeft(photosLeft)}` : t;
}

function SyncSheet() {
  const { state, at, photosLeft } = useSync();
  useMinuteTick();
  return (
    <>
      <SheetHead title={S.sheetTitle} left={ru.common.close} />
      <SheetBody>
        <div className="sync-card mt-0">
          <Icon name="cloud" />
          <div className="grow">
            <div className="t">{S.title}</div>
            <div className="s">{statusLine(state, at, photosLeft)}</div>
          </div>
        </div>
        <div className="onb-list">
          <div>
            <Icon name="lock" />
            <span>{S.infoEncrypted}</span>
          </div>
          <div>
            <Icon name="refresh" />
            <span>{S.infoAuto}</span>
          </div>
          <div>
            <Icon name="camera" />
            <span>{S.infoPhotos}</span>
          </div>
          <div>
            <Icon name="shield" />
            <span>{S.infoFolder}</span>
          </div>
        </div>
      </SheetBody>
      <SheetFoot>
        {state === 'off' || state === 'auth' ? (
          <button type="button" className="btn btn-primary" onClick={() => void connectYandex()}>
            {state === 'off' ? S.connect : S.relogin}
          </button>
        ) : (
          <button
            type="button"
            className="btn btn-primary"
            disabled={state === 'syncing'}
            onClick={() => void syncNow()}
          >
            <Icon name="refresh" /> {S.now}
          </button>
        )}
      </SheetFoot>
    </>
  );
}

export const openSyncSheet = () => ui().openSheet(() => <SyncSheet />, { auto: true });

/** Карточка в «Ещё». */
export function SyncCard() {
  const { state, at, photosLeft } = useSync();
  useMinuteTick();
  return (
    <div className={`sync-card ${isAlert(state) ? 'sync-card--alert' : ''}`}>
      <Icon name="cloud" />
      <div className="grow">
        <div className="t">{S.title}</div>
        <div className="s">{statusLine(state, at, photosLeft)}</div>
      </div>
      {state === 'off' ? (
        <button type="button" className="btn btn-sm btn-primary" onClick={() => void connectYandex()}>
          {S.connect}
        </button>
      ) : state === 'auth' ? (
        <button type="button" className="btn btn-sm btn-primary" onClick={() => void connectYandex()}>
          {S.relogin}
        </button>
      ) : (
        <button type="button" className="btn btn-sm btn-secondary" onClick={openSyncSheet}>
          {S.details}
        </button>
      )}
    </div>
  );
}

/** Кнопка-облачко в шапке «Клиентов»: состояние видно с главного экрана. */
export function SyncButton() {
  const state = useSync((s) => s.state);
  return (
    <button
      type="button"
      className={`icon-btn icon-btn--accent sync-btn sync-btn--${state}`}
      aria-label={S.button}
      onClick={openSyncSheet}
    >
      <Icon name="cloud" />
      {(isAlert(state) || state === 'auth' || state === 'off') && <span className="sync-dot" />}
    </button>
  );
}
