import { Prisma } from "@prisma/client";

export type VariantEconomicsInput = {
  purchasePriceCny?: Prisma.Decimal | number | string | null;
  purchasePriceRub?: Prisma.Decimal | number | string | null;
  cnyRubRate?: Prisma.Decimal | number | string | null;
  packagingCost?: Prisma.Decimal | number | string | null;
  wbLogisticsCost?: Prisma.Decimal | number | string | null;
  wbCommissionPct?: Prisma.Decimal | number | string | null;
  drrPct?: Prisma.Decimal | number | string | null;
  wbPrice?: Prisma.Decimal | number | string | null;
  customerPrice?: Prisma.Decimal | number | string | null;
  plannedRedemptionPct?: Prisma.Decimal | number | string | null;
};

export type VariantEconomicsOutput = {
  fullCost: number | null;
  marginBeforeDrr: number | null;
  marginAfterDrrPct: number | null;
  roi: number | null;
  markupPct: number | null;
};

const COST_BUFFER = Number(process.env.COST_BUFFER_PCT ?? "5") / 100;

function toNum(v: Prisma.Decimal | number | string | null | undefined): number | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const n = Number(v.toString());
  return Number.isFinite(n) ? n : null;
}

/**
 * Экономика цветового варианта.
 *
 * Формула полной себестоимости:
 *   Если CNY задано: fullCost = CNY × rate × (1 + buffer) + packaging + wbLogistics
 *   Иначе RUB:       fullCost = RUB + packaging + wbLogistics
 *
 * Маржа до ДРР (на единицу): customerPrice × redemption − fullCost − wbPrice × commission
 * Маржа после ДРР %:        (маржа до ДРР − выручка × ДРР) / выручка
 * ROI:                       маржа после ДРР / fullCost × 100
 * Наценка %:                 (wbPrice − fullCost) / fullCost × 100
 */
export function calculateVariantEconomics(input: VariantEconomicsInput): VariantEconomicsOutput {
  const cny = toNum(input.purchasePriceCny);
  const rub = toNum(input.purchasePriceRub);
  const rate = toNum(input.cnyRubRate) ?? Number(process.env.CNY_RUB_RATE_DEFAULT ?? "13.5");
  const packaging = toNum(input.packagingCost) ?? 0;
  const logistics = toNum(input.wbLogisticsCost) ?? 0;
  const commission = (toNum(input.wbCommissionPct) ?? 0) / 100;
  const drr = (toNum(input.drrPct) ?? 0) / 100;
  const wbPrice = toNum(input.wbPrice);
  const customerPrice = toNum(input.customerPrice);
  const redemption = (toNum(input.plannedRedemptionPct) ?? 0) / 100;

  let purchase: number | null = null;
  if (cny !== null) {
    purchase = cny * rate * (1 + COST_BUFFER);
  } else if (rub !== null) {
    purchase = rub;
  }

  const fullCost = purchase !== null ? round(purchase + packaging + logistics, 2) : null;

  let marginBeforeDrr: number | null = null;
  let marginAfterDrrPct: number | null = null;
  let roi: number | null = null;
  let markupPct: number | null = null;

  if (fullCost !== null && customerPrice !== null && redemption > 0) {
    const revenuePerUnit = customerPrice * redemption;
    const wbCommission = (wbPrice ?? 0) * commission;
    marginBeforeDrr = round(revenuePerUnit - fullCost - wbCommission, 2);
    const marginAfterDrr = marginBeforeDrr - revenuePerUnit * drr;
    marginAfterDrrPct = revenuePerUnit > 0 ? round((marginAfterDrr / revenuePerUnit) * 100, 2) : null;
    roi = fullCost > 0 ? round((marginAfterDrr / fullCost) * 100, 2) : null;
  }

  if (fullCost !== null && wbPrice !== null && fullCost > 0) {
    markupPct = round(((wbPrice - fullCost) / fullCost) * 100, 2);
  }

  return { fullCost, marginBeforeDrr, marginAfterDrrPct, roi, markupPct };
}

export function calculateOrderEconomics(
  variant: VariantEconomicsInput & { fullCost?: Prisma.Decimal | number | string | null },
  quantity: number,
): {
  batchCost: number | null;
  plannedRevenue: number | null;
  plannedMargin: number | null;
} {
  const fullCost = toNum(variant.fullCost) ?? calculateVariantEconomics(variant).fullCost;
  const customerPrice = toNum(variant.customerPrice);
  const redemption = (toNum(variant.plannedRedemptionPct) ?? 0) / 100;

  const batchCost = fullCost !== null ? round(fullCost * quantity, 2) : null;
  const plannedRevenue = customerPrice !== null ? round(customerPrice * redemption * quantity, 2) : null;

  let plannedMargin: number | null = null;
  if (fullCost !== null && customerPrice !== null && redemption > 0) {
    const revenuePerUnit = customerPrice * redemption;
    plannedMargin = round((revenuePerUnit - fullCost) * quantity, 2);
  }

  return { batchCost, plannedRevenue, plannedMargin };
}

function round(n: number, digits = 2): number {
  const f = Math.pow(10, digits);
  return Math.round(n * f) / f;
}
