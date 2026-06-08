import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { ORDER_STATUS_ORDER } from "@/lib/constants";
import { OrderStatus, PackagingOrderStatus, ProductModelStatus } from "@prisma/client";
import { type KanbanCard, type KanbanColumn } from "@/components/models-kanban/board-client";
import { KanbanFiltersClient, type KanbanFilterOptions } from "@/components/models-kanban/kanban-filters-client";
import { colorHexFromName } from "@/lib/color-map";
import { orderKanbanColumn } from "@/lib/order-stage";

// 8 колонок: 4 под-этапа Разработки + 3 этапа после заказа + Завершено.
// Этапы Разработки видны ТОЛЬКО на канбане (не на Ганте) — детализация
// для отслеживания процесса до создания заказа. После Производства
// колонки синхронизированы с фазами Order на Ганте. Завершено — все
// заказы после прибытия на склад (отдел продукта дальше не работает).
const COLUMNS: ReadonlyArray<KanbanColumn> = [
  { key: "idea",         title: "Идея",          dot: "#af52de", group: "development" },
  { key: "sample",       title: "Образец",       dot: "#5856d6", group: "development" },
  { key: "ideal_sample", title: "Идеал. образец",dot: "#0071e3", group: "development" },
  { key: "sizing_done",  title: "Размерная сетка",dot: "#30b0c7", group: "development" },
  { key: "production",   title: "Производство",  dot: "#34c759", group: "post_order" },
  { key: "qc",           title: "ОТК",           dot: "#a8d870", group: "post_order" },
  { key: "delivery",     title: "Доставка",      dot: "#ff9500", group: "post_order" },
  { key: "done",         title: "Завершено",     dot: "#94a3b8", group: "done" },
];

// ProductModel.status → колонка (когда нет активного заказа).
function modelToColumn(status: ProductModelStatus, sizeChartReady: boolean): string {
  if (status === "IDEA") return "idea";
  if (status === "PATTERNS" || status === "SAMPLE") return "sample";
  if (status === "APPROVED") return sizeChartReady ? "sizing_done" : "ideal_sample";
  return "production";
}

// PackagingOrder → колонка. У упаковки нет ОТК — пропускаем колонку qc.
//   ORDERED        → production (только что заказали)
//   IN_PRODUCTION  → production
//   IN_TRANSIT     → delivery
//   ARRIVED        → done
//   CANCELLED      → не показываем
const PKG_ORDER_STATUS_TO_COL: Partial<Record<PackagingOrderStatus, string>> = {
  ORDERED: "production",
  IN_PRODUCTION: "production",
  IN_TRANSIT: "delivery",
  ARRIVED: "done",
};

// Статус заказа → колонка канбана берётся из ЕДИНОГО маппера
// `orderKanbanColumn` (lib/order-stage), общего с Гантом — чтобы карточка и
// Гант не расходились. Для фазы «Разработка» он возвращает null: карточка
// остаётся в колонке разработки по стадии фасона (modelToColumn).

// Заказы, которые отделу продукта уже не нужны как живые — статусы «Завершено».
const DONE_STATUSES: ReadonlyArray<OrderStatus> = [
  "WAREHOUSE_MSK", "PACKING", "SHIPPED_WB", "ON_SALE",
];

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
  handedToFactoryDate: Date | null;
  readyAtFactoryDate: Date | null;
  qcDate: Date | null;
  arrivalPlannedDate: Date | null;
  arrivalActualDate: Date | null;
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
  if (col === "done") {
    // Завершённая партия — показываем только дату прибытия (факт или план).
    // Никаких подписей про упаковку/отгрузку/продажу: это не отдел продукта.
    const iso = isoDate(order.arrivalActualDate) ?? isoDate(order.arrivalPlannedDate);
    return iso ? { iso, label: "прибыло" } : null;
  }
  return null;
}

export default async function ModelsKanbanPage() {
  const todayIso = moscowToday();
  const session = await auth();
  const currentUserId = (session?.user as { id?: string } | undefined)?.id;
  const role = (session?.user as { role?: string } | undefined)?.role;
  const isAdmin = role === "OWNER" || role === "DIRECTOR";

  // Грузим все активированные фасоны + все активные заказы упаковки.
  // Алёна (27.05.2026): «на канбан нужно добавить заказы упаковки тоже» —
  // показываются в тех же колонках post_order (без ОТК) с отдельным UX.
  const [models, packagingOrders] = await Promise.all([
    prisma.productModel.findMany({
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
          handedToFactoryDate: true,
          readyAtFactoryDate: true, qcDate: true,
          arrivalPlannedDate: true, arrivalActualDate: true,
          saleStartDate: true,
          factory: { select: { name: true, country: true } },
          lines: { select: { quantity: true } },
        },
      },
    },
    }),
    prisma.packagingOrder.findMany({
      where: { status: { in: ["ORDERED", "IN_PRODUCTION", "IN_TRANSIT", "ARRIVED"] } },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        orderNumber: true,
        status: true,
        productionEndDate: true,
        expectedDate: true,
        arrivedDate: true,
        ownerId: true,
        factory: { select: { name: true } },
        owner: { select: { id: true, name: true } },
        lines: {
          select: {
            quantity: true,
            packagingItem: { select: { name: true, photoUrl: true } },
          },
        },
      },
    }),
  ]);

  // Комментарии к фасонам: счётчик + превью последнего (для карточек).
  const modelIds = models.map((m) => m.id);
  const modelComments = modelIds.length === 0 ? [] : await prisma.comment.findMany({
    where: { entityType: "model", entityId: { in: modelIds }, deletedAt: null },
    orderBy: { createdAt: "desc" },
    select: { entityId: true, body: true, authorId: true, photoUrls: true },
  });
  const commentCountByModel = new Map<string, number>();
  // До 2 последних комментариев на фасон (для превью на карточке).
  const latestByModel = new Map<string, Array<{ body: string; authorId: string; photos: number }>>();
  for (const cm of modelComments) {
    commentCountByModel.set(cm.entityId, (commentCountByModel.get(cm.entityId) ?? 0) + 1);
    const arr = latestByModel.get(cm.entityId) ?? [];
    if (arr.length < 2) {
      arr.push({ body: cm.body, authorId: cm.authorId, photos: cm.photoUrls?.length ?? 0 });
      latestByModel.set(cm.entityId, arr);
    }
  }
  const lastAuthorIds = [...new Set([...latestByModel.values()].flat().map((v) => v.authorId))];
  const lastAuthors = lastAuthorIds.length === 0 ? [] : await prisma.user.findMany({
    where: { id: { in: lastAuthorIds } },
    select: { id: true, name: true },
  });
  const authorNameById = new Map(lastAuthors.map((a) => [a.id, a.name]));
  function commentMetaFor(modelId: string): Pick<KanbanCard, "commentCount" | "lastComments"> {
    const count = commentCountByModel.get(modelId) ?? 0;
    const arr = latestByModel.get(modelId) ?? [];
    // Показываем в хронологическом порядке (старший из двух — сверху, как в ленте).
    const lastComments = [...arr].reverse().map((c) => ({
      author: authorNameById.get(c.authorId) ?? "—",
      snippet: c.body.slice(0, 90),
      photos: c.photos,
    }));
    return { commentCount: count, lastComments };
  }

  // Раскидать карточки по колонкам
  const buckets: Record<string, KanbanCard[]> = Object.fromEntries(COLUMNS.map((c) => [c.key, []]));

  for (const m of models) {
    const allOrders = m.orders as OrderForKanban[];
    // Делим заказы на завершённые и активные. У одного фасона может быть
    // одновременно несколько завершённых партий и одна-две активные —
    // тогда фасон показывается в нескольких колонках сразу.
    const doneOrders = allOrders.filter((o) => DONE_STATUSES.includes(o.status));
    const liveOrders = allOrders.filter((o) => !DONE_STATUSES.includes(o.status));

    // Уникальные цвета вариантов модели — общие для всех карточек этого фасона.
    const colorChips: Array<{ name: string; hex: string }> = [];
    const seenHex = new Set<string>();
    for (const v of m.variants ?? []) {
      const hex = colorHexFromName(v.colorName);
      if (seenHex.has(hex)) continue;
      seenHex.add(hex);
      colorChips.push({ name: v.colorName, hex });
    }

    const pushCard = (column: string, order: OrderForKanban | null) => {
      const deadline = pickDeadline(column, m, order);
      const qty = order ? order.lines.reduce((a, l) => a + l.quantity, 0) : 0;
      let dlColor: "red" | "amber" | "gray" | null = null;
      if (deadline) {
        const diff = dayDiff(todayIso, deadline.iso);
        dlColor = diff < 0 ? "red" : diff <= 7 ? "amber" : "gray";
      }
      buckets[column].push({
        modelId: m.id,
        modelName: m.name,
        brandLabel: m.brand,
        category: m.category,
        subcategory: m.subcategory,
        photo: m.photoUrls?.[0] ?? null,
        photos: m.photoUrls ?? [],
        palette: pickPalette(m.id),
        factoryName: order?.factory?.name ?? m.preferredFactory?.name ?? null,
        ownerId: m.ownerId,
        columnKey: column,
        qty,
        orderNumber: order?.orderNumber ?? null,
        orderId: order?.id ?? null,
        deadline,
        dlColor,
        colorChips,
        ...commentMetaFor(m.id),
      });
    };

    // Завершённые партии: по карточке на каждую — это история «что я довела до полок».
    for (const o of doneOrders) {
      pushCard("done", o);
    }

    // Активная сторона: самый продвинутый из live-заказов определяет колонку.
    // Колонку считает ЕДИНЫЙ маппер orderKanbanColumn (общий с Гантом):
    //   • заказ в фазе «Разработка» (PREPARATION / FABRIC_ORDERED) → null →
    //     карточка остаётся в колонке разработки по стадии фасона;
    //   • Производство / ОТК / Доставка → соответствующая пост-заказная колонка.
    // Если live-заказа нет — колонка по статусу фасона.
    const liveOrder = mostAdvanced(liveOrders);
    const postOrderCol = liveOrder ? orderKanbanColumn(liveOrder.status) : null;
    let liveColumn: string;
    if (!liveOrder || postOrderCol === null) {
      // Заказ ещё в Разработке (или его нет) — колонка по стадии фасона.
      // Но живой заказ в Разработке не должен висеть в пост-заказной «Производство»
      // (если фасон уже помечен IN_PRODUCTION) — прижимаем к «Размерной сетке».
      const mc = modelToColumn(m.status, m.sizeChartReady);
      liveColumn = liveOrder && mc === "production" ? "sizing_done" : mc;
    } else {
      liveColumn = postOrderCol;
    }
    // Если все заказы фасона уже в done и нет активных — не дублируем карточку
    // в колонку разработки. Иначе она появится одновременно в «Завершено» и
    // в исходной IDEA, что путает.
    if (liveOrders.length > 0 || doneOrders.length === 0) {
      pushCard(liveColumn, liveOrder);
    }
  }

  // ── Заказы упаковки ─────────────────────────────────────────────
  // Каждая карточка = один PackagingOrder. Фото = первое фото первого
  // PackagingItem в lines, заголовок = "📦 PKG-..." + название первой позиции.
  // Без цветочипов и без drag-n-drop.
  for (const po of packagingOrders) {
    const col = PKG_ORDER_STATUS_TO_COL[po.status];
    if (!col) continue;
    const firstLine = po.lines[0];
    const totalQty = po.lines.reduce((s, l) => s + l.quantity, 0);
    const firstItemName = firstLine?.packagingItem?.name ?? "";
    const extraItems = po.lines.length > 1 ? ` +${po.lines.length - 1}` : "";

    // Дедлайн: для production — productionEndDate, для delivery — expectedDate,
    // для done — arrivedDate (фактическая дата прибытия).
    let deadline: { iso: string; label: string } | null = null;
    if (col === "production" && po.productionEndDate) {
      deadline = { iso: isoDate(po.productionEndDate)!, label: "готов" };
    } else if (col === "delivery" && po.expectedDate) {
      deadline = { iso: isoDate(po.expectedDate)!, label: "прибытие" };
    } else if (col === "done") {
      const iso = isoDate(po.arrivedDate) ?? isoDate(po.expectedDate);
      if (iso) deadline = { iso, label: "прибыло" };
    }
    let dlColor: "red" | "amber" | "gray" | null = null;
    if (deadline) {
      const diff = dayDiff(todayIso, deadline.iso);
      dlColor = diff < 0 ? "red" : diff <= 7 ? "amber" : "gray";
    }

    buckets[col].push({
      modelId: po.id,
      modelName: `📦 ${po.orderNumber}${firstItemName ? ` · ${firstItemName}${extraItems}` : ""}`,
      brandLabel: "Упаковка",
      category: "Упаковка",
      subcategory: null,
      photo: firstLine?.packagingItem?.photoUrl ?? null,
      palette: pickPalette(po.id),
      factoryName: po.factory?.name ?? null,
      ownerId: po.ownerId,
      columnKey: col,
      qty: totalQty,
      orderNumber: po.orderNumber,
      orderId: po.id,
      deadline,
      dlColor,
      colorChips: [],
      kind: "packaging-order",
    });
  }

  // Опции фильтров — считаются по реальным карточкам с count'ами.
  const allCards = COLUMNS.flatMap((c) => buckets[c.key]);
  const categoryCount = new Map<string, number>();
  const ownerMap = new Map<string, { name: string; count: number }>();
  for (const c of allCards) {
    categoryCount.set(c.category, (categoryCount.get(c.category) ?? 0) + 1);
    if (c.ownerId) {
      const own = ownerMap.get(c.ownerId);
      const m = models.find((m) => m.ownerId === c.ownerId);
      ownerMap.set(c.ownerId, { name: m?.owner?.name ?? "", count: (own?.count ?? 0) + 1 });
    }
  }
  const filterOptions: KanbanFilterOptions = {
    categories: [...categoryCount.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([value, count]) => ({ value, label: value, count })),
    owners: [...ownerMap.entries()]
      .sort((a, b) => a[1].name.localeCompare(b[1].name))
      .map(([value, { name, count }]) => ({ value, label: name, count })),
    statuses: COLUMNS
      .map((col) => ({
        value: col.key,
        label: col.title,
        count: buckets[col.key]?.length ?? 0,
      }))
      .filter((s) => s.count > 0),
  };

  return (
    <div className="space-y-3">
      <KanbanFiltersClient
        columns={COLUMNS}
        buckets={buckets}
        filterOptions={filterOptions}
        total={models.length}
        currentUserId={currentUserId}
        isAdmin={isAdmin}
      />
    </div>
  );
}
