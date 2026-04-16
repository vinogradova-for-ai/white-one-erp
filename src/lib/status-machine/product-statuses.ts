import { ProductStatus, Role } from "@prisma/client";

// Разрешённые переходы. Нельзя перепрыгнуть — только следующий статус по порядку.
// Откат назад разрешён только OWNER/DIRECTOR с обязательным комментарием.
export const PRODUCT_TRANSITIONS: Record<ProductStatus, ProductStatus[]> = {
  IDEA: ["SKETCH"],
  SKETCH: ["PATTERNS"],
  PATTERNS: ["SAMPLE"],
  SAMPLE: ["CORRECTIONS", "SIZE_CHART"],
  CORRECTIONS: ["SAMPLE", "SIZE_CHART"],
  SIZE_CHART: ["APPROVED"],
  APPROVED: ["READY_FOR_PRODUCTION"],
  READY_FOR_PRODUCTION: [],
};

export function canMoveProductStatus(
  from: ProductStatus,
  to: ProductStatus,
  actorRole: Role,
): { ok: boolean; reason?: string; requiresComment?: boolean } {
  if (from === to) return { ok: false, reason: "Статус не изменился" };

  // Разрешённый переход вперёд
  if (PRODUCT_TRANSITIONS[from].includes(to)) {
    return { ok: true };
  }

  // Откат — только OWNER/DIRECTOR с комментарием
  const isRollback = isProductRollback(from, to);
  if (isRollback) {
    if (actorRole === "OWNER" || actorRole === "DIRECTOR") {
      return { ok: true, requiresComment: true };
    }
    return { ok: false, reason: "Откат статуса доступен только руководителям" };
  }

  return { ok: false, reason: "Нельзя перепрыгнуть статус" };
}

function isProductRollback(from: ProductStatus, to: ProductStatus): boolean {
  const order: ProductStatus[] = [
    "IDEA",
    "SKETCH",
    "PATTERNS",
    "SAMPLE",
    "CORRECTIONS",
    "SIZE_CHART",
    "APPROVED",
    "READY_FOR_PRODUCTION",
  ];
  return order.indexOf(to) < order.indexOf(from);
}

// Какое поле даты автоматически выставляется при переходе в статус
export const PRODUCT_STATUS_DATE_FIELDS: Partial<Record<ProductStatus, string>> = {
  SKETCH: "sketchDate",
  PATTERNS: "patternsDate",
  SAMPLE: "sampleDate",
  CORRECTIONS: "correctionsDate",
  SIZE_CHART: "sizeChartDate",
  APPROVED: "approvedDate",
  READY_FOR_PRODUCTION: "readyForProdDate",
};
