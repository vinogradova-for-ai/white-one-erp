import { prisma } from "@/lib/prisma";
import { GanttV2Client } from "@/components/gantt-v2/gantt-v2-client";
import type { GanttRowV2, GanttBarV2, BarState, GanttFilterOptions } from "@/components/gantt-v2/types";
import { ORDER_STATUS_LABELS, BRAND_LABELS } from "@/lib/constants";

// Фазы заказа: 4 фиксированных этапа от Разработки до Доставки.
// Каждой фазе соответствует пара полей в БД (start/end), причём end предыдущей
// фазы = start следующей (одно поле в БД).
const PHASES = [
  { key: "preparation", title: "Разработка",   color: "bg-rose-300",    startKey: "decisionDate",        endKey: "handedToFactoryDate", doneAt: ["IN_PRODUCTION", "QC", "READY_SHIP", "IN_TRANSIT", "WAREHOUSE_MSK", "PACKING", "SHIPPED_WB", "ON_SALE"] },
  { key: "production",  title: "Производство", color: "bg-blue-500",    startKey: "handedToFactoryDate", endKey: "readyAtFactoryDate",  doneAt: ["QC", "READY_SHIP", "IN_TRANSIT", "WAREHOUSE_MSK", "PACKING", "SHIPPED_WB", "ON_SALE"] },
  { key: "qc",          title: "ОТК",          color: "bg-amber-500",   startKey: "readyAtFactoryDate",  endKey: "qcDate",              doneAt: ["READY_SHIP", "IN_TRANSIT", "WAREHOUSE_MSK", "PACKING", "SHIPPED_WB", "ON_SALE"] },
  { key: "shipping",    title: "Доставка",     color: "bg-fuchsia-500", startKey: "qcDate",              endKey: "arrivalPlannedDate",  doneAt: ["WAREHOUSE_MSK", "PACKING", "SHIPPED_WB", "ON_SALE"] },
] as const;

const DEV_PHASES = [
  { key: "patterns",  title: "Лекала",       color: "bg-rose-400",   fromKey: "createdAt",         toKey: "patternsDate",        doneAt: ["PATTERNS", "SAMPLE", "APPROVED", "IN_PRODUCTION"] },
  { key: "sample",    title: "Образец",      color: "bg-purple-500", fromKey: "patternsDate",      toKey: "sampleDate",          doneAt: ["SAMPLE", "APPROVED", "IN_PRODUCTION"] },
  { key: "approval",  title: "Утверждение",  color: "bg-teal-500",   fromKey: "sampleDate",        toKey: "approvedDate",        doneAt: ["APPROVED", "IN_PRODUCTION"] },
  { key: "prelaunch", title: "Подготовка",   color: "bg-emerald-500",fromKey: "approvedDate",      toKey: "productionStartDate", doneAt: ["IN_PRODUCTION"] },
] as const;

const MODEL_STATUS_LABELS: Record<string, string> = {
  IDEA: "Идея",
  PATTERNS: "Лекала",
  SAMPLE: "Образец",
  APPROVED: "Утверждён",
  IN_PRODUCTION: "В производстве",
};

const PACKAGING_STATUS_LABELS: Record<string, string> = {
  ORDERED: "Заказано",
  IN_PRODUCTION: "В пошиве",
  IN_TRANSIT: "В пути",
};

const NEARLY_DUE_DAYS = 5;

function iso(d: Date | null | undefined): string | null {
  return d ? d.toISOString().slice(0, 10) : null;
}

function getPhaseOwner(phaseKey: string, pmName: string | null | undefined, factoryName: string | null | undefined): string | undefined {
  switch (phaseKey) {
    case "production":
    case "qc":
      return factoryName ? `Фабрика: ${factoryName}` : pmName ?? undefined;
    case "shipping":
      return "Таня (логистика)";
    default:
      return pmName ?? undefined;
  }
}

export default async function GanttV2Page() {
  const [orders, packagingOrders, devModels, owners, factories] = await Promise.all([
    prisma.order.findMany({
      where: { deletedAt: null, status: { not: "ON_SALE" } },
      orderBy: { launchMonth: "asc" },
      take: 500,
      include: {
        productModel: { select: { name: true, photoUrls: true, brand: true, category: true, subcategory: true } },
        owner: { select: { id: true, name: true } },
        factory: { select: { id: true, name: true } },
        lines: {
          select: { quantity: true, productVariant: { select: { colorName: true, photoUrls: true } } },
        },
      },
    }),
    // Защита от рассинхронизации БД и схемы (см. HANDOFF: «Локальная БД может расходиться»):
    // если decisionDate в БД ещё нет — деградируем до пустого списка вместо краха страницы.
    prisma.packagingOrder.findMany({
      where: { status: { notIn: ["ARRIVED", "CANCELLED"] } },
      orderBy: { createdAt: "asc" },
      include: {
        owner: { select: { id: true, name: true } },
        factory: { select: { id: true, name: true } },
        lines: {
          select: { quantity: true, packagingItem: { select: { name: true, photoUrl: true } } },
        },
      },
    }).catch((err) => {
      console.warn("[gantt-v2] packagingOrder.findMany failed, returning empty:", err?.message);
      return [] as never[];
    }),
    prisma.productModel.findMany({
      where: {
        deletedAt: null,
        activated: true,
        status: { in: ["IDEA", "PATTERNS", "SAMPLE", "APPROVED"] },
      },
      orderBy: { createdAt: "desc" },
      take: 200,
      include: {
        owner: { select: { id: true, name: true } },
        preferredFactory: { select: { id: true, name: true } },
      },
    }),
    prisma.user.findMany({
      where: {
        isActive: true,
        role: { in: ["OWNER", "PRODUCT_MANAGER", "ASSISTANT", "CONTENT_MANAGER", "LOGISTICS"] },
      },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.factory.findMany({
      where: { isActive: true },
      select: { id: true, name: true, country: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayIso = iso(today)!;

  const rows: GanttRowV2[] = [];

  // Проверка нелогичного порядка фаз: даты должны идти неубывающе
  // (Разработка → Производство → ОТК → Доставка). Возвращает текст ошибки или null.
  function checkDateOrder(arr: Array<{ name: string; d: Date | null | undefined }>): string | null {
    const filled = arr.filter((x) => x.d !== null && x.d !== undefined);
    for (let i = 1; i < filled.length; i++) {
      if (filled[i].d! < filled[i - 1].d!) {
        return `${filled[i].name} (${iso(filled[i].d)}) раньше, чем ${filled[i - 1].name} (${iso(filled[i - 1].d)})`;
      }
    }
    return null;
  }

  // === ЗАКАЗЫ ===
  for (const o of orders) {
    const totalQty = o.lines.reduce((a, l) => a + l.quantity, 0);
    const colors = o.lines.map((l) => l.productVariant?.colorName ?? "?").join(", ");

    const dateOrderIssue = checkDateOrder([
      { name: "старт Разработки", d: o.decisionDate },
      { name: "старт Производства", d: o.handedToFactoryDate },
      { name: "старт ОТК", d: o.readyAtFactoryDate },
      { name: "старт Доставки", d: o.qcDate },
      { name: "конец Доставки", d: o.arrivalPlannedDate },
    ]);

    let prevEnd: string | null = null;
    let activeIdx = -1;

    type BarSrc = { ph: typeof PHASES[number]; s: string; e: string; done: boolean };
    const allBars: BarSrc[] = [];
    for (let pi = 0; pi < PHASES.length; pi++) {
      const ph = PHASES[pi];
      const startRaw = (o as Record<string, unknown>)[ph.startKey] as Date | null | undefined;
      const endRaw = (o as Record<string, unknown>)[ph.endKey] as Date | null | undefined;
      const s: string = iso(startRaw) ?? prevEnd ?? todayIso;
      const e: string = iso(endRaw) ?? s;
      const done = (ph.doneAt as readonly string[]).includes(o.status);
      allBars.push({ ph, s, e, done });
      prevEnd = e;
      if (!done && activeIdx === -1) activeIdx = pi;
    }

    const bars: GanttBarV2[] = [];
    for (let i = 0; i < allBars.length; i++) {
      const { ph, s: startIso, e: endIso, done } = allBars[i];
      const isActive = i === activeIdx;
      const state: BarState = done ? "done" : isActive ? "active" : "future";
      const overdue = !done && endIso < todayIso;
      const daysToEnd = Math.round((new Date(endIso).getTime() - new Date(todayIso).getTime()) / 86400000);
      const nearlyDue = !done && !overdue && daysToEnd >= 0 && daysToEnd <= NEARLY_DUE_DAYS;
      const isFirstInChain = i === 0;
      bars.push({
        key: ph.key,
        title: ph.title,
        color: ph.color,
        start: startIso,
        end: endIso,
        state,
        owner: getPhaseOwner(ph.key, o.owner?.name, o.factory?.name),
        overdue,
        nearlyDue,
        orderId: o.id,
        endField: ph.endKey,
        ...(isFirstInChain ? { startField: ph.startKey } : {}),
      });
    }

    const thumbs = o.lines.map((l) => ({
      photoUrl: l.productVariant?.photoUrls?.[0] ?? o.productModel.photoUrls?.[0] ?? null,
      colorName: l.productVariant?.colorName ?? null,
    }));

    rows.push({
      group: "orders",
      id: o.id,
      href: `/orders/${o.id}`,
      title: `${o.productModel.name} · #${o.orderNumber}`,
      subtitle: `${colors} · ${totalQty} шт`,
      statusLabel: ORDER_STATUS_LABELS[o.status as keyof typeof ORDER_STATUS_LABELS],
      brand: o.productModel.brand,
      factoryId: o.factory?.id ?? null,
      factoryName: o.factory?.name ?? null,
      ownerId: o.owner?.id ?? null,
      ownerName: o.owner?.name ?? null,
      launchMonth: o.launchMonth ?? null,
      category: o.productModel.category ?? null,
      rawStatus: o.status,
      hasOverdue: bars.some((b) => b.overdue),
      hasNearlyDue: bars.some((b) => b.nearlyDue),
      hasDateOrderIssue: !!dateOrderIssue,
      dateOrderIssueText: dateOrderIssue ?? undefined,
      thumbnails: thumbs,
      bars,
    });
  }

  // === УПАКОВКА ===
  for (const po of packagingOrders) {
    const packDateIssue = checkDateOrder([
      { name: "старт Разработки", d: (po as { decisionDate?: Date | null }).decisionDate ?? null },
      { name: "старт Производства", d: po.orderedDate },
      { name: "старт Доставки", d: po.productionEndDate },
      { name: "конец Доставки", d: po.expectedDate },
    ]);
    const orderedIso = iso(po.orderedDate) ?? todayIso;
    const decisionIso = iso(po.decisionDate) ?? orderedIso;
    const productionEndIso = iso(po.productionEndDate) ?? orderedIso;
    const expectedIso = iso(po.expectedDate) ?? productionEndIso;
    const totalQty = po.lines.reduce((a, l) => a + l.quantity, 0);
    const names = po.lines.map((l) => l.packagingItem.name).join(", ");
    const thumbs = po.lines
      .map((l) => ({ photoUrl: l.packagingItem.photoUrl, colorName: null }))
      .slice(0, 3);
    const factoryOwner = po.factory?.name ?? po.supplierName ?? po.owner?.name;

    const developmentDone = po.status !== "ORDERED";
    const productionDone = ["IN_TRANSIT", "ARRIVED"].includes(po.status);
    const deliveryDone = po.status === "ARRIVED";

    let activeIdx = -1;
    if (!developmentDone) activeIdx = 0;
    else if (!productionDone) activeIdx = 1;
    else if (!deliveryDone) activeIdx = 2;

    const phases: Array<{
      key: string; title: string; color: string;
      start: string; end: string; done: boolean;
      endField: string; startField?: string;
    }> = [
      { key: "preparation", title: "Разработка",  color: "bg-rose-300",    start: decisionIso,    end: orderedIso,       done: developmentDone, endField: "orderedDate", startField: "decisionDate" },
      { key: "production",  title: "Производство", color: "bg-blue-500",    start: orderedIso,     end: productionEndIso, done: productionDone,  endField: "productionEndDate" },
      { key: "delivery",    title: "Доставка",      color: "bg-fuchsia-500", start: productionEndIso, end: expectedIso,    done: deliveryDone,    endField: "expectedDate" },
    ];

    const bars: GanttBarV2[] = phases.map((p, i) => {
      const overdue = !p.done && p.end < todayIso;
      const daysToEnd = Math.round((new Date(p.end).getTime() - new Date(todayIso).getTime()) / 86400000);
      const nearlyDue = !p.done && !overdue && daysToEnd >= 0 && daysToEnd <= NEARLY_DUE_DAYS;
      const state: BarState = p.done ? "done" : i === activeIdx ? "active" : "future";
      return {
        key: p.key,
        title: p.title,
        color: p.color,
        start: p.start,
        end: p.end,
        state,
        owner: factoryOwner ?? undefined,
        overdue,
        nearlyDue,
        orderId: po.id,
        endField: p.endField,
        ...(p.startField ? { startField: p.startField } : {}),
      };
    });

    rows.push({
      group: "packaging",
      id: po.id,
      href: `/packaging-orders/${po.id}`,
      title: `Упаковка · ${po.orderNumber}`,
      subtitle: `${names} · ${totalQty} шт`,
      statusLabel: PACKAGING_STATUS_LABELS[po.status] ?? po.status,
      brand: null,
      factoryId: po.factory?.id ?? null,
      factoryName: po.factory?.name ?? po.supplierName ?? null,
      ownerId: po.owner?.id ?? null,
      ownerName: po.owner?.name ?? null,
      launchMonth: null,
      category: "Упаковка",
      rawStatus: po.status,
      hasOverdue: bars.some((b) => b.overdue),
      hasNearlyDue: bars.some((b) => b.nearlyDue),
      hasDateOrderIssue: !!packDateIssue,
      dateOrderIssueText: packDateIssue ?? undefined,
      thumbnails: thumbs,
      bars,
    });
  }

  // === РАЗРАБОТКА ФАСОНОВ ===
  for (const m of devModels) {
    const launchEnd = m.plannedLaunchMonth
      ? `${String(m.plannedLaunchMonth).slice(0, 4)}-${String(m.plannedLaunchMonth).slice(4, 6)}-01`
      : iso(new Date(today.getTime() + 30 * 86400000))!;

    const bars: GanttBarV2[] = [];
    let prevDate = iso(m.createdAt) ?? todayIso;
    let foundActive = false;

    for (const ph of DEV_PHASES) {
      const fromRaw = ph.fromKey === "createdAt"
        ? m.createdAt
        : (m as Record<string, unknown>)[ph.fromKey] as Date | null | undefined;
      const toRaw = (m as Record<string, unknown>)[ph.toKey] as Date | null | undefined;

      const fromIso = iso(fromRaw) ?? prevDate;
      const done = (ph.doneAt as readonly string[]).includes(m.status);
      let endIso: string;

      if (toRaw) {
        endIso = iso(toRaw)!;
      } else if (!done) {
        endIso = launchEnd > fromIso ? launchEnd : iso(new Date(today.getTime() + 14 * 86400000))!;
      } else {
        continue;
      }

      const isActive = !done && !foundActive;
      if (isActive) foundActive = true;
      const state: BarState = done ? "done" : isActive ? "active" : "future";
      const overdue = !done && endIso < todayIso;
      const daysToEnd = Math.round((new Date(endIso).getTime() - new Date(todayIso).getTime()) / 86400000);
      const nearlyDue = !done && !overdue && daysToEnd >= 0 && daysToEnd <= NEARLY_DUE_DAYS;

      bars.push({
        key: ph.key,
        title: ph.title,
        color: ph.color,
        start: fromIso,
        end: endIso,
        state,
        owner: m.preferredFactory?.name ?? m.owner?.name ?? undefined,
        overdue,
        nearlyDue,
        orderId: m.id,
        endField: ph.toKey,
      });

      prevDate = endIso;
      if (!done) break;
    }

    if (bars.length === 0) continue;

    rows.push({
      group: "development",
      id: m.id,
      href: `/models/${m.id}`,
      title: m.name,
      subtitle: m.category + (m.subcategory ? ` · ${m.subcategory}` : ""),
      statusLabel: MODEL_STATUS_LABELS[m.status] ?? m.status,
      brand: m.brand,
      factoryId: m.preferredFactory?.id ?? null,
      factoryName: m.preferredFactory?.name ?? null,
      ownerId: m.owner?.id ?? null,
      ownerName: m.owner?.name ?? null,
      launchMonth: m.plannedLaunchMonth ?? null,
      category: m.category ?? null,
      rawStatus: m.status,
      hasOverdue: bars.some((b) => b.overdue),
      hasNearlyDue: bars.some((b) => b.nearlyDue),
      thumbnails: m.photoUrls?.[0] ? [{ photoUrl: m.photoUrls[0], colorName: null }] : [],
      bars,
    });
  }

  // Опции фильтров с подсчётом
  const launchMonthMap = new Map<number, number>();
  const categoryMap = new Map<string, number>();
  for (const r of rows) {
    if (r.launchMonth) launchMonthMap.set(r.launchMonth, (launchMonthMap.get(r.launchMonth) ?? 0) + 1);
    if (r.category) categoryMap.set(r.category, (categoryMap.get(r.category) ?? 0) + 1);
  }
  const launchMonths = Array.from(launchMonthMap.entries())
    .sort(([a], [b]) => a - b)
    .map(([ym, count]) => {
      const y = String(ym).slice(0, 4);
      const m = String(ym).slice(4, 6);
      const MONTH_RU = ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];
      return { value: String(ym), label: `${MONTH_RU[Number(m) - 1]} ${y}`, count };
    });

  const filterOptions: GanttFilterOptions = {
    brands: [
      { value: "WHITE_ONE", label: BRAND_LABELS.WHITE_ONE },
      { value: "SERDCEBIENIE", label: BRAND_LABELS.SERDCEBIENIE },
    ],
    phases: [
      { value: "preparation", label: "Разработка", color: "bg-rose-300" },
      { value: "production",  label: "Производство", color: "bg-blue-500" },
      { value: "qc",          label: "ОТК", color: "bg-amber-500" },
      { value: "shipping",    label: "Доставка", color: "bg-fuchsia-500" },
      { value: "delivery",    label: "Доставка упаковки", color: "bg-fuchsia-500" },
      { value: "patterns",    label: "Лекала", color: "bg-rose-400" },
      { value: "sample",      label: "Образец", color: "bg-purple-500" },
      { value: "approval",    label: "Утверждение", color: "bg-teal-500" },
      { value: "prelaunch",   label: "Подготовка", color: "bg-emerald-500" },
    ],
    owners: owners.map((u) => ({ value: u.id, label: u.name })),
    factories: factories.map((f) => ({
      value: f.id,
      label: `${f.name}${f.country ? ` (${f.country === "CN" ? "CN" : f.country})` : ""}`,
    })),
    launchMonths,
    statuses: Object.entries(ORDER_STATUS_LABELS).map(([v, l]) => ({ value: v, label: l })),
    categories: Array.from(categoryMap.entries()).map(([c, count]) => ({ value: c, label: c, count })),
  };

  return (
    <GanttV2Client
      rows={rows}
      filterOptions={filterOptions}
      todayIso={todayIso}
    />
  );
}
