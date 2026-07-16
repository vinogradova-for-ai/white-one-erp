import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { changeOrderStatus } from "@/server/change-order-status";
import {
  buildFullBatchItems,
  allBatchesReceived,
  allBatchesShippedOrReceived,
  aggregateReceipt,
  type OrderLineForBatch,
} from "@/lib/batches/batch-logic";
import { statusAtLeast } from "@/lib/queries/team-month-stats";

/**
 * Ленивое получение/создание партии заказа для добавления в поставку.
 *
 * Обычный случай (простой заказ): партий ещё нет → создаём ОДНУ партию (index 1)
 * со всеми позициями из линий заказа, развёрнутыми по размерам. Никакой лишней
 * возни для оператора — «добавить заказ в поставку» просто работает.
 *
 * Если у заказа уже есть партии — возвращаем первую БЕЗ поставки (её и кладём).
 * Если все партии уже разложены по поставкам — вернём null (нечего добавлять).
 */
export async function ensureBatchForShipment(
  tx: Prisma.TransactionClient,
  orderId: string,
): Promise<{ batchId: string } | null> {
  const existing = await tx.orderBatch.findMany({
    where: { orderId },
    orderBy: { index: "asc" },
    select: { id: true, shipmentId: true },
  });

  if (existing.length > 0) {
    const free = existing.find((b) => b.shipmentId == null);
    return free ? { batchId: free.id } : null;
  }

  // Партий нет — создаём одну со всеми позициями заказа.
  const order = await tx.order.findUnique({
    where: { id: orderId },
    select: {
      lines: {
        select: {
          productVariantId: true,
          quantity: true,
          sizeDistribution: true,
          productVariant: { select: { colorName: true } },
        },
      },
    },
  });
  if (!order) return null;

  const linesForBatch: OrderLineForBatch[] = order.lines.map((l) => ({
    productVariantId: l.productVariantId,
    colorName: l.productVariant.colorName,
    quantity: l.quantity,
    sizeDistribution: (l.sizeDistribution as Record<string, number> | null) ?? null,
  }));
  const items = buildFullBatchItems(linesForBatch);

  const batch = await tx.orderBatch.create({
    data: {
      orderId,
      index: 1,
      items: {
        create: items.map((it) => ({
          variantId: it.variantId,
          colorName: it.colorName,
          size: it.size,
          plannedQty: it.plannedQty,
        })),
      },
    },
    select: { id: true },
  });
  return { batchId: batch.id };
}

/**
 * Синхронизация статусов заказов при ВЫЕЗДЕ поставки (переход в IN_TRANSIT).
 * Для каждого заказа, чьи партии затронуты, если ВСЕ его партии уехали/приняты и
 * статус заказа раньше IN_TRANSIT по циклу — двигаем заказ в IN_TRANSIT через
 * единый changeOrderStatus (не мимо). Вызывать ПОСЛЕ коммита поставки.
 */
export async function syncOrdersOnShipmentDepart(params: {
  shipmentId: string;
  actorId: string;
  actorRole: import("@prisma/client").Role;
}): Promise<void> {
  const { shipmentId, actorId, actorRole } = params;
  const batches = await prisma.orderBatch.findMany({
    where: { shipmentId },
    select: { orderId: true },
  });
  const orderIds = [...new Set(batches.map((b) => b.orderId))];

  for (const orderId of orderIds) {
    const order = await prisma.order.findFirst({
      where: { id: orderId, deletedAt: null },
      select: {
        status: true,
        batches: {
          select: { receivedAt: true, shipment: { select: { departDate: true } } },
        },
      },
    });
    if (!order) continue;
    const flags = order.batches.map((b) => ({
      receivedAt: b.receivedAt,
      shipmentDeparted: b.shipment?.departDate != null,
    }));
    if (!allBatchesShippedOrReceived(flags)) continue;
    // Только вперёд по циклу: не трогаем заказ, уже дальше IN_TRANSIT.
    if (statusAtLeast(order.status, "IN_TRANSIT")) continue;
    await changeOrderStatus({
      orderId,
      toStatus: "IN_TRANSIT",
      actorId,
      actorRole,
      logComment: "Автостатус: партии выехали в поставке",
    });
  }
}

/**
 * Синхронизация статуса заказа при ЗАВЕРШЕНИИ приёмки партии.
 * Если у заказа приняты ВСЕ партии — двигаем заказ в WAREHOUSE_MSK через
 * changeOrderStatus, проставляя arrivalActualDate = дата приёмки последней
 * партии и quantityActual линий не трогаем здесь (факт по линиям — отдельная
 * механика ОТК). Если приняты не все — оставляем как есть (карточка покажет
 * «партия 1/2»). Вызывать ПОСЛЕ коммита приёмки партии.
 */
export async function syncOrderOnBatchReceived(params: {
  orderId: string;
  actorId: string;
  actorRole: import("@prisma/client").Role;
}): Promise<void> {
  const { orderId, actorId, actorRole } = params;
  const order = await prisma.order.findFirst({
    where: { id: orderId, deletedAt: null },
    select: {
      status: true,
      batches: { select: { receivedAt: true } },
    },
  });
  if (!order) return;
  if (!allBatchesReceived(order.batches)) return;
  if (statusAtLeast(order.status, "WAREHOUSE_MSK")) return;

  // Дата приёмки последней партии = максимальный receivedAt.
  const lastReceived = order.batches
    .map((b) => b.receivedAt)
    .filter((d): d is Date => d != null)
    .sort((a, b) => b.getTime() - a.getTime())[0];

  await changeOrderStatus({
    orderId,
    toStatus: "WAREHOUSE_MSK",
    actorId,
    actorRole,
    logComment: "Автостатус: приняты все партии заказа",
    extraData: { arrivalActualDate: lastReceived ?? new Date() },
  });
}

/** Сумма факта приёмки заказа по всем его партиям (для quantityActual). */
export async function sumOrderFactQty(orderId: string): Promise<number> {
  const batches = await prisma.orderBatch.findMany({
    where: { orderId },
    select: { items: { select: { plannedQty: true, factQty: true, defectQty: true } } },
  });
  const all = batches.flatMap((b) => b.items);
  return aggregateReceipt(all).received;
}
