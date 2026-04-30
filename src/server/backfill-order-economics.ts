import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { calculateOrderEconomics } from "@/lib/calculations/product-cost";

/**
 * Идемпотентный авто-бэкфилл: для линий заказа, у которых snapshotFullCost
 * = null, проставляет model.fullCost и пересчитывает batchCost /
 * plannedRevenue / plannedMargin.
 *
 * Используется напрямую из server-компонентов (страница заказа /orders/[id]).
 * При нормальном создании заказа snapshot ставится сразу, но исторические
 * заказы могли остаться без него.
 *
 * Возвращает количество обновлённых линий.
 */
export async function backfillOrderEconomicsFromModel(orderId: string): Promise<number> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      deletedAt: true,
      productModel: {
        select: {
          id: true, fullCost: true, wbPrice: true, customerPrice: true,
          wbCommissionPct: true, drrPct: true, plannedRedemptionPct: true,
        },
      },
      lines: {
        where: { snapshotFullCost: null },
        select: { id: true, quantity: true },
      },
    },
  });
  if (!order || order.deletedAt) return 0;
  if (order.lines.length === 0) return 0;
  if (order.productModel.fullCost == null) return 0;

  let updated = 0;
  for (const l of order.lines) {
    const eco = calculateOrderEconomics(
      { ...order.productModel, fullCost: order.productModel.fullCost },
      l.quantity,
    );
    await prisma.orderLine.update({
      where: { id: l.id },
      data: {
        snapshotFullCost: order.productModel.fullCost,
        snapshotWbPrice: order.productModel.wbPrice,
        snapshotCustomerPrice: order.productModel.customerPrice,
        snapshotWbCommissionPct: order.productModel.wbCommissionPct,
        snapshotDrrPct: order.productModel.drrPct,
        snapshotRedemptionPct: order.productModel.plannedRedemptionPct,
        batchCost: eco.batchCost != null ? new Prisma.Decimal(eco.batchCost) : null,
        plannedRevenue: eco.plannedRevenue != null ? new Prisma.Decimal(eco.plannedRevenue) : null,
        plannedMargin: eco.plannedMargin != null ? new Prisma.Decimal(eco.plannedMargin) : null,
      },
    });
    updated += 1;
  }
  return updated;
}
