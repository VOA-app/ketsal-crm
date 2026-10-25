// Показ фото: превью в списках, оригинал в просмотре, полноэкранный просмотр и сравнение.
import { useEffect, useRef, useState } from 'react';
import type { PhotoRef } from '../../domain/types';
import { cachedUrl, photoUrl } from '../../media/cache';
import { ru } from '../../i18n/ru';
import { useUi, type ViewerItem } from '../ui';
import { Icon } from './Icon';

export function usePhotoUrl(id: string | undefined): string {
  const [url, setUrl] = useState(() => (id ? (cachedUrl(id) ?? '') : ''));
  useEffect(() => {
    let alive = true;
    if (!id) return;
    photoUrl(id).then((u) => {
      if (alive) setUrl(u);
    });
    return () => {
      alive = false;
    };
  }, [id]);
  return id ? url : '';
}

export function PhotoImg({
  photo,
  full = false,
  alt = '',
  className,
}: {
  photo: PhotoRef;
  full?: boolean;
  alt?: string;
  className?: string;
}) {
  const url = usePhotoUrl(full ? photo.blobId : photo.thumbId);
  return url ? (
    <img src={url} alt={alt} className={className} loading="lazy" draggable={false} />
  ) : (
    <span className={`ph-blank ${className ?? ''}`} />
  );
}

export function Thumb({ photo, onOpen, onDelete }: { photo: PhotoRef; onOpen?: () => void; onDelete?: () => void }) {
  return (
    <div className="thumb">
      {onOpen ? (
        <button type="button" className="thumb-open" onClick={onOpen} aria-label={ru.common.openPhoto}>
          <PhotoImg photo={photo} />
        </button>
      ) : (
        <PhotoImg photo={photo} />
      )}
      {onDelete && (
        <button type="button" className="thumb-del" onClick={onDelete} aria-label={ru.common.deletePhoto}>
          <Icon name="close" />
        </button>
      )}
    </div>
  );
}

export function PhotoAdd({
  label,
  onClick,
  icon = 'camera',
}: {
  label: string;
  onClick: () => void;
  icon?: 'camera' | 'doc';
}) {
  return (
    <button type="button" className="photo-add" onClick={onClick} aria-label={label}>
      <Icon name={icon} />
    </button>
  );
}

function Figure({ item }: { item: ViewerItem }) {
  return (
    <figure>
      <PhotoImg photo={item.photo} full alt={item.title} />
      <figcaption>
        {item.title} <small>{item.sub}</small>
      </figcaption>
    </figure>
  );
}

export function Viewer() {
  const v = useUi((s) => s.viewer);
  const close = useUi((s) => s.closeViewer);
  const x0 = useRef<number | null>(null);

  const step = (k: number) => {
    const cur = useUi.getState().viewer;
    if (!cur || cur.mode !== 'single') return;
    useUi.setState({ viewer: { ...cur, i: (cur.i + k + cur.items.length) % cur.items.length } });
  };

  useEffect(() => {
    if (!v) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
      if (e.key === 'ArrowRight') step(1);
      if (e.key === 'ArrowLeft') step(-1);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [v, close]);

  if (!v) return null;
  const closeBtn = (
    <button type="button" className="icon-btn" onClick={close} aria-label={ru.common.close}>
      <Icon name="close" />
    </button>
  );
  if (v.mode === 'compare') {
    return (
      <div className="viewer show" role="dialog" aria-modal="true" aria-label={ru.photo.viewer}>
        <div className="viewer-top">
          <span className="spacer-44" />
          <span className="viewer-count">{ru.card.compareTitle}</span>
          {closeBtn}
        </div>
        <div className="compare">
          <Figure item={v.a} />
          <Figure item={v.b} />
        </div>
      </div>
    );
  }
  const it = v.items[v.i];
  const many = v.items.length > 1;
  return (
    <div className="viewer show" role="dialog" aria-modal="true" aria-label={ru.photo.viewer}>
      <div className="viewer-top">
        <span className="spacer-44" />
        <span className="viewer-count">{many ? ru.photo.of(v.i + 1, v.items.length) : ''}</span>
        {closeBtn}
      </div>
      <div
        className="viewer-img"
        onPointerDown={(e) => {
          x0.current = e.clientX;
        }}
        onPointerUp={(e) => {
          if (x0.current === null) return;
          const dx = e.clientX - x0.current;
          x0.current = null;
          if (Math.abs(dx) > 50 && many) step(dx < 0 ? 1 : -1);
        }}
      >
        <PhotoImg key={it.photo.blobId} photo={it.photo} full alt={it.title} />
        {many && (
          <>
            <button type="button" className="viewer-nav prev" onClick={() => step(-1)} aria-label={ru.photo.prev}>
              <Icon name="chevLeft" />
            </button>
            <button type="button" className="viewer-nav next" onClick={() => step(1)} aria-label={ru.photo.next}>
              <Icon name="chev" />
            </button>
          </>
        )}
      </div>
      <div className="viewer-cap">
        {it.title}
        <small>{it.sub}</small>
      </div>
    </div>
  );
}
