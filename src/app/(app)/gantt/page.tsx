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

  const [orders, owners] = await Promise.all([
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

      <GanttPageClient rows={rows} />
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
