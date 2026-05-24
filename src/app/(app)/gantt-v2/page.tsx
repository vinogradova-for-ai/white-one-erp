import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { GanttV2Client } from "@/components/gantt-v2/gantt-v2-client";
import type { GanttRowV2, GanttBarV2, BarState, GanttFilterOptions } from "@/components/gantt-v2/types";
import { ORDER_STATUS_LABELS, BRAND_LABELS } from "@/lib/constants";

// Фазы заказа: 4 фиксированных этапа от Разработки до Доставки.
// Каждой фазе соответствует пара полей в БД (start/end), причём end предыдущей
// фазы = start следующей (одно поле в БД).
const PHASES = [
  { key: "preparation", title: "Разработка",   color: "bg-slate-400",    startKey: "decisionDate",        endKey: "handedToFactoryDate", doneAt: ["IN_PRODUCTION", "QC", "READY_SHIP", "IN_TRANSIT", "WAREHOUSE_MSK", "PACKING", "SHIPPED_WB", "ON_SALE"] },
  { key: "production",  title: "Производство", color: "bg-blue-500",    startKey: "handedToFactoryDate", endKey: "readyAtFactoryDate",  doneAt: ["QC", "READY_SHIP", "IN_TRANSIT", "WAREHOUSE_MSK", "PACKING", "SHIPPED_WB", "ON_SALE"] },
  { key: "qc",          title: "ОТК",          color: "bg-amber-500",   startKey: "readyAtFactoryDate",  endKey: "qcDate",              doneAt: ["READY_SHIP", "IN_TRANSIT", "WAREHOUSE_MSK", "PACKING", "SHIPPED_WB", "ON_SALE"] },
  { key: "shipping",    title: "Доставка",     color: "bg-emerald-500", startKey: "qcDate",              endKey: "arrivalPlannedDate",  doneAt: ["WAREHOUSE_MSK", "PACKING", "SHIPPED_WB", "ON_SALE"] },
] as const;

const PACKAGING_STATUS_LABELS: Record<string, string> = {
  ORDERED: "Заказано",
  IN_PRODUCTION: "В пошиве",
  IN_TRANSIT: "В пути",
};

const NEARLY_DUE_DAYS = 5;

function iso(d: Date | null | undefined): string | null {
  return d ? d.toISOString().slice(0, 10) : null;
}

// Текущий московский день в формате YYYY-MM-DD. Сервер в UTC, поэтому
// new Date() в ночь возвращает «вчера» по UTC. МСК = UTC+3 круглый год.
function moscowToday(): string {
  const now = new Date();
  const mskMs = now.getTime() + 3 * 60 * 60 * 1000;
  return new Date(mskMs).toISOString().slice(0, 10);
}

// Разнесём заказы по регионам производства для фильтра «Производство».
// «Тяк» — это особый сегмент китайских фабрик; идентифицируется по упоминанию
// «тяк» в имени фабрики (любой регистр). Остальное классифицируется по стране.
function productionRegionOf(
  factory: { name: string | null; country: string | null } | null | undefined,
): "ru" | "cn" | "tyak" | null {
  if (!factory) return null;
  const name = (factory.name ?? "").toLowerCase();
  if (name.includes("тяк")) return "tyak";
  const country = (factory.country ?? "").toLowerCase();
  if (country.startsWith("росс")) return "ru";
  if (country.startsWith("кит") || country === "cn") return "cn";
  return null;
}

const PRODUCTION_REGION_LABEL: Record<"ru" | "cn" | "tyak", string> = {
  ru: "Россия",
  cn: "Китай",
  tyak: "Тяк",
};

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
  const session = await auth();
  const isOwner = session?.user?.role === "OWNER";

  const [orders, packagingOrders, owners, factories] = await Promise.all([
    prisma.order.findMany({
      where: { deletedAt: null, status: { not: "ON_SALE" } },
      orderBy: { launchMonth: "asc" },
      take: 500,
      include: {
        productModel: { select: { name: true, photoUrls: true, brand: true, category: true, subcategory: true } },
        owner: { select: { id: true, name: true } },
        factory: { select: { id: true, name: true, country: true } },
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
        factory: { select: { id: true, name: true, country: true } },
        lines: {
          select: { quantity: true, packagingItem: { select: { name: true, photoUrl: true } } },
        },
      },
    }).catch((err) => {
      console.warn("[gantt-v2] packagingOrder.findMany failed, returning empty:", err?.message);
      return [] as never[];
    }),
    prisma.user.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.factory.findMany({
      where: { isActive: true },
      select: { id: true, name: true, country: true },
      orderBy: { name: "asc" },
    }),
  ]);

  // todayIso считаем по московскому времени: сервер крутится в UTC, и если
  // делать new Date() + toISOString().slice(0,10), то ночью 0–3 часа МСК
  // todayIso уезжает на день назад (для нас сегодня уже понедельник, для
  // UTC ещё воскресенье). Алёна и команда работают по МСК — даты везде в БД
  // тоже UTC-полночь нужного дня (через date-input). Берём день по МСК.
  const todayIso = moscowToday();
  const today = new Date(`${todayIso}T00:00:00Z`);

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
      productionRegion: productionRegionOf(o.factory),
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
      { key: "preparation", title: "Разработка",  color: "bg-slate-400",    start: decisionIso,    end: orderedIso,       done: developmentDone, endField: "orderedDate", startField: "decisionDate" },
      { key: "production",  title: "Производство", color: "bg-blue-500",    start: orderedIso,     end: productionEndIso, done: productionDone,  endField: "productionEndDate" },
      { key: "delivery",    title: "Доставка",      color: "bg-emerald-500", start: productionEndIso, end: expectedIso,    done: deliveryDone,    endField: "expectedDate" },
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
      productionRegion: productionRegionOf(
        po.factory ?? (po.supplierName ? { name: po.supplierName, country: null } : null),
      ),
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

  // (Раньше тут была секция «Разработка фасонов» (Лекала/Образец/Утверждение/
  // Подготовка) — убрана по запросу Алёны: «у нас нет такого этапа, как лекала».
  // На /gantt-v2 теперь только заказы (4 фазы) и упаковка (3 фазы без ОТК).

  // Опции фильтров с подсчётом — берём ТОЛЬКО те значения, которые реально
  // присутствуют у заказов. Иначе фильтр «Статус» показывает все 10 статусов
  // из enum, половина которых у Алёны не используется.
  const launchMonthMap = new Map<number, number>();
  const categoryMap = new Map<string, number>();
  const statusMap = new Map<string, number>();
  for (const r of rows) {
    if (r.launchMonth) launchMonthMap.set(r.launchMonth, (launchMonthMap.get(r.launchMonth) ?? 0) + 1);
    if (r.category) categoryMap.set(r.category, (categoryMap.get(r.category) ?? 0) + 1);
    if (r.rawStatus) statusMap.set(r.rawStatus, (statusMap.get(r.rawStatus) ?? 0) + 1);
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
      { value: "preparation", label: "Разработка", color: "bg-slate-400" },
      { value: "production",  label: "Производство", color: "bg-blue-500" },
      { value: "qc",          label: "ОТК", color: "bg-amber-500" },
      { value: "shipping",    label: "Доставка", color: "bg-emerald-500" },
      { value: "delivery",    label: "Доставка упаковки", color: "bg-emerald-500" },
    ],
    owners: owners.map((u) => ({ value: u.id, label: u.name })),
    factories: factories.map((f) => ({
      value: f.id,
      label: `${f.name}${f.country ? ` (${f.country === "CN" ? "CN" : f.country})` : ""}`,
    })),
    productionRegions: (() => {
      const count: Record<"ru" | "cn" | "tyak", number> = { ru: 0, cn: 0, tyak: 0 };
      for (const r of rows) {
        if (r.productionRegion) count[r.productionRegion]++;
      }
      return (["ru", "cn", "tyak"] as const).map((v) => ({
        value: v,
        label: PRODUCTION_REGION_LABEL[v],
        count: count[v],
      }));
    })(),
    launchMonths,
    statuses: Array.from(statusMap.entries())
      .map(([v, count]) => ({
        value: v,
        label: ORDER_STATUS_LABELS[v as keyof typeof ORDER_STATUS_LABELS] ?? v,
        count,
      })),
    categories: Array.from(categoryMap.entries()).map(([c, count]) => ({ value: c, label: c, count })),
  };

  return (
    <GanttV2Client
      rows={rows}
      filterOptions={filterOptions}
      todayIso={todayIso}
      isOwner={isOwner}
    />
  );
}
