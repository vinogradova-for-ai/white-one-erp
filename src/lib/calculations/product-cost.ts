import { Prisma } from "@prisma/client";
import { resolveModelCost } from "./resolve-model-cost";

/**
 * Расчёт экономики заказа.
 *
 * Маржа, ДРР, комиссия WB, ROI, наценка — НЕ считаются в этом сервисе.
 * Это инструмент отдела «Продукт», финансовая аналитика — в других местах.
 *
 * Считаем только:
 *   - batchCost      = себестоимость × количество
 *   - plannedRevenue = customerPrice × plannedRedemption × количество (для План/Факт)
 *
 * Себестоимость берём через единый resolveModelCost.
 */

export type OrderEconomicsModel = {
  fullCost?: Prisma.Decimal | number | string | null;
  purchasePriceRub?: Prisma.Decimal | number | string | null;
  purchasePriceCny?: Prisma.Decimal | number | string | null;
  cnyRubRate?: Prisma.Decimal | number | string | null;
  targetCostRub?: Prisma.Decimal | number | string | null;
  targetCostCny?: Prisma.Decimal | number | string | null;
  customerPrice?: Prisma.Decimal | number | string | null;
  plannedRedemptionPct?: Prisma.Decimal | number | string | null;
};

function toNum(v: Prisma.Decimal | number | string | null | undefined): number | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const n = Number(v.toString());
  return Number.isFinite(n) ? n : null;
}

function round(n: number, digits = 2): number {
  const f = Math.pow(10, digits);
  return Math.round(n * f) / f;
}

export function calculateOrderEconomics(
  model: OrderEconomicsModel,
  quantity: number,
  // Эффективная цена единицы для ЭТОГО заказа (override из формы или
  // resolveModelCost). Если передана — batchCost считаем строго от неё, а не
  // через resolveModelCost (который ставит purchasePriceRub выше override).
  unitCost?: number | null,
): {
  batchCost: number | null;
  plannedRevenue: number | null;
} {
  const fullCost = unitCost != null && Number.isFinite(unitCost) ? unitCost : resolveModelCost(model);
  const customerPrice = toNum(model.customerPrice);
  const redemption = (toNum(model.plannedRedemptionPct) ?? 0) / 100;

  const batchCost = fullCost !== null ? round(fullCost * quantity, 2) : null;
  const plannedRevenue = customerPrice !== null && redemption > 0
    ? round(customerPrice * redemption * quantity, 2)
    : null;

  return { batchCost, plannedRevenue };
}

/**
 * Экономика линии заказа ИЗ ЕЁ СНИМКА цен (snapshot*), а не из живого фасона.
 * Снимок — это «что мы зафиксировали в момент заказа»; при изменении кол-ва
 * batchCost/plannedRevenue должны масштабироваться от снимка, иначе сумма
 * заказа поедет за текущей ценой фасона (рассинхрон snapshot ↔ batchCost).
 */
export type OrderLineSnapshot = {
  snapshotFullCost?: Prisma.Decimal | number | string | null;
  snapshotCustomerPrice?: Prisma.Decimal | number | string | null;
  snapshotRedemptionPct?: Prisma.Decimal | number | string | null;
};

export function lineEconomicsFromSnapshot(
  line: OrderLineSnapshot,
  quantity: number,
): { batchCost: number | null; plannedRevenue: number | null } {
  const unit = toNum(line.snapshotFullCost);
  const customerPrice = toNum(line.snapshotCustomerPrice);
  const redemption = (toNum(line.snapshotRedemptionPct) ?? 0) / 100;

  const batchCost = unit !== null ? round(unit * quantity, 2) : null;
  const plannedRevenue = customerPrice !== null && redemption > 0
    ? round(customerPrice * redemption * quantity, 2)
    : null;

  return { batchCost, plannedRevenue };
}
