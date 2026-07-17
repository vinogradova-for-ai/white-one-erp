import type { Prisma } from "@prisma/client";

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
