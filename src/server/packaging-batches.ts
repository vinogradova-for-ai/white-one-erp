import type { Prisma } from "@prisma/client";
import { proportionalTake } from "@/lib/batches/batch-logic";

/**
 * Ленивое получение/создание партии заказа УПАКОВКИ для добавления в карго —
 * зеркало ensureBatchForShipment у одежды (Алёна 17.07: упаковка едет частями
 * разными карго).
 *
 * Обычный случай: партий нет → создаём ОДНУ (index 1) со всеми позициями
 * заказа. «Добавить упаковку в карго» просто работает, без лишней возни.
 * Если партии уже есть — возвращаем первую БЕЗ карго; все заняты → null.
 */
export async function ensurePackagingBatchForShipment(
  tx: Prisma.TransactionClient,
  packagingOrderId: string,
): Promise<{ batchId: string } | null> {
  const existing = await tx.packagingOrderBatch.findMany({
    where: { packagingOrderId },
    orderBy: { index: "asc" },
    select: { id: true, shipmentId: true },
  });

  if (existing.length > 0) {
    const free = existing.find((b) => b.shipmentId == null);
    return free ? { batchId: free.id } : null;
  }

  const order = await tx.packagingOrder.findUnique({
    where: { id: packagingOrderId },
    select: { lines: { select: { packagingItemId: true, quantity: true } } },
  });
  if (!order) return null;

  const batch = await tx.packagingOrderBatch.create({
    data: {
      packagingOrderId,
      index: 1,
      items: {
        create: order.lines.map((l) => ({
          packagingItemId: l.packagingItemId,
          plannedQty: l.quantity,
        })),
      },
    },
    select: { id: true },
  });
  return { batchId: batch.id };
}

/**
 * Прикрепить заказ упаковки к карго с «сколько едет?» — зеркало
 * attachOrderToShipmentQty у одежды (прожарка 17.07, вариант Б).
 */
export async function attachPackagingOrderToShipmentQty(
  tx: Prisma.TransactionClient,
  packagingOrderId: string,
  shipmentId: string,
  qty: number | null,
): Promise<{ batchId: string; movedQty: number; leftQty: number } | null> {
  const ensured = await ensurePackagingBatchForShipment(tx, packagingOrderId);
  if (!ensured) return null;

  const batch = await tx.packagingOrderBatch.findUnique({
    where: { id: ensured.batchId },
    include: { items: true },
  });
  if (!batch) return null;
  const total = batch.items.reduce((a, i) => a + i.plannedQty, 0);

  if (qty == null || qty >= total || total <= 0) {
    await tx.packagingOrderBatch.update({ where: { id: batch.id }, data: { shipmentId } });
    return { batchId: batch.id, movedQty: total, leftQty: 0 };
  }

  const move = proportionalTake(
    batch.items.map((i) => ({ id: i.id, plannedQty: i.plannedQty })),
    qty,
  );

  for (const i of batch.items) {
    const keep = i.plannedQty - (move[i.id] ?? 0);
    if (keep <= 0) await tx.packagingOrderBatchItem.delete({ where: { id: i.id } });
    else if (keep !== i.plannedQty)
      await tx.packagingOrderBatchItem.update({ where: { id: i.id }, data: { plannedQty: keep } });
  }

  const agg = await tx.packagingOrderBatch.aggregate({
    where: { packagingOrderId },
    _max: { index: true },
  });
  const created = await tx.packagingOrderBatch.create({
    data: {
      packagingOrderId,
      index: (agg._max.index ?? 0) + 1,
      shipmentId,
      items: {
        create: batch.items
          .filter((i) => (move[i.id] ?? 0) > 0)
          .map((i) => ({ packagingItemId: i.packagingItemId, plannedQty: move[i.id] })),
      },
    },
    select: { id: true },
  });
  return { batchId: created.id, movedQty: qty, leftQty: total - qty };
}
