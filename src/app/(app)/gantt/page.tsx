import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { type GanttRow } from "@/components/gantt/gantt-chart";
import { GanttPageClient } from "@/components/gantt/gantt-page-client";
import { ORDER_STATUS_LABELS } from "@/lib/constants";

const PHASES = [
  { key: "production", title: "Производство", color: "bg-blue-500",   startKey: "handedToFactoryDate", endKey: "readyAtFactoryDate", doneAt: ["QC", "READY_SHIP", "IN_TRANSIT", "WAREHOUSE_MSK", "PACKING", "SHIPPED_WB", "ON_SALE"] },
  { key: "qc",         title: "ОТК",          color: "bg-amber-500",  startKey: "readyAtFactoryDate",  endKey: "qcDate",             doneAt: ["READY_SHIP", "IN_TRANSIT", "WAREHOUSE_MSK", "PACKING", "SHIPPED_WB", "ON_SALE"] },
  { key: "shipping",   title: "Доставка",     color: "bg-indigo-500", startKey: "qcDate",              endKey: "arrivalPlannedDate", doneAt: ["WAREHOUSE_MSK", "PACKING", "SHIPPED_WB", "ON_SALE"] },
] as const;

function iso(d: Date | null | undefined): string | null {
  return d ? d.toISOString().slice(0, 10) : null;
}

export default async function GanttPage({
  searchParams,
}: {
  searchParams: Promise<{ phase?: string; owner?: string }>;
}) {
  const sp = await searchParams;
  const phaseFilter = sp.phase && PHASES.some((p) => p.key === sp.phase) ? sp.phase : null;
  const ownerFilter = sp.owner || null;

  const [orders, packagingOrders, owners] = await Promise.all([
    prisma.order.findMany({
      where: {
        deletedAt: null,
        status: { not: "ON_SALE" },
        ...(ownerFilter ? { ownerId: ownerFilter } : {}),
      },
      orderBy: { launchMonth: "asc" },
      take: 200,
      include: {
        productModel: { select: { name: true, photoUrls: true } },
        owner: { select: { id: true, name: true } },
        factory: { select: { name: true } },
        lines: {
          select: { quantity: true, productVariant: { select: { colorName: true, photoUrls: true } } },
        },
      },
    }),
    prisma.packagingOrder.findMany({
      where: {
        status: { notIn: ["ARRIVED", "CANCELLED"] },
        ...(ownerFilter ? { ownerId: ownerFilter } : {}),
      },
      orderBy: { createdAt: "asc" },
      include: {
        owner: { select: { id: true, name: true } },
        factory: { select: { name: true } },
        lines: {
          select: { quantity: true, packagingItem: { select: { name: true, photoUrl: true } } },
        },
      },
      // orderedDate, productionEndDate, expectedDate, supplierName подтягиваются
      // дефолтным include всех скалярных полей.
    }),
    prisma.user.findMany({
      where: {
        isActive: true,
        ownedOrders: { some: { deletedAt: null, status: { not: "ON_SALE" } } },
      },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayIso = iso(today)!;

  const rows: GanttRow[] = [];

  for (const o of orders) {
    const totalQty = o.lines.reduce((a, l) => a + l.quantity, 0);
    const colors = o.lines.map((l) => l.productVariant?.colorName ?? "?").join(", ");
    const bars: GanttRow["bars"] = [];
    const phasesToShow = phaseFilter ? PHASES.filter((p) => p.key === phaseFilter) : PHASES;
    for (const ph of phasesToShow) {
      const startRaw = (o as Record<string, unknown>)[ph.startKey] as Date | null | undefined;
      const endRaw = (o as Record<string, unknown>)[ph.endKey] as Date | null | undefined;
      if (!endRaw) continue;
      const startIso = iso(startRaw) ?? todayIso;
      const endIso = iso(endRaw)!;
      const done = ph.doneAt.includes(o.status as never);
      const overdue = !done && endIso < todayIso;
      bars.push({
        key: ph.key,
        title: ph.title,
        color: ph.color,
        start: startIso,
        end: endIso,
        owner: getPhaseOwner(ph.key, o.owner?.name, o.factory?.name),
        overdue,
        // Разрешаем drag для перетаскивания дедлайнов фаз
        orderId: o.id,
        endField: ph.endKey,
      });
    }
    if (phaseFilter && bars.length === 0) continue;

    const thumbs = o.lines.map((l) => ({
      photoUrl: l.productVariant?.photoUrls?.[0] ?? o.productModel.photoUrls?.[0] ?? null,
      colorName: l.productVariant?.colorName ?? null,
    }));
    rows.push({
      group: "orders",
      id: o.id,
      href: `/orders/${o.id}`,
      title: `#${o.orderNumber} · ${o.productModel.name}`,
      subtitle: `${colors} · ${totalQty} шт`,
      statusLabel: ORDER_STATUS_LABELS[o.status as keyof typeof ORDER_STATUS_LABELS],
      owner: o.owner?.name,
      thumbnails: thumbs,
      bars,
    });
  }

  // Заказы упаковки: две фазы — Производство (orderedDate → productionEndDate)
  // и Доставка (productionEndDate → expectedDate). Каждая со своим title и end.
  for (const po of packagingOrders) {
    if (!po.expectedDate) continue;
    const orderedIso = iso(po.orderedDate) ?? todayIso;
    const expectedIso = iso(po.expectedDate)!;
    const productionEndIso = iso(po.productionEndDate) ?? expectedIso;
    const totalQty = po.lines.reduce((a, l) => a + l.quantity, 0);
    const names = po.lines.map((l) => l.packagingItem.name).join(", ");
    const thumbs = po.lines
      .map((l) => ({ photoUrl: l.packagingItem.photoUrl, colorName: null }))
      .slice(0, 3);
    const factoryOwner = po.factory?.name ?? po.supplierName ?? po.owner?.name;

    const productionDone = ["IN_TRANSIT", "ARRIVED"].includes(po.status);
    const deliveryDone = po.status === "ARRIVED";
    const productionOverdue = !productionDone && productionEndIso < todayIso;
    const deliveryOverdue = !deliveryDone && expectedIso < todayIso;

    const bars: GanttRow["bars"] = [
      {
        key: "production",
        title: "Производство",
        color: "bg-blue-500",
        start: orderedIso,
        end: productionEndIso,
        owner: factoryOwner,
        overdue: productionOverdue,
        done: productionDone,
        orderId: po.id,
        endField: "productionEndDate",
      },
      {
        key: "delivery",
        title: "Доставка",
        color: "bg-indigo-500",
        start: productionEndIso,
        end: expectedIso,
        owner: factoryOwner,
        overdue: deliveryOverdue,
        done: deliveryDone,
        orderId: po.id,
        endField: "expectedDate",
      },
    ];

    rows.push({
      group: "packaging",
      id: po.id,
      href: `/packaging-orders/${po.id}`,
      title: `${po.orderNumber} · упаковка`,
      subtitle: `${names} · ${totalQty} шт`,
      statusLabel: po.status === "ORDERED" ? "Заказано" : po.status === "IN_PRODUCTION" ? "В пошиве" : "В пути",
      owner: po.owner?.name,
      thumbnails: thumbs,
      bars,
    });
  }

  // Сортировка: ближайшие к закрытию цикла — наверху. Берём максимальный
  // end по всем барам (последний дедлайн заказа).
  rows.sort((a, b) => {
    const aEnd = a.bars.reduce((m, x) => (x.end > m ? x.end : m), a.bars[0]?.end ?? "");
    const bEnd = b.bars.reduce((m, x) => (x.end > m ? x.end : m), b.bars[0]?.end ?? "");
    return aEnd.localeCompare(bEnd);
  });

  const baseQuery = (overrides: { phase?: string | null; owner?: string | null }) => {
    const nextPhase = overrides.phase === undefined ? phaseFilter : overrides.phase;
    const nextOwner = overrides.owner === undefined ? ownerFilter : overrides.owner;
    const parts: string[] = [];
    if (nextPhase) parts.push(`phase=${encodeURIComponent(nextPhase)}`);
    if (nextOwner) parts.push(`owner=${encodeURIComponent(nextOwner)}`);
    return parts.length > 0 ? `/gantt?${parts.join("&")}` : "/gantt";
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">График Ганта · Заказы</h1>
          <div className="text-sm text-slate-500">
            Что сейчас в работе: {rows.length}
            {phaseFilter && ` · фаза: ${PHASES.find((p) => p.key === phaseFilter)?.title}`}
            {ownerFilter && ` · ответственный: ${owners.find((o) => o.id === ownerFilter)?.name ?? "?"}`}
          </div>
        </div>
      </div>

      {/* Фильтр по фазе */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs uppercase tracking-wide text-slate-400 mr-1">Фаза:</span>
        <FilterLink href={baseQuery({ phase: null })} active={!phaseFilter} label="Все" />
        {PHASES.map((p) => (
          <FilterLink
            key={p.key}
            href={baseQuery({ phase: p.key })}
            active={phaseFilter === p.key}
            label={p.title}
            color={p.color}
          />
        ))}
      </div>

      {/* Фильтр по ответственному */}
      {owners.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs uppercase tracking-wide text-slate-400 mr-1">Ответственный:</span>
          <FilterLink href={baseQuery({ owner: null })} active={!ownerFilter} label="Все" />
          {owners.map((u) => (
            <FilterLink
              key={u.id}
              href={baseQuery({ owner: u.id })}
              active={ownerFilter === u.id}
              label={u.name}
            />
          ))}
        </div>
      )}

      {/* Десктоп: полноценный Гант */}
      <div className="hidden md:block">
        <GanttPageClient rows={rows} />
      </div>

      {/* Мобильный: список заказов с фазами */}
      <div className="md:hidden">
        <MobileGanttList rows={rows} todayIso={todayIso} />
      </div>
    </div>
  );
}

function MobileGanttList({ rows, todayIso }: { rows: GanttRow[]; todayIso: string }) {
  if (rows.length === 0) {
    return <div className="rounded-xl border border-slate-200 bg-white p-12 text-center text-sm text-slate-500">Заказов в работе нет</div>;
  }
  function fmt(iso: string) {
    const [, m, d] = iso.split("-");
    return `${d}.${m}`;
  }
  function daysLeft(iso: string) {
    const ms = new Date(iso).getTime() - new Date(todayIso).getTime();
    return Math.round(ms / 86400000);
  }
  return (
    <div className="space-y-2">
      {rows.map((r) => {
        const lastBar = r.bars[r.bars.length - 1];
        const finalEnd = lastBar?.end;
        const overallOverdue = r.bars.some((b) => b.overdue);
        const dl = finalEnd ? daysLeft(finalEnd) : null;
        const photoUrl = r.thumbnails?.find((t) => t.photoUrl)?.photoUrl ?? null;
        return (
          <Link
            key={r.id}
            href={r.href}
            className="block rounded-xl border border-slate-200 bg-white p-3 active:bg-slate-50"
          >
            <div className="flex items-center gap-3">
              {photoUrl && (
                <img src={photoUrl} alt="" className="h-12 w-12 shrink-0 rounded object-cover" />
              )}
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-slate-900">{r.title}</div>
                <div className="truncate text-[11px] text-slate-500">{r.subtitle}</div>
              </div>
              {finalEnd && (
                <div className={`shrink-0 text-right text-xs ${overallOverdue ? "text-red-600 font-semibold" : "text-slate-600"}`}>
                  <div>{fmt(finalEnd)}</div>
                  {dl !== null && (
                    <div className="text-[10px] text-slate-400">{dl >= 0 ? `через ${dl} дн` : `просроч. ${-dl} дн`}</div>
                  )}
                </div>
              )}
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {r.bars.map((b) => (
                <span
                  key={b.key}
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                    b.overdue ? "bg-red-100 text-red-700" : b.done ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-700"
                  }`}
                >
                  <span className={`inline-block h-1.5 w-1.5 rounded-full ${b.color}`} />
                  {b.title} · {fmt(b.end)}
                </span>
              ))}
            </div>
          </Link>
        );
      })}
    </div>
  );
}

function FilterLink({ href, active, label, color }: { href: string; active: boolean; label: string; color?: string }) {
  return (
    <Link
      href={href}
      className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition ${
        active
          ? "border-slate-900 bg-slate-900 text-white"
          : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
      }`}
    >
      {color && <span className={`inline-block h-2 w-2 rounded-full ${color}`} />}
      {label}
    </Link>
  );
}

function getPhaseOwner(phaseKey: string, pmName: string | null | undefined, factoryName: string | null | undefined): string | undefined {
  switch (phaseKey) {
    case "production": return factoryName ? `Фабрика: ${factoryName}` : pmName ?? undefined;
    case "qc":         return factoryName ? `Фабрика: ${factoryName}` : pmName ?? undefined;
    case "shipping":   return "Таня (логистика)";
    default: return pmName ?? undefined;
  }
}
