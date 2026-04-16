import { ProductModelStatus, ProductVariantStatus, Role } from "@prisma/client";

// Упрощённая машина (5 статусов вместо 8).
// Корректировки и размерная сетка — флаги (correctionsNeeded, sizeChartReady), не статусы.
export const MODEL_TRANSITIONS: Record<ProductModelStatus, ProductModelStatus[]> = {
  IDEA: ["PATTERNS"],
  PATTERNS: ["SAMPLE"],
  SAMPLE: ["APPROVED"],
  APPROVED: ["IN_PRODUCTION"],
  IN_PRODUCTION: [],
};

export function canMoveModelStatus(
  from: ProductModelStatus,
  to: ProductModelStatus,
  actorRole: Role,
): { ok: boolean; reason?: string; requiresComment?: boolean } {
  if (from === to) return { ok: false, reason: "Статус не изменился" };

  if (MODEL_TRANSITIONS[from].includes(to)) {
    return { ok: true };
  }

  const order: ProductModelStatus[] = [
    "IDEA",
    "PATTERNS",
    "SAMPLE",
    "APPROVED",
    "IN_PRODUCTION",
  ];
  const isRollback = order.indexOf(to) < order.indexOf(from);

  if (isRollback) {
    if (actorRole === "OWNER" || actorRole === "DIRECTOR") {
      return { ok: true, requiresComment: true };
    }
    return { ok: false, reason: "Откат статуса доступен только руководителям" };
  }

  return { ok: false, reason: "Нельзя перепрыгнуть статус" };
}

export const MODEL_STATUS_DATE_FIELDS: Partial<Record<ProductModelStatus, string>> = {
  PATTERNS: "patternsDate",
  SAMPLE: "sampleDate",
  APPROVED: "approvedDate",
  IN_PRODUCTION: "productionStartDate",
};

// Variant статусы — мягкая машина, любой переход кроме DISCONTINUED→DRAFT для не-админов
export const VARIANT_TRANSITIONS: Record<ProductVariantStatus, ProductVariantStatus[]> = {
  DRAFT: ["READY_TO_ORDER", "DISCONTINUED"],
  READY_TO_ORDER: ["DISCONTINUED", "DRAFT"],
  DISCONTINUED: ["DRAFT"],
};

export function canMoveVariantStatus(
  from: ProductVariantStatus,
  to: ProductVariantStatus,
): { ok: boolean; reason?: string } {
  if (from === to) return { ok: false, reason: "Статус не изменился" };
  if (VARIANT_TRANSITIONS[from].includes(to)) return { ok: true };
  return { ok: false, reason: "Недопустимый переход" };
}
