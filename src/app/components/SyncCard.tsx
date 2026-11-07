// Состояние синхронизации (SPEC §7.2): «Синхронизировано · 2 мин назад», «Нет сети…», «Ошибка…».
import { useEffect, useState } from 'react';
import { formatBytes, freeBytes, spaceLevel, type SpaceInfo } from '../../domain/space';
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

/** Строка состояния и, если есть, сколько фото ждут загрузки (или не загружаются из-за места). */
function statusLine(state: SyncState, at: string, photosLeft: number, photosNoSpace = false) {
  const t = syncText(state, at);
  if (photosLeft <= 0 || state === 'off' || state === 'noSpace') return t;
  return `${t} · ${photosNoSpace ? S.photosNoSpace(photosLeft) : S.photosLeft(photosLeft)}`;
}

/** Нужно внимание мастера из-за места на Диске: закончилось или скоро закончится. */
export function spaceProblem(state: SyncState, photosNoSpace: boolean, space: SpaceInfo | null) {
  if (state === 'off') return null;
  if (state === 'noSpace' || photosNoSpace) return 'full' as const;
  const lvl = space ? spaceLevel(space) : 'ok';
  return lvl === 'ok' ? null : lvl;
}

function SpaceInfoBlock({
  space,
  problem,
  noAccess,
}: {
  space: SpaceInfo | null;
  problem: 'low' | 'full' | null;
  noAccess: boolean;
}) {
  if (!space && !problem && !noAccess) return null;
  return (
    <div className="sync-space">
      {noAccess && !space && (
        <div className="sync-space-login">
          <p className="hint mb-0">{S.spaceNoAccess}</p>
          <button type="button" className="btn btn-sm btn-secondary" onClick={() => void connectYandex()}>
            {S.spaceRelogin}
          </button>
        </div>
      )}
      {space && (
        <div className="s">
          {S.space(formatBytes(space.used), formatBytes(space.total))}
          {space.trash > 0 && ` · ${S.spaceTrash(formatBytes(space.trash))}`}
        </div>
      )}
      {problem === 'low' && space && <div className="s">{S.spaceLow(formatBytes(freeBytes(space)))}</div>}
      {problem && <p className="hint mb-0">{S.spaceHelp}</p>}
    </div>
  );
}

function SyncSheet() {
  const { state, at, photosLeft, detail, photosNoSpace, space, spaceNoAccess } = useSync();
  const problem = spaceProblem(state, photosNoSpace, space);
  useMinuteTick();
  return (
    <>
      <SheetHead title={S.sheetTitle} left={ru.common.close} />
      <SheetBody>
        <div className="sync-card mt-0">
          <Icon name="cloud" />
          <div className="grow">
            <div className="t">{S.title}</div>
            <div className="s">{statusLine(state, at, photosLeft, photosNoSpace)}</div>
            {detail && state !== 'syncing' && (
              <div className="s sync-detail">{state === 'ok' ? detail : S.detail(detail)}</div>
            )}
            {state !== 'off' && <SpaceInfoBlock space={space} problem={problem} noAccess={spaceNoAccess} />}
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
  const { state, at, photosLeft, photosNoSpace } = useSync();
  useMinuteTick();
  return (
    <div className={`sync-card ${isAlert(state) ? 'sync-card--alert' : ''}`}>
      <Icon name="cloud" />
      <div className="grow">
        <div className="t">{S.title}</div>
        <div className="s">{statusLine(state, at, photosLeft, photosNoSpace)}</div>
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
  const noSpace = useSync((s) => spaceProblem(s.state, s.photosNoSpace, s.space) === 'full');
  return (
    <button
      type="button"
      className={`icon-btn icon-btn--accent sync-btn sync-btn--${state}`}
      aria-label={S.button}
      onClick={openSyncSheet}
    >
      <Icon name="cloud" />
      {(isAlert(state) || state === 'auth' || state === 'off' || noSpace) && <span className="sync-dot" />}
    </button>
  );
}
