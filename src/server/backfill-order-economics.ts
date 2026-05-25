import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { calculateOrderEconomics } from "@/lib/calculations/product-cost";
import { resolveModelCost } from "@/lib/calculations/resolve-model-cost";

/**
 * Идемпотентный авто-бэкфилл: для линий заказа, у которых snapshotFullCost
 * = null, проставляет себестоимость из фасона и пересчитывает batchCost /
 * plannedRevenue.
 *
 * Источник себестоимости — единый helper resolveModelCost (тот же приоритет,
 * что в форме заказа и на странице /orders/[id]).
 *
 * Маржу не считаем — Алёна явно убрала это из скоупа сервиса.
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
          purchasePriceRub: true, purchasePriceCny: true, cnyRubRate: true,
          targetCostRub: true, targetCostCny: true,
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

  const costNumber = resolveModelCost(order.productModel);
  if (costNumber == null) return 0;
  const effectiveFullCost = new Prisma.Decimal(costNumber);

  let updated = 0;
  for (const l of order.lines) {
    const eco = calculateOrderEconomics(
      { ...order.productModel, fullCost: effectiveFullCost },
      l.quantity,
    );
    await prisma.orderLine.update({
      where: { id: l.id },
      data: {
        snapshotFullCost: effectiveFullCost,
        snapshotWbPrice: order.productModel.wbPrice,
        snapshotCustomerPrice: order.productModel.customerPrice,
        snapshotWbCommissionPct: order.productModel.wbCommissionPct,
        snapshotDrrPct: order.productModel.drrPct,
        snapshotRedemptionPct: order.productModel.plannedRedemptionPct,
        batchCost: eco.batchCost != null ? new Prisma.Decimal(eco.batchCost) : null,
        plannedRevenue: eco.plannedRevenue != null ? new Prisma.Decimal(eco.plannedRevenue) : null,
      },
    });
    updated += 1;
  }
  return updated;
}
