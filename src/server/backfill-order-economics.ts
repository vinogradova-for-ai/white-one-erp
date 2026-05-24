import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { calculateOrderEconomics } from "@/lib/calculations/product-cost";

/**
 * Идемпотентный авто-бэкфилл: для линий заказа, у которых snapshotFullCost
 * = null, проставляет себестоимость из фасона и пересчитывает batchCost /
 * plannedRevenue / plannedMargin.
 *
 * Приоритет источника себестоимости фасона:
 *   1) model.fullCost
 *   2) model.purchasePriceRub
 *   3) model.purchasePriceCny × cnyRubRate
 *   4) model.targetCostRub  (legacy «Таргет»)
 *   5) model.targetCostCny × cnyRubRate
 *
 * Используется из страницы /orders/[id] и из массового скрипта-прогона.
 * Возвращает количество обновлённых линий.
 */
function resolveModelCost(m: {
  fullCost: Prisma.Decimal | null;
  purchasePriceRub: Prisma.Decimal | null;
  purchasePriceCny: Prisma.Decimal | null;
  cnyRubRate: Prisma.Decimal | null;
  targetCostRub: Prisma.Decimal | null;
  targetCostCny: Prisma.Decimal | null;
}): Prisma.Decimal | null {
  if (m.fullCost != null) return m.fullCost;
  if (m.purchasePriceRub != null) return m.purchasePriceRub;
  if (m.purchasePriceCny != null && m.cnyRubRate != null) {
    return new Prisma.Decimal(Number(m.purchasePriceCny) * Number(m.cnyRubRate));
  }
  if (m.targetCostRub != null) return m.targetCostRub;
  if (m.targetCostCny != null && m.cnyRubRate != null) {
    return new Prisma.Decimal(Number(m.targetCostCny) * Number(m.cnyRubRate));
  }
  return null;
}

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

  const effectiveFullCost = resolveModelCost(order.productModel);
  if (effectiveFullCost == null) return 0;

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
        plannedMargin: eco.plannedMargin != null ? new Prisma.Decimal(eco.plannedMargin) : null,
      },
    });
    updated += 1;
  }
  return updated;
}
