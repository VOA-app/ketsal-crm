// «Справочники»: прайс, пигменты с партиями, иглы, анестезия, зоны и техники, курсы обучения.
import type { ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router';
import { ZONE_GROUPS } from '../../domain/constants';
import { lc, uniq } from '../../domain/text';
import type { Data, Entity } from '../../domain/types';
import { fmtDate, fmtMoney, fmtMonthNum } from '../../i18n/format';
import { VISIT_TYPE, ZONE_GROUP, ru } from '../../i18n/ru';
import { Empty, Fab, Seg, Swatch } from '../components/kit';
import { openRefForm } from '../forms/RefForm';
import { zoneName } from '../names';
import { useData } from '../store';
import { useView, type RefKind } from '../view';

const F = ru.refs;
const KINDS: RefKind[] = ['services', 'pigments', 'needles', 'anesthetics', 'zones', 'courses'];

export function usageCount(data: Data, kind: RefKind, id: string): number {
  const ps = data.procedures;
  if (kind === 'services') return ps.filter((p) => p.serviceId === id).length;
  if (kind === 'pigments') return ps.filter((p) => p.pigments.some((g) => g.pigmentId === id)).length;
  if (kind === 'needles') return ps.filter((p) => p.needles.includes(id)).length;
  if (kind === 'anesthetics')
    return ps.filter((p) => p.anesthesia.primary === id || p.anesthesia.secondary === id).length;
  if (kind === 'zones')
    return ps.filter((p) => p.zone === id).length + data.services.filter((s) => s.zones.includes(id)).length;
  if (kind === 'courses') return ps.filter((p) => p.model?.courseId === id).length;
  return 0;
}

function RefRow({
  kind,
  x,
  title,
  sub,
  sub2,
  side,
  lead,
}: {
  kind: RefKind;
  x: Entity<{ active?: boolean }>;
  title: string;
  sub: string;
  sub2?: ReactNode;
  side?: ReactNode;
  lead?: ReactNode;
}) {
  return (
    <button
      type="button"
      className={`row ${x.active === false ? 'row--dim' : ''}`}
      onClick={() => openRefForm(kind, x.id)}
    >
      {lead}
      <div className="row-main">
        <div className="row-title">{title}</div>
        <div className="row-sub">{sub}</div>
        {sub2 && <div className="row-sub2">{sub2}</div>}
      </div>
      {side && <div className="row-side">{side}</div>}
    </button>
  );
}

const Group = ({ title, children }: { title: string; children: ReactNode }) => (
  <>
    <div className="section-title">{title}</div>
    <div className="list list--plain">{children}</div>
  </>
);

function Services() {
  const data = useData((s) => s.data);
  const groups = data.zones
    .map((z) => ({ title: z.name, items: data.services.filter((s) => s.zones.length === 1 && s.zones[0] === z.id) }))
    .filter((g) => g.items.length);
  const multi = data.services.filter((s) => s.zones.length !== 1);
  if (multi.length) groups.push({ title: F.multiZone, items: multi });
  return (
    <>
      <p className="note mx-4 mt-4">{F.servicesNote}</p>
      {!data.services.length && <Empty text={F.emptyKind} />}
      {groups.map((g) => (
        <Group key={g.title} title={g.title}>
          {g.items.map((s) => (
            <RefRow
              key={s.id}
              kind="services"
              x={s}
              title={s.name}
              sub={`${VISIT_TYPE[s.type]} · ${F.minutes(s.duration)}${s.active ? '' : F.archived}`}
              side={<span className="num fw-600">{fmtMoney(s.price)}</span>}
            />
          ))}
        </Group>
      ))}
    </>
  );
}

function Pigments() {
  const data = useData((s) => s.data);
  const T = useData((s) => s.idx.today);
  const idx = useData((s) => s.idx);
  const brands = uniq(data.pigments.map((p) => p.brand));
  return (
    <>
      <p className="note mx-4 mt-4">{F.pigmentsNote}</p>
      {!data.pigments.length && <Empty text={F.emptyKind} />}
      {brands.map((b) => (
        <Group key={b} title={b}>
          {data.pigments
            .filter((p) => p.brand === b)
            .map((p) => {
              const expired = p.lots.filter((l) => l.exp && l.exp < T);
              const cur = p.lots.find((l) => !l.exp || l.exp >= T);
              const used = usageCount(data, 'pigments', p.id);
              return (
                <RefRow
                  key={p.id}
                  kind="pigments"
                  x={p}
                  lead={<Swatch hex={p.hex} size={28} />}
                  title={p.name}
                  sub={`${p.kind} · ${p.zones.map((z) => lc(zoneName(idx, z))).join(', ')}`}
                  sub2={
                    <>
                      {cur ? F.lot(cur.no, cur.exp ? F.lotTo(fmtMonthNum(cur.exp)) : '') : F.noLot}
                      {expired.length > 0 && (
                        <>
                          {' · '}
                          <span className="dot dot--alert" /> {F.expiredLots(expired.map((l) => l.no).join(', '))}
                        </>
                      )}
                    </>
                  }
                  side={<span className="muted fs-12">{used ? F.usedProcs(used) : F.notUsed}</span>}
                />
              );
            })}
        </Group>
      ))}
    </>
  );
}

function Needles() {
  const data = useData((s) => s.data);
  if (!data.needles.length) return <Empty text={F.emptyKind} />;
  return (
    <Group title={F.needlesTitle}>
      {data.needles.map((n) => {
        const used = usageCount(data, 'needles', n.id);
        return (
          <RefRow
            key={n.id}
            kind="needles"
            x={n}
            title={n.name}
            sub={`${n.note || F.cartridge}${n.active ? '' : F.archived}`}
            side={<span className="muted fs-12">{used ? F.usedProcs(used) : ru.common.none}</span>}
          />
        );
      })}
    </Group>
  );
}

function Anesthetics() {
  const data = useData((s) => s.data);
  const part = (stage: 'primary' | 'secondary', title: string) => {
    const items = data.anesthetics.filter((a) => a.stage === stage);
    return (
      <Group title={title}>
        {items.length ? (
          items.map((a) => (
            <RefRow
              key={a.id}
              kind="anesthetics"
              x={a}
              title={a.name}
              sub={`${F.substance(a.substances.join(', ') || ru.common.none)}${a.active ? '' : F.archived}`}
            />
          ))
        ) : (
          <div className="row">
            <span className="muted">{ru.common.empty}</span>
          </div>
        )}
      </Group>
    );
  };
  return (
    <>
      <p className="note mx-4 mt-4">{F.anestNote}</p>
      {part('primary', F.primary)}
      {part('secondary', F.secondary)}
    </>
  );
}

function Zones() {
  const data = useData((s) => s.data);
  return (
    <>
      <p className="note mx-4 mt-4">{F.zonesNote}</p>
      {ZONE_GROUPS.map((g) => {
        const items = data.zones.filter((z) => z.group === g);
        if (!items.length) return null;
        return (
          <Group key={g} title={ZONE_GROUP[g]}>
            {items.map((z) => (
              <RefRow
                key={z.id}
                kind="zones"
                x={z}
                title={z.name}
                sub={`${z.techniques.join(', ') || F.noTechniques}${z.update ? F.remindUpdate : ''}`}
              />
            ))}
          </Group>
        );
      })}
    </>
  );
}

function Courses() {
  const data = useData((s) => s.data);
  if (!data.courses.length) return <Empty text={F.coursesEmpty} />;
  return (
    <Group title={F.coursesTitle}>
      {data.courses.map((co) => {
        const n = usageCount(data, 'courses', co.id);
        return (
          <RefRow
            key={co.id}
            kind="courses"
            x={co}
            title={co.name}
            sub={`${co.start ? F.courseSince(fmtDate(co.start, true)) : F.noDate}${co.note ? ` · ${co.note}` : ''}`}
            side={<span className="muted fs-12">{n ? F.models(n) : F.noModels}</span>}
          />
        );
      })}
    </Group>
  );
}

export function Refs() {
  const params = useParams();
  const navigate = useNavigate();
  const { refsKind, set } = useView();
  const kind = (KINDS as string[]).includes(params.kind ?? '') ? (params.kind as RefKind) : refsKind;
  const body = {
    services: Services,
    pigments: Pigments,
    needles: Needles,
    anesthetics: Anesthetics,
    zones: Zones,
    courses: Courses,
  }[kind];
  const Body = body;
  return (
    <div className="screen">
      <header className="topbar">
        <div className="topbar-row">
          <h1 className="display title-lg">{F.title}</h1>
        </div>
        <Seg
          className="seg--scroll"
          value={kind}
          options={KINDS.map((k) => [k, F.kinds[k]])}
          onChange={(k) => {
            set({ refsKind: k });
            navigate(`/refs/${k}`, { replace: true });
            document.querySelector('.scroller')?.scrollTo({ top: 0 });
          }}
        />
      </header>
      <div className="scroller">
        <Body />
      </div>
      <Fab label={F.add} onClick={() => openRefForm(kind, null)} />
    </div>
  );
}
