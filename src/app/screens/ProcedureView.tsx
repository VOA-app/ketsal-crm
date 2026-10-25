// Карточка процедуры: материалы, фото трёх стадий с быстрым добавлением, заживление, оплата.
import { useNavigate, useParams } from 'react-router';
import { relinkCertificates } from '../../domain/certificates';
import { PHOTO_STAGES } from '../../domain/constants';
import { repeatDraft } from '../../domain/procedures';
import { lotInfo } from '../../domain/procedures';
import { fullName } from '../../domain/search';
import { fmtPhone } from '../../domain/phone';
import { lc } from '../../domain/text';
import type { Entity, PhotoStage, Procedure } from '../../domain/types';
import { fmtDate, fmtMoney, fmtMonthNum, NBSP } from '../../i18n/format';
import { HEALING, PAYMENT, PHOTO_STAGE, STATUS, VISIT_TYPE, ru } from '../../i18n/ru';
import { Avatar } from '../components/ClientBits';
import { Icon } from '../components/Icon';
import { Kv, NavBar, Swatch } from '../components/kit';
import { PhotoAdd, Thumb } from '../components/Photo';
import { openProcForm } from '../forms/ProcForm';
import { openHealingForm } from '../forms/SmallForms';
import {
  anestName,
  certPayText,
  courseName,
  needleName,
  pigmentFull,
  procDiscount,
  procTotal,
  serviceName,
  zoneName,
} from '../names';
import { allBlobIds, useData } from '../store';
import { ui, type ViewerItem } from '../ui';
import { pickFiles, savePhotos } from '../../media/cache';
import { NotFound } from './ClientCard';

const V = ru.proc;

export function ProcedureView() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const idx = useData((s) => s.idx);
  const p = idx.proc.get(id);
  if (!p) return <NotFound text={V.notFound} />;
  const c = idx.client.get(p.clientId);
  const pg = p.pigments.filter((g) => g.pigmentId);
  const disc = procDiscount(p);
  const cert = p.certificateId ? idx.cert.get(p.certificateId) : undefined;
  const an = (
    [
      [ru.procForm.primary, p.anesthesia.primary],
      [ru.procForm.secondary, p.anesthesia.secondary],
    ] as const
  ).filter(([, x]) => x);

  const viewPhotos = (stage: PhotoStage, i: number) => {
    const items: ViewerItem[] = [];
    let start = 0;
    for (const st of PHOTO_STAGES) {
      (p.photos?.[st] || []).forEach((photo, j) => {
        if (st === stage && j === i) start = items.length;
        items.push({
          photo,
          title: PHOTO_STAGE[st],
          sub: `${fmtDate(p.date, true)} · ${serviceName(idx, p.serviceId)}`,
        });
      });
    }
    ui().openViewer(items, start);
  };

  const quickPhoto = async (stage: PhotoStage) => {
    const files = await pickFiles();
    if (!files.length) return;
    const { refs, failed } = await savePhotos(files, idx.data.settings.photoMaxSide);
    if (failed) ui().toast(ru.photo.failed);
    if (!refs.length) return;
    const cur = useData.getState().idx.proc.get(p.id);
    if (!cur) return;
    useData
      .getState()
      .apply((tx) =>
        tx.put('procedures', { ...cur, photos: { ...cur.photos, [stage]: [...(cur.photos[stage] || []), ...refs] } }),
      );
    ui().toast(refs.length > 1 ? V.photosAdded(refs.length) : V.photoAdded(lc(PHOTO_STAGE[stage])));
  };

  const del = async () => {
    const ok = await ui().confirm({
      title: V.deleteTitle,
      text: V.deleteText(serviceName(idx, p.serviceId), fmtDate(p.date, true)),
    });
    if (!ok) return;
    const snapshot: Entity<Procedure> = structuredClone(p);
    const certsBefore = idx.data.certificates.filter((x) => x.usedProcId === p.id);
    useData.getState().apply((tx) => {
      tx.del('procedures', p.id);
      const now = tx.data.certificates;
      relinkCertificates(now, null, p.id).forEach((x, i) => {
        if (x !== now[i]) tx.put('certificates', x);
      });
    });
    if (window.history.state?.idx > 0) navigate(-1);
    else navigate(`/client/${p.clientId}`, { replace: true });
    let restored = false;
    ui().toast(V.deleted, {
      action: V.undo,
      onAction: () => {
        restored = true;
        useData.getState().apply((tx) => {
          tx.put('procedures', snapshot);
          for (const x of certsBefore) tx.put('certificates', x);
        });
        ui().toast(V.restored);
      },
    });
    // Фото удалённой процедуры стираются, когда «Вернуть» уже недоступно
    setTimeout(() => {
      if (!restored) {
        const ids = allBlobIds({ ...useData.getState().data, clients: [], procedures: [snapshot] });
        useData.getState().apply((tx) => tx.dropBlobs(ids));
      }
    }, 6000);
  };

  return (
    <div className="screen">
      <NavBar
        title={V.title}
        backTo={`/client/${p.clientId}`}
        right={
          <button
            type="button"
            className="icon-btn icon-btn--accent"
            aria-label={V.edit}
            onClick={() => openProcForm({ procId: p.id })}
          >
            <Icon name="edit" />
          </button>
        }
      />
      <div className="scroller">
        {c && (
          <div className="list my-client">
            <button type="button" className="row" onClick={() => navigate(`/client/${c.id}`)}>
              <Avatar c={c} size="avatar--sm" />
              <div className="row-main">
                <div className="row-title">{fullName(c)}</div>
                <div className="row-sub">{V.cardAndPhone(c.cardNo, fmtPhone(c.phone))}</div>
              </div>
              <Icon name="chev" className="row-chev" />
            </button>
          </div>
        )}
        <h1 className="display proc-h1">{serviceName(idx, p.serviceId)}</h1>
        <div className="profile-meta text-left mt-6">
          {[fmtDate(p.date, true), VISIT_TYPE[p.type], zoneName(idx, p.zone), p.technique].filter(Boolean).join(' · ')}
        </div>
        {(p.status !== 'done' || p.model?.on) && (
          <div className="chips mt-10">
            {p.status !== 'done' && (
              <span className="pill">
                <span className="dot dot--muted" />
                {STATUS[p.status]}
              </span>
            )}
            {p.model?.on && <span className="pill pill--line">{V.model(courseName(idx, p.model.courseId))}</span>}
          </div>
        )}

        <div className="section-title">{V.materials}</div>
        <div className="card">
          <div className="kv kv--block">
            <div className="k mb-2">{ru.procForm.anesthesia}</div>
            {an.length ? (
              an.map(([l, x]) => (
                <div className="py-3" key={l}>
                  <span className="muted fs-13">{l}</span>
                  <div>{anestName(idx, x)}</div>
                </div>
              ))
            ) : (
              <span className="muted">{V.noAnesthesia}</span>
            )}
          </div>
          <div className="kv kv--block">
            <div className="k mb-4">{p.type === 'removal' ? ru.procForm.remover : ru.procForm.pigments}</div>
            {pg.length ? (
              pg.map((g, i) => {
                const lot = lotInfo(idx, g.pigmentId, g.lot);
                return (
                  <div className="pg-line" key={i}>
                    <Swatch hex={idx.pigment.get(g.pigmentId)?.hex} />
                    <div className="grow">
                      <div>{pigmentFull(idx, g.pigmentId)}</div>
                      <div className="muted fs-13">
                        {V.lotLine(
                          g.lot || ru.common.none,
                          lot?.exp ? V.expTo(fmtMonthNum(lot.exp)) : '',
                          g.ratio ? ` · ${g.ratio}` : '',
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            ) : (
              <span className="muted">{V.notSpecified}</span>
            )}
          </div>
          <Kv k={V.needle}>{p.needles.map((n) => needleName(idx, n)).join(', ') || ru.common.none}</Kv>
        </div>

        <div className="section-title">{V.photos}</div>
        <div className="card">
          {PHOTO_STAGES.map((st) => (
            <div className="photo-stage" key={st}>
              <div className="photo-stage-label">
                <span>{PHOTO_STAGE[st]}</span>
              </div>
              <div className="photo-strip">
                {(p.photos?.[st] || []).map((photo, i) => (
                  <Thumb key={photo.blobId} photo={photo} onOpen={() => viewPhotos(st, i)} />
                ))}
                <PhotoAdd label={ru.common.addPhoto(PHOTO_STAGE[st])} onClick={() => quickPhoto(st)} />
              </div>
            </div>
          ))}
        </div>

        <div className="section-title">
          {V.healing}
          <button type="button" className="btn-link" onClick={() => openHealingForm(p.id)}>
            {p.healing?.status ? ru.common.change : ru.common.fill}
          </button>
        </div>
        <div className="card">
          {p.healing?.status ? (
            <>
              <div className="fw-500">{HEALING[p.healing.status]}</div>
              {p.healing.note && <div className="note">{p.healing.note}</div>}
            </>
          ) : (
            <span className="muted fs-15">{V.healingEmpty}</span>
          )}
        </div>

        <div className="section-title">{V.payment}</div>
        <div className="card">
          <Kv k={V.price}>{fmtMoney(p.price)}</Kv>
          <Kv k={V.discount}>
            {disc
              ? `−${fmtMoney(disc)}${p.discount.mode === 'pct' ? ` (${p.discount.value}${NBSP}%)` : ''}${p.discount.reason ? ` · ${p.discount.reason}` : ''}`
              : V.noDiscount}
          </Kv>
          <Kv k={V.total} className="kv--total">
            {fmtMoney(procTotal(p))}
          </Kv>
          <Kv k={V.payMethod}>{`${PAYMENT[p.payment] || ru.common.none}${cert ? ` № ${cert.no}` : ''}`}</Kv>
          {cert && <Kv k={V.cert}>{certPayText(cert, procTotal(p))}</Kv>}
        </div>

        {p.note && (
          <>
            <div className="section-title">{V.note}</div>
            <div className="card fs-15 pre-wrap">{p.note}</div>
          </>
        )}

        <div className="btn-stack mt-18">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() =>
              openProcForm({ clientId: p.clientId, draft: repeatDraft(idx, p.clientId, p.zone, idx.today, p.id) })
            }
          >
            <Icon name="repeat" /> {ru.card.repeat}
          </button>
          <button type="button" className="btn btn-danger" onClick={del}>
            <Icon name="trash" /> {V.delete}
          </button>
        </div>
      </div>
    </div>
  );
}
