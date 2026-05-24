import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { ORDER_STATUS_ORDER } from "@/lib/constants";
import { OrderStatus, ProductModelStatus } from "@prisma/client";
import { type KanbanCard, type KanbanColumn } from "@/components/models-kanban/board-client";
import { KanbanFiltersClient, type KanbanFilterOptions } from "@/components/models-kanban/kanban-filters-client";
import { colorHexFromName } from "@/lib/color-map";

// 8 колонок: 4 под-этапа Разработки + 4 этапа после заказа.
// Этапы Разработки видны ТОЛЬКО на канбане (не на Ганте) — детализация
// для отслеживания процесса до создания заказа. После Производства
// колонки синхронизированы с фазами Order на Ганте.
const COLUMNS: ReadonlyArray<KanbanColumn> = [
  { key: "idea",         title: "Идея",          dot: "#af52de", group: "development" },
  { key: "sample",       title: "Образец",       dot: "#5856d6", group: "development" },
  { key: "ideal_sample", title: "Идеал. образец",dot: "#0071e3", group: "development" },
  { key: "sizing_done",  title: "Размерная сетка",dot: "#30b0c7", group: "development" },
  { key: "production",   title: "Производство",  dot: "#34c759", group: "post_order" },
  { key: "qc",           title: "ОТК",           dot: "#a8d870", group: "post_order" },
  { key: "delivery",     title: "Доставка",      dot: "#ff9500", group: "post_order" },
  { key: "on_sale",      title: "В продаже",     dot: "#ffcc00", group: "post_order" },
];

// ProductModel.status → колонка (когда нет активного заказа).
function modelToColumn(status: ProductModelStatus, sizeChartReady: boolean): string {
  if (status === "IDEA") return "idea";
  if (status === "PATTERNS" || status === "SAMPLE") return "sample";
  if (status === "APPROVED") return sizeChartReady ? "sizing_done" : "ideal_sample";
  return "production";
}

const ORDER_STATUS_TO_COL: Record<OrderStatus, string> = {
  PREPARATION: "production",
  FABRIC_ORDERED: "production",
  SEWING: "production",
  QC: "qc",
  READY_SHIP: "qc",
  IN_TRANSIT: "delivery",
  WAREHOUSE_MSK: "delivery",
  PACKING: "delivery",
  SHIPPED_WB: "delivery",
  ON_SALE: "on_sale",
};

const PLACEHOLDER_PALETTES: Array<[string, string]> = [
  ["#fce4ec", "#f8bbd0"], ["#e8eaf6", "#c5cae9"], ["#fff3e0", "#ffe0b2"],
  ["#e0f2f1", "#b2dfdb"], ["#f3e5f5", "#e1bee7"], ["#fffde7", "#fff59d"],
  ["#e3f2fd", "#bbdefb"], ["#e8f5e9", "#c8e6c9"], ["#fff9c4", "#fff59d"],
  ["#dcedc8", "#aed581"], ["#fff8e1", "#ffecb3"], ["#ffe0b2", "#ffcc80"],
];
function pickPalette(id: string): [string, string] {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) & 0xffffffff;
  return PLACEHOLDER_PALETTES[Math.abs(h) % PLACEHOLDER_PALETTES.length];
}

function isoDate(d: Date | null | undefined): string | null {
  return d ? d.toISOString().slice(0, 10) : null;
}

function moscowToday(): string {
  const now = new Date();
  const mskMs = now.getTime() + 3 * 60 * 60 * 1000;
  return new Date(mskMs).toISOString().slice(0, 10);
}

function dayDiff(aIso: string, bIso: string): number {
  return Math.round(
    (new Date(`${bIso}T00:00:00Z`).getTime() - new Date(`${aIso}T00:00:00Z`).getTime()) / 86400000
  );
}

type OrderForKanban = {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  readyAtFactoryDate: Date | null;
  qcDate: Date | null;
  arrivalPlannedDate: Date | null;
  saleStartDate: Date | null;
  factory: { name: string; country: string | null } | null;
  lines: Array<{ quantity: number }>;
};

function mostAdvanced(orders: OrderForKanban[]): OrderForKanban | null {
  if (orders.length === 0) return null;
  return [...orders].sort(
    (a, b) => ORDER_STATUS_ORDER.indexOf(b.status) - ORDER_STATUS_ORDER.indexOf(a.status)
  )[0];
}

function pickDeadline(col: string, model: { sampleDate: Date | null; approvedDate: Date | null; productionStartDate: Date | null; plannedLaunchMonth: number | null }, order: OrderForKanban | null): { iso: string; label: string } | null {
  if (col === "idea") {
    if (!model.plannedLaunchMonth) return null;
    const ym = String(model.plannedLaunchMonth);
    return { iso: `${ym.slice(0,4)}-${ym.slice(4,6)}-01`, label: "запуск" };
  }
  if (col === "sample") return model.sampleDate
    ? { iso: isoDate(model.sampleDate)!, label: "образец" } : null;
  if (col === "ideal_sample") return model.approvedDate
    ? { iso: isoDate(model.approvedDate)!, label: "утв." } : null;
  if (col === "sizing_done") return model.productionStartDate
    ? { iso: isoDate(model.productionStartDate)!, label: "запуск" } : null;
  if (!order) return null;
  if (col === "production") return order.readyAtFactoryDate
    ? { iso: isoDate(order.readyAtFactoryDate)!, label: "готов на фабрике" } : null;
  if (col === "qc") return order.qcDate
    ? { iso: isoDate(order.qcDate)!, label: "ОТК" } : null;
  if (col === "delivery") return order.arrivalPlannedDate
    ? { iso: isoDate(order.arrivalPlannedDate)!, label: "прибытие" } : null;
  if (col === "on_sale") return order.saleStartDate
    ? { iso: isoDate(order.saleStartDate)!, label: "продажи" } : null;
  return null;
}

// Регион производства (см. /gantt-v2): по preferredFactory фасона.
// Имя содержит «тяк» → tyak. Иначе по стране: «Росс…» → ru, «Кит…» / «CN» → cn.
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
  ru: "Россия", cn: "Китай", tyak: "Тяк",
};

export default async function ModelsKanbanPage() {
  const todayIso = moscowToday();

  // Грузим все активированные фасоны без фильтрации в where — фильтрация
  // выполняется на клиенте multi-select dropdown'ами (как на /gantt-v2).
  const models = await prisma.productModel.findMany({
    where: { deletedAt: null, activated: true },
    orderBy: { updatedAt: "desc" },
    take: 500,
    select: {
      id: true, name: true, brand: true, category: true, subcategory: true,
      photoUrls: true, status: true, sizeChartReady: true, ownerId: true,
      sampleDate: true, approvedDate: true, productionStartDate: true, plannedLaunchMonth: true,
      preferredFactory: { select: { name: true, country: true } },
      owner: { select: { id: true, name: true } },
      variants: {
        where: { deletedAt: null },
        select: { colorName: true },
        orderBy: { createdAt: "asc" },
        take: 8,
      },
      orders: {
        where: { deletedAt: null },
        select: {
          id: true, orderNumber: true, status: true,
          readyAtFactoryDate: true, qcDate: true, arrivalPlannedDate: true, saleStartDate: true,
          factory: { select: { name: true, country: true } },
          lines: { select: { quantity: true } },
        },
      },
    },
  });

  // Раскидать карточки по колонкам
  const buckets: Record<string, KanbanCard[]> = Object.fromEntries(COLUMNS.map((c) => [c.key, []]));

  for (const m of models) {
    const order = mostAdvanced(m.orders as OrderForKanban[]);
    // ВАЖНО: если сам ФАСОН ещё в разработке (IDEA / PATTERNS / SAMPLE),
    // колонка определяется по статусу ФАСОНА, даже если у него уже есть
    // заказ. Заказы могут существовать параллельно с дизайном (тестовый
    // пошив, пилотная партия), но фасон остаётся в колонке разработки,
    // пока его не утвердили (status >= APPROVED).
    // Без этого пилотный заказ на статусе SEWING тянул фасон в колонку
    // «Производство», хотя сам фасон ещё «Идея».
    const isStillInDevelopment = m.status === "IDEA" || m.status === "PATTERNS" || m.status === "SAMPLE";
    const column = (order && !isStillInDevelopment)
      ? ORDER_STATUS_TO_COL[order.status]
      : modelToColumn(m.status, m.sizeChartReady);
    const deadline = pickDeadline(column, m, order);
    const qty = order ? order.lines.reduce((a, l) => a + l.quantity, 0) : 0;

    let dlColor: "red" | "amber" | "gray" | null = null;
    if (deadline) {
      const diff = dayDiff(todayIso, deadline.iso);
      dlColor = diff < 0 ? "red" : diff <= 7 ? "amber" : "gray";
    }

    // Уникальные цвета вариантов модели → дедуплицируем по hex.
    const colorChips: Array<{ name: string; hex: string }> = [];
    const seenHex = new Set<string>();
    for (const v of m.variants ?? []) {
      const hex = colorHexFromName(v.colorName);
      if (seenHex.has(hex)) continue;
      seenHex.add(hex);
      colorChips.push({ name: v.colorName, hex });
    }

    buckets[column].push({
      modelId: m.id,
      modelName: m.name,
      brandLabel: m.brand,
      category: m.category,
      subcategory: m.subcategory,
      photo: m.photoUrls?.[0] ?? null,
      palette: pickPalette(m.id),
      factoryName: order?.factory?.name ?? m.preferredFactory?.name ?? null,
      ownerId: m.ownerId,
      productionRegion: productionRegionOf(order?.factory ?? m.preferredFactory),
      qty,
      orderNumber: order?.orderNumber ?? null,
      orderId: order?.id ?? null,
      deadline,
      dlColor,
      colorChips,
    });
  }

  // Опции фильтров — считаются по реальным карточкам с count'ами.
  const allCards = COLUMNS.flatMap((c) => buckets[c.key]);
  const categoryCount = new Map<string, number>();
  const ownerMap = new Map<string, { name: string; count: number }>();
  const regionCount: Record<"ru" | "cn" | "tyak", number> = { ru: 0, cn: 0, tyak: 0 };
  for (const c of allCards) {
    categoryCount.set(c.category, (categoryCount.get(c.category) ?? 0) + 1);
    if (c.ownerId) {
      const own = ownerMap.get(c.ownerId);
      const m = models.find((m) => m.ownerId === c.ownerId);
      ownerMap.set(c.ownerId, { name: m?.owner?.name ?? "", count: (own?.count ?? 0) + 1 });
    }
    if (c.productionRegion) regionCount[c.productionRegion]++;
  }
  const filterOptions: KanbanFilterOptions = {
    categories: [...categoryCount.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([value, count]) => ({ value, label: value, count })),
    owners: [...ownerMap.entries()]
      .sort((a, b) => a[1].name.localeCompare(b[1].name))
      .map(([value, { name, count }]) => ({ value, label: name, count })),
    productionRegions: (["ru", "cn", "tyak"] as const).map((v) => ({
      value: v,
      label: PRODUCTION_REGION_LABEL[v],
      count: regionCount[v],
    })),
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex gap-1 bg-slate-100 rounded-lg p-0.5">
          <Link href="/models" className="px-3 py-1 text-sm rounded-md text-slate-600 hover:bg-white">Список</Link>
          <span className="px-3 py-1 text-sm rounded-md bg-white text-slate-900 font-medium shadow-sm">Канбан</span>
        </div>
      </div>

      <KanbanFiltersClient
        columns={COLUMNS}
        buckets={buckets}
        filterOptions={filterOptions}
        total={models.length}
      />
    </div>
  );
}
