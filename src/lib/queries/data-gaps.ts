import { prisma } from "@/lib/prisma";
import { ORDER_STATUS_LABELS } from "@/lib/constants";
import { checkTermsMismatch } from "@/lib/payments/terms-mismatch";
import type { OrderStatus } from "@prisma/client";

// «Дыры в данных» — всё незаполненное, из-за чего цифры в кабинете врут:
// заказы без цены (сумма 0 ₽), фасоны в работе без комплекта упаковки
// (дефицит упаковки занижен), цвета без фото, пустой состав/ТНВЭД для ЧЗ,
// просроченные неотмеченные оплаты, незаданный план месяца.
// Каждая строка — ссылка на место, где дыру можно закрыть.

export type GapRow = {
  id: string;
  title: string;
  subtitle?: string;
  href: string;
};

export type GapSection = {
  key: string;
  title: string;
  // Почему это дыра: что именно врёт в кабинете, пока поле пустое.
  why: string;
  rows: GapRow[];
  // Дополнительная строка в шапке секции (например, общая сумма).
  extra?: string;
};

// Заказ считается «в работе» с пошива и дальше — к прибытию упаковка уже нужна.
const IN_WORK_STATUSES: OrderStatus[] = [
  "SEWING",
  "QC",
  "READY_SHIP",
  "IN_TRANSIT",
  "WAREHOUSE_MSK",
  "PACKING",
  "SHIPPED_WB",
  "ON_SALE",
];

function currentYearMonthMsk(now: Date = new Date()): number {
  const msk = new Date(now.getTime() + 3 * 60 * 60_000);
  return msk.getUTCFullYear() * 100 + (msk.getUTCMonth() + 1);
}

export async function getDataGaps(now: Date = new Date()): Promise<GapSection[]> {
  const yearMonth = currentYearMonthMsk(now);

  const [
    ordersWithLines,
    modelsNoPackaging,
    variantsNoPhoto,
    chzModels,
    overduePayments,
    productUsers,
    monthPlans,
  ] = await Promise.all([
    prisma.order.findMany({
      where: { deletedAt: null },
      select: {
        id: true,
        orderNumber: true,
        status: true,
        paymentTerms: true,
        productModel: { select: { name: true } },
        lines: { select: { batchCost: true } },
        payments: { where: { type: "ORDER" }, select: { amount: true }, orderBy: { plannedDate: "asc" } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.productModel.findMany({
      where: {
        deletedAt: null,
        packagingItems: { none: {} },
        orders: { some: { deletedAt: null, status: { in: IN_WORK_STATUSES } } },
      },
      select: { id: true, name: true, category: true },
      orderBy: { name: "asc" },
    }),
    prisma.productVariant.findMany({
      where: {
        deletedAt: null,
        status: { not: "DISCONTINUED" },
        photoUrls: { isEmpty: true },
        productModel: { deletedAt: null },
      },
      select: {
        id: true,
        sku: true,
        colorName: true,
        productModelId: true,
        productModel: { select: { name: true } },
      },
      orderBy: { sku: "asc" },
    }),
    prisma.productModel.findMany({
      where: {
        deletedAt: null,
        orders: { some: { deletedAt: null } },
        OR: [
          { fabricComposition: null },
          { fabricComposition: "" },
          { tnvedCode: null },
          { tnvedCode: "" },
        ],
      },
      select: { id: true, name: true, fabricComposition: true, tnvedCode: true },
      orderBy: { name: "asc" },
    }),
    prisma.payment.findMany({
      where: { status: "PENDING", plannedDate: { lt: now } },
      select: {
        id: true,
        label: true,
        amount: true,
        currency: true,
        plannedDate: true,
        order: { select: { orderNumber: true, productModel: { select: { name: true } } } },
        packagingItem: { select: { name: true } },
      },
      orderBy: { plannedDate: "asc" },
    }),
    prisma.user.findMany({
      where: { isActive: true, role: { in: ["OWNER", "DIRECTOR", "PRODUCT_MANAGER"] } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.monthlyPlan.findMany({
      where: { yearMonth },
      select: { ownerId: true },
    }),
  ]);

  const sections: GapSection[] = [];

  // 1. Заказы без цены
  const noPriceOrders = ordersWithLines.filter((o) => {
    const total = o.lines.reduce((a, l) => a + Number(l.batchCost ?? 0), 0);
    return o.lines.length === 0 || total === 0;
  });
  sections.push({
    key: "orders-no-price",
    title: "Заказы без цены",
    why: "Сумма заказа = 0 ₽ — врут список заказов, платежи и «деньги продукта» в статистике.",
    rows: noPriceOrders.map((o) => ({
      id: o.id,
      title: `${o.orderNumber} · ${o.productModel.name}`,
      subtitle: ORDER_STATUS_LABELS[o.status],
      href: `/orders/${o.id}`,
    })),
  });

  // 1б. График платежей не совпадает с условиями оплаты (баг «30/70 в шапке, 50/50 в графике»)
  const termsMismatchOrders = ordersWithLines
    .map((o) => ({
      order: o,
      check: checkTermsMismatch(o.paymentTerms, o.payments.map((p) => Number(p.amount))),
    }))
    .filter((x) => x.check && !x.check.match);
  sections.push({
    key: "payments-terms-mismatch",
    title: "График платежей не совпадает с условиями оплаты",
    why: "В шапке заказа одни условия, а платежи разбиты иначе — даты и суммы долга фабрике врут. Открой заказ и нажми «Пересчитать по условиям».",
    rows: termsMismatchOrders.map(({ order: o, check }) => ({
      id: o.id,
      title: `${o.orderNumber} · ${o.productModel.name}`,
      subtitle: `условия ${check!.expectedLabel}, в графике ${check!.actualLabel}`,
      href: `/orders/${o.id}`,
    })),
  });

  // 2. Фасоны в работе без комплекта упаковки
  sections.push({
    key: "models-no-packaging",
    title: "Фасоны в работе без комплекта упаковки",
    why: "По этим фасонам потребность в упаковке = 0 — дефицит на экране «Упаковка» занижен.",
    rows: modelsNoPackaging.map((m) => ({
      id: m.id,
      title: m.name,
      subtitle: m.category,
      href: `/models/${m.id}`,
    })),
  });

  // 3. Цветомодели без фото
  sections.push({
    key: "variants-no-photo",
    title: "Цветомодели без фото",
    why: "Без фото цвет не узнать в заказах, приёмке и артикулах для фотосессии.",
    rows: variantsNoPhoto.map((v) => ({
      id: v.id,
      title: `${v.productModel.name} · ${v.colorName}`,
      subtitle: v.sku,
      href: `/models/${v.productModelId}`,
    })),
  });

  // 4. Пустой состав / ТНВЭД для Честного знака
  sections.push({
    key: "chz-gaps",
    title: "Нет состава или ТНВЭД (Честный знак)",
    why: "Без состава и ТНВЭД карточку не завести в Национальный каталог ЧЗ.",
    rows: chzModels.map((m) => {
      const missing = [
        !m.fabricComposition ? "состав" : null,
        !m.tnvedCode ? "ТНВЭД" : null,
      ].filter(Boolean);
      return {
        id: m.id,
        title: m.name,
        subtitle: `не заполнено: ${missing.join(" + ")}`,
        href: `/models/${m.id}`,
      };
    }),
  });

  // 5. Просроченные неотмеченные оплаты
  const overdueSum = overduePayments
    .filter((p) => p.currency === "RUB")
    .reduce((a, p) => a + Number(p.amount), 0);
  sections.push({
    key: "payments-overdue",
    title: "Оплаты просрочены или не отмечены",
    why: "Плановая дата прошла, а оплата не отмечена — вкладка «Платежи» врёт про долги фабрикам.",
    extra:
      overdueSum > 0
        ? `на ${Math.round(overdueSum).toLocaleString("ru-RU")} ₽`
        : undefined,
    rows: overduePayments.map((p) => {
      const target = p.order
        ? `${p.order.orderNumber} · ${p.order.productModel.name}`
        : (p.packagingItem?.name ?? "без привязки");
      const days = Math.floor(
        (now.getTime() - p.plannedDate.getTime()) / 86_400_000,
      );
      return {
        id: p.id,
        title: `${p.label} · ${Math.round(Number(p.amount)).toLocaleString("ru-RU")} ${p.currency === "CNY" ? "¥" : "₽"}`,
        subtitle: `${target} · просрочено ${days} дн`,
        href: "/payments",
      };
    }),
  });

  // 6. План месяца не задан
  const ownersWithPlan = new Set(
    monthPlans.map((p) => p.ownerId).filter(Boolean),
  );
  const usersNoPlan = productUsers.filter((u) => !ownersWithPlan.has(u.id));
  const monthLabel = String(yearMonth % 100).padStart(2, "0");
  sections.push({
    key: "plan-not-set",
    title: `План на ${monthLabel}.${Math.floor(yearMonth / 100)} не задан`,
    why: "Без плана «Цели» и «План/Факт» показывают ложные разрывы.",
    rows: usersNoPlan.map((u) => ({
      id: u.id,
      title: u.name,
      subtitle: "нет плана на текущий месяц",
      href: "/plan-vs-fact",
    })),
  });

  return sections;
}

export function countGaps(sections: GapSection[]): number {
  return sections.reduce((a, s) => a + s.rows.length, 0);
}
