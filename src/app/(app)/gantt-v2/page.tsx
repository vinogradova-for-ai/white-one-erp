import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { GanttV2Client } from "@/components/gantt-v2/gantt-v2-client";
import type { GanttRowV2, GanttBarV2, BarState, GanttFilterOptions } from "@/components/gantt-v2/types";
import { ORDER_STATUS_LABELS, BRAND_LABELS, PRODUCT_MODEL_STATUS_LABELS } from "@/lib/constants";
import { orderActivePhaseIndex } from "@/lib/order-stage";
import { moscowTodayIso } from "@/lib/dates";
import { ListCapNotice } from "@/components/common/list-cap-notice";

// Потолок ленты Ганта (аудит блок ④): при ровно стольких заказах показываем
// полосу «показаны первые N». Пагинация — отдельной задачей.
const GANTT_ORDERS_CAP = 500;
import { orderLateDays } from "@/lib/order-auto-status";
import { PACKAGING_ORDER_STATUS_LABELS, packagingActivePhaseIndex } from "@/lib/packaging-orders";

// Фазы заказа: 4 фиксированных этапа от Разработки до Доставки.
// Каждой фазе соответствует пара полей в БД (start/end), причём end предыдущей
// фазы = start следующей (одно поле в БД). Порядок строго совпадает с
// ORDER_GANTT_PHASES в lib/order-stage: какая фаза «активна», решает ОДИН
// общий маппер по статусу заказа (а не локальный словарь — это был источник
// рассинхрона Ганта и канбана).
const PHASES = [
  { key: "preparation", title: "Разработка",   color: "bg-slate-400",    startKey: "decisionDate",        endKey: "handedToFactoryDate" },
  { key: "production",  title: "Производство", color: "bg-blue-500",    startKey: "handedToFactoryDate", endKey: "readyAtFactoryDate" },
  { key: "qc",          title: "ОТК",          color: "bg-amber-500",   startKey: "readyAtFactoryDate",  endKey: "qcDate" },
  { key: "shipping",    title: "Доставка",     color: "bg-emerald-500", startKey: "qcDate",              endKey: "arrivalPlannedDate" },
] as const;

const NEARLY_DUE_DAYS = 5;

function iso(d: Date | null | undefined): string | null {
  return d ? d.toISOString().slice(0, 10) : null;
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

  const [orders, packagingOrders, devModels, owners, factories] = await Promise.all([
    prisma.order.findMany({
      where: { deletedAt: null, status: { not: "ON_SALE" } },
      orderBy: { launchMonth: "asc" },
      take: GANTT_ORDERS_CAP,
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
    // Фасоны в разработке БЕЗ заказа (правка Алёны №2, 03.07): идея, взятая
    // в работу, видна в Ганте с первого дня — полоса «Разработка» до сегодня.
    // Когда появится заказ, эта строка исчезнет, а заказ унаследует старт
    // разработки (см. создание заказа) — таймлайн сквозной, без «обнуления».
    prisma.productModel.findMany({
      where: {
        deletedAt: null,
        activated: true,
        orders: { none: { deletedAt: null } },
      },
      select: {
        id: true,
        name: true,
        photoUrls: true,
        brand: true,
        category: true,
        status: true,
        createdAt: true,
        plannedLaunchMonth: true,
        owner: { select: { id: true, name: true } },
        preferredFactory: { select: { id: true, name: true, country: true } },
      },
      orderBy: { createdAt: "asc" },
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
  const todayIso = moscowTodayIso();
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

    const bars: GanttBarV2[] = [];
    for (let i = 0; i < PHASES.length; i++) {
      const ph = PHASES[i];
      const startRaw = (o as Record<string, unknown>)[ph.startKey] as Date | null | undefined;
      const endRaw = (o as Record<string, unknown>)[ph.endKey] as Date | null | undefined;
      const startIso: string = iso(startRaw) ?? prevEnd ?? todayIso;
      const endIso: string = iso(endRaw) ?? startIso;
      prevEnd = endIso;
      const isFirstInChain = i === 0;
      bars.push({
        key: ph.key,
        title: ph.title,
        color: ph.color,
        start: startIso,
        end: endIso,
        state: "future", // проставится ниже, когда известна активная фаза
        owner: getPhaseOwner(ph.key, o.owner?.name, o.factory?.name),
        orderId: o.id,
        endField: ph.endKey,
        ...(isFirstInChain ? { startField: ph.startKey } : {}),
      });
    }

    // ГАНТ ПЕРВИЧЕН (Алёна 05.07): активная фаза = где стоит «сегодня» по датам
    // (девочки двигают Гант, статусы руками не отмечают). Ручной статус решает
    // только «завершён ли заказ» (склад принял — orderActivePhaseIndex = -1).
    // Если «сегодня» за концом Доставки, а заказ не завершён — активной остаётся
    // Доставка (просрочка подсвечивается красным, а не ложным «готово»).
    const firstUnfinished = bars.findIndex((b) => todayIso < b.end);
    const activeIdx =
      orderActivePhaseIndex(o.status) === -1
        ? -1
        : firstUnfinished === -1
          ? bars.length - 1
          : firstUnfinished;
    for (let i = 0; i < bars.length; i++) {
      const done = activeIdx === -1 || i < activeIdx;
      bars[i].state = done ? "done" : i === activeIdx ? "active" : "future";
      const overdue = !done && bars[i].end < todayIso;
      const daysToEnd = Math.round((new Date(bars[i].end).getTime() - new Date(todayIso).getTime()) / 86400000);
      bars[i].overdue = overdue;
      bars[i].nearlyDue = !done && !overdue && daysToEnd >= 0 && daysToEnd <= NEARLY_DUE_DAYS;
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
      lateDays: orderLateDays({
        readyAtFactoryDate: o.readyAtFactoryDate,
        qcDate: o.qcDate,
        arrivalPlannedDate: o.arrivalPlannedDate,
        arrivalActualDate: o.arrivalActualDate,
        status: o.status,
      }),
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

    const phases: Array<{
      key: string; title: string; color: string;
      start: string; end: string;
      endField: string; startField?: string;
    }> = [
      { key: "preparation", title: "Разработка",  color: "bg-slate-400",    start: decisionIso,    end: orderedIso,       endField: "orderedDate", startField: "decisionDate" },
      { key: "production",  title: "Производство", color: "bg-blue-500",    start: orderedIso,     end: productionEndIso, endField: "productionEndDate" },
      { key: "delivery",    title: "Доставка",      color: "bg-emerald-500", start: productionEndIso, end: expectedIso,    endField: "expectedDate" },
    ];

    // ГАНТ ПЕРВИЧЕН: активная фаза упаковки — где «сегодня» по датам (как у
    // одежды). Ручной статус решает только завершённость (ARRIVED/CANCELLED
    // сюда не попадают — отфильтрованы запросом). Разработка позади всегда:
    // заказ размещён, поэтому активная фаза минимум «Производство».
    const firstUnfinishedPkg = phases.findIndex((p) => todayIso < p.end);
    const activeIdx =
      packagingActivePhaseIndex(po.status) === -1
        ? -1
        : Math.max(1, firstUnfinishedPkg === -1 ? phases.length - 1 : firstUnfinishedPkg);

    const bars: GanttBarV2[] = phases.map((p, i) => {
      const done = activeIdx === -1 || i < activeIdx;
      const overdue = !done && p.end < todayIso;
      const daysToEnd = Math.round((new Date(p.end).getTime() - new Date(todayIso).getTime()) / 86400000);
      const nearlyDue = !done && !overdue && daysToEnd >= 0 && daysToEnd <= NEARLY_DUE_DAYS;
      const state: BarState = done ? "done" : i === activeIdx ? "active" : "future";
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
      statusLabel: PACKAGING_ORDER_STATUS_LABELS[po.status] ?? po.status,
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

  // === РАЗРАБОТКА (фасоны без заказа) ===
  // Одна полоса «Разработка» от взятия идеи в работу до сегодня (правка №2).
  // Без дробления на «лекала/образец» — те под-этапы Алёна отклоняла раньше;
  // стадия видна текстом в подписи. Полоса не таскается (дат-полей у неё нет),
  // при создании заказа строка исчезает, а заказ наследует старт разработки.
  for (const m of devModels) {
    const startIso = iso(m.createdAt) ?? todayIso;
    const devDays = Math.max(
      1,
      Math.round((new Date(todayIso).getTime() - new Date(startIso).getTime()) / 86400000),
    );
    const stageLabel = PRODUCT_MODEL_STATUS_LABELS[m.status];
    rows.push({
      group: "development",
      id: m.id,
      href: `/models/${m.id}`,
      title: `${m.name} · разработка`,
      // statusLabel уже выводится перед subtitle — стадию тут не дублируем
      // (на проде было «Идея · Идея · 30 дн», скрин Алёны 04.07).
      subtitle: `${devDays} дн в разработке`,
      statusLabel: stageLabel,
      brand: m.brand,
      factoryId: m.preferredFactory?.id ?? null,
      factoryName: m.preferredFactory?.name ?? null,
      productionRegion: productionRegionOf(m.preferredFactory),
      ownerId: m.owner?.id ?? null,
      ownerName: m.owner?.name ?? null,
      launchMonth: m.plannedLaunchMonth ?? null,
      category: m.category ?? null,
      rawStatus: m.status,
      hasOverdue: false,
      hasNearlyDue: false,
      thumbnails: [{ photoUrl: m.photoUrls?.[0] ?? null, colorName: null }],
      bars: [
        {
          key: "development",
          title: "Разработка",
          color: "bg-purple-400",
          start: startIso,
          end: todayIso,
          state: "active",
          owner: m.owner?.name ?? undefined,
          overdue: false,
          nearlyDue: false,
        },
      ],
    });
  }

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
    <div className="space-y-3">
      <ListCapNotice shown={orders.length} cap={GANTT_ORDERS_CAP} unit="заказов" />
      <GanttV2Client
        rows={rows}
        filterOptions={filterOptions}
        todayIso={todayIso}
        isOwner={isOwner}
      />
    </div>
  );
}
