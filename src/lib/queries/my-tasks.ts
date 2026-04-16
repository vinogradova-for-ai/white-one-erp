import { prisma } from "@/lib/prisma";
import { ProductStatus, OrderStatus, Role } from "@prisma/client";
import { PRODUCT_STATUS_LABELS, ORDER_STATUS_LABELS } from "@/lib/constants";

export type MyTask = {
  id: string;
  type: "product" | "order";
  title: string;
  subtitle: string;
  status: string;
  statusLabel: string;
  deadline: Date | null;
  urgencyDays: number | null;
  url: string;
  isDelayed: boolean;
};

// Для какого статуса продукта какой следующий дедлайн (дата следующего этапа)
const NEXT_PRODUCT_DEADLINE: Record<ProductStatus, string | null> = {
  IDEA: "sketchDate",
  SKETCH: "patternsDate",
  PATTERNS: "sampleDate",
  SAMPLE: "correctionsDate",
  CORRECTIONS: "sizeChartDate",
  SIZE_CHART: "approvedDate",
  APPROVED: "readyForProdDate",
  READY_FOR_PRODUCTION: null,
};

const NEXT_ORDER_DEADLINE: Record<OrderStatus, string | null> = {
  PREPARATION: "decisionDate",
  FABRIC_ORDERED: "sewingStartDate",
  SEWING: "readyAtFactoryDate",
  QC: "readyAtFactoryDate",
  READY_SHIP: "shipmentDate",
  IN_TRANSIT: "arrivalPlannedDate",
  WAREHOUSE_MSK: "packingDoneDate",
  PACKING: "wbShipmentDate",
  SHIPPED_WB: "saleStartDate",
  ON_SALE: null,
};

export async function getMyTasks(userId: string, role: Role): Promise<MyTask[]> {
  const isAdmin = role === "OWNER" || role === "DIRECTOR";

  // === Products ===
  const products = await prisma.product.findMany({
    where: {
      deletedAt: null,
      status: { not: "READY_FOR_PRODUCTION" },
      ...(isAdmin ? {} : { ownerId: userId }),
    },
    take: 200,
  });

  // === Orders ===
  const orderWhere: Record<string, unknown> = {
    deletedAt: null,
    status: { not: "ON_SALE" },
  };

  if (!isAdmin) {
    // Для каждой роли — дополнительные «наблюдаемые» заказы
    const orConditions: Record<string, unknown>[] = [{ ownerId: userId }];
    if (role === "LOGISTICS") {
      orConditions.push({ status: { in: ["IN_TRANSIT", "WAREHOUSE_MSK"] } });
    } else if (role === "ASSISTANT") {
      orConditions.push({ status: "PACKING" });
    } else if (role === "CUSTOMS") {
      orConditions.push({ status: "READY_SHIP" });
    } else if (role === "CONTENT_MANAGER") {
      orConditions.push({ status: "SHIPPED_WB", wbCardReady: false });
    } else if (role === "WB_MANAGER") {
      orConditions.push({ status: "SHIPPED_WB" });
    }
    orderWhere.OR = orConditions;
  }

  const orders = await prisma.order.findMany({
    where: orderWhere,
    include: { product: { select: { sku: true, name: true } } },
    take: 200,
  });

  const now = Date.now();
  const tasks: MyTask[] = [];

  for (const p of products) {
    const field = NEXT_PRODUCT_DEADLINE[p.status];
    const deadline = field ? (p as unknown as Record<string, Date | null>)[field] : null;
    const urgencyDays = deadline ? Math.ceil((deadline.getTime() - now) / 86_400_000) : null;
    tasks.push({
      id: p.id,
      type: "product",
      title: p.name,
      subtitle: p.sku,
      status: p.status,
      statusLabel: PRODUCT_STATUS_LABELS[p.status],
      deadline: deadline ?? null,
      urgencyDays,
      url: `/products/${p.id}`,
      isDelayed: urgencyDays !== null && urgencyDays < 0,
    });
  }

  for (const o of orders) {
    const field = NEXT_ORDER_DEADLINE[o.status];
    const deadline = field ? (o as unknown as Record<string, Date | null>)[field] : null;
    const urgencyDays = deadline ? Math.ceil((deadline.getTime() - now) / 86_400_000) : null;
    tasks.push({
      id: o.id,
      type: "order",
      title: `${o.product.name} · ${o.orderNumber}`,
      subtitle: `${o.quantity} шт · ${o.product.sku}`,
      status: o.status,
      statusLabel: ORDER_STATUS_LABELS[o.status],
      deadline: deadline ?? null,
      urgencyDays,
      url: `/orders/${o.id}`,
      isDelayed: o.isDelayed || (urgencyDays !== null && urgencyDays < 0),
    });
  }

  // Сортировка: просроченные сверху, потом по возрастанию деdline, null в конце
  tasks.sort((a, b) => {
    if (a.isDelayed && !b.isDelayed) return -1;
    if (!a.isDelayed && b.isDelayed) return 1;
    if (a.deadline && b.deadline) return a.deadline.getTime() - b.deadline.getTime();
    if (a.deadline) return -1;
    if (b.deadline) return 1;
    return 0;
  });

  return tasks;
}
