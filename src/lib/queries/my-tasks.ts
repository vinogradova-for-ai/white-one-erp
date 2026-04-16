import { prisma } from "@/lib/prisma";
import { ProductModelStatus, OrderStatus, SampleStatus, Role } from "@prisma/client";
import {
  PRODUCT_MODEL_STATUS_LABELS,
  ORDER_STATUS_LABELS,
  SAMPLE_STATUS_LABELS,
} from "@/lib/constants";

export type MyTask = {
  id: string;
  type: "model" | "order" | "sample";
  title: string;
  subtitle: string;
  statusLabel: string;
  deadline: Date | null;
  urgencyDays: number | null;
  url: string;
  isDelayed: boolean;
  photoUrl?: string | null;
};

const NEXT_MODEL_DEADLINE: Record<ProductModelStatus, string | null> = {
  IDEA: "patternsDate",
  PATTERNS: "sampleDate",
  SAMPLE: "approvedDate",
  APPROVED: "productionStartDate",
  IN_PRODUCTION: null,
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

const NEXT_SAMPLE_DEADLINE: Record<SampleStatus, string | null> = {
  REQUESTED: "sewingStartDate",
  IN_SEWING: "deliveredDate",
  DELIVERED: "approvedDate",
  APPROVED: "readyForShootDate",
  READY_FOR_SHOOT: "returnedDate",
  RETURNED: null,
};

export async function getMyTasks(userId: string, role: Role): Promise<MyTask[]> {
  const isAdmin = role === "OWNER" || role === "DIRECTOR";

  // Фасоны
  const models = await prisma.productModel.findMany({
    where: {
      deletedAt: null,
      status: { not: "IN_PRODUCTION" },
      ...(isAdmin ? {} : { ownerId: userId }),
    },
    take: 200,
  });

  // Заказы
  const orderWhere: Record<string, unknown> = {
    deletedAt: null,
    status: { not: "ON_SALE" },
  };
  if (!isAdmin) {
    const orConditions: Record<string, unknown>[] = [{ ownerId: userId }];
    if (role === "LOGISTICS") orConditions.push({ status: { in: ["IN_TRANSIT", "WAREHOUSE_MSK"] } });
    else if (role === "ASSISTANT") orConditions.push({ status: "PACKING" });
    else if (role === "CUSTOMS") orConditions.push({ status: "READY_SHIP" });
    else if (role === "CONTENT_MANAGER") orConditions.push({ status: "SHIPPED_WB", wbCardReady: false });
    orderWhere.OR = orConditions;
  }
  const orders = await prisma.order.findMany({
    where: orderWhere,
    include: {
      productVariant: {
        select: { sku: true, colorName: true, photoUrls: true, productModel: { select: { name: true } } },
      },
    },
    take: 200,
  });

  // Образцы (только для PM и админов + для контент-отдела когда готов к съёмке)
  const sampleWhere: Record<string, unknown> = {
    ...(role === "CONTENT_MANAGER" ? { status: "READY_FOR_SHOOT" } : {}),
  };
  const samples = role === "CONTENT_MANAGER" || role === "PRODUCT_MANAGER" || isAdmin
    ? await prisma.sample.findMany({
        where: sampleWhere,
        include: {
          productModel: { select: { name: true, ownerId: true, photoUrls: true } },
          productVariant: { select: { sku: true, colorName: true, photoUrls: true } },
        },
        take: 100,
      })
    : [];

  const now = Date.now();
  const tasks: MyTask[] = [];

  for (const m of models) {
    const field = NEXT_MODEL_DEADLINE[m.status];
    const deadline = field ? (m as unknown as Record<string, Date | null>)[field] : null;
    const urgencyDays = deadline ? Math.ceil((deadline.getTime() - now) / 86_400_000) : null;
    tasks.push({
      id: m.id,
      type: "model",
      title: m.name,
      subtitle: m.category,
      statusLabel: PRODUCT_MODEL_STATUS_LABELS[m.status],
      deadline: deadline ?? null,
      urgencyDays,
      url: `/models/${m.id}`,
      isDelayed: urgencyDays !== null && urgencyDays < 0,
      photoUrl: m.photoUrls[0],
    });
  }

  for (const o of orders) {
    if (!isAdmin && o.ownerId !== userId) {
      const allowedByRole =
        (role === "LOGISTICS" && ["IN_TRANSIT", "WAREHOUSE_MSK"].includes(o.status)) ||
        (role === "ASSISTANT" && o.status === "PACKING") ||
        (role === "CUSTOMS" && o.status === "READY_SHIP") ||
        (role === "CONTENT_MANAGER" && o.status === "SHIPPED_WB" && !o.wbCardReady);
      if (!allowedByRole) continue;
    }
    const field = NEXT_ORDER_DEADLINE[o.status];
    const deadline = field ? (o as unknown as Record<string, Date | null>)[field] : null;
    const urgencyDays = deadline ? Math.ceil((deadline.getTime() - now) / 86_400_000) : null;
    tasks.push({
      id: o.id,
      type: "order",
      title: `${o.productVariant.productModel.name} · ${o.productVariant.colorName}`,
      subtitle: `${o.orderNumber} · ${o.quantity} шт`,
      statusLabel: ORDER_STATUS_LABELS[o.status],
      deadline: deadline ?? null,
      urgencyDays,
      url: `/orders/${o.id}`,
      isDelayed: o.isDelayed || (urgencyDays !== null && urgencyDays < 0),
      photoUrl: o.productVariant.photoUrls[0],
    });
  }

  for (const s of samples) {
    const field = NEXT_SAMPLE_DEADLINE[s.status];
    const deadline = field ? (s as unknown as Record<string, Date | null>)[field] : null;
    const urgencyDays = deadline ? Math.ceil((deadline.getTime() - now) / 86_400_000) : null;
    tasks.push({
      id: s.id,
      type: "sample",
      title: `Образец: ${s.productModel.name}${s.productVariant ? " · " + s.productVariant.colorName : ""}`,
      subtitle: s.productVariant?.sku ?? s.productModel.name,
      statusLabel: SAMPLE_STATUS_LABELS[s.status],
      deadline: deadline ?? null,
      urgencyDays,
      url: `/samples/${s.id}`,
      isDelayed: urgencyDays !== null && urgencyDays < 0,
      photoUrl: s.productVariant?.photoUrls[0] ?? s.productModel.photoUrls[0],
    });
  }

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
