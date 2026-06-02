import { OrderStatus, Role } from "@prisma/client";

// Жёсткая последовательность — нельзя перепрыгнуть.
export const ORDER_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PREPARATION: ["FABRIC_ORDERED"],
  FABRIC_ORDERED: ["SEWING"],
  SEWING: ["QC"],
  QC: ["READY_SHIP", "SEWING"], // ОТК может вернуть на пошив
  READY_SHIP: ["IN_TRANSIT"],
  IN_TRANSIT: ["WAREHOUSE_MSK"],
  WAREHOUSE_MSK: ["PACKING"],
  PACKING: ["SHIPPED_WB"],
  SHIPPED_WB: ["ON_SALE"],
  ON_SALE: [],
};

// Линейный порядок статусов — единый источник истины для «вперёд/назад».
export const ORDER_STATUS_SEQUENCE: OrderStatus[] = [
  "PREPARATION",
  "FABRIC_ORDERED",
  "SEWING",
  "QC",
  "READY_SHIP",
  "IN_TRANSIT",
  "WAREHOUSE_MSK",
  "PACKING",
  "SHIPPED_WB",
  "ON_SALE",
];

// Переход «вперёд» по ленте статусов (to строго дальше from).
// Используется авто-статусом по таймлайну, чтобы НИКОГДА не откатывать
// вручную продвинутый заказ назад.
export function isForwardOrderStatus(from: OrderStatus, to: OrderStatus): boolean {
  const fi = ORDER_STATUS_SEQUENCE.indexOf(from);
  const ti = ORDER_STATUS_SEQUENCE.indexOf(to);
  if (fi < 0 || ti < 0) return false;
  return ti > fi;
}

export function canMoveOrderStatus(
  from: OrderStatus,
  to: OrderStatus,
  actorRole: Role,
): { ok: boolean; reason?: string; requiresComment?: boolean } {
  if (from === to) return { ok: false, reason: "Статус не изменился" };

  // Защита от мусорного from (вызов из нетипизированного слоя): мягкий отказ, не краш.
  const allowed = ORDER_TRANSITIONS[from] ?? [];
  if (allowed.includes(to)) {
    return { ok: true };
  }

  if (isOrderRollback(from, to)) {
    if (actorRole === "OWNER" || actorRole === "DIRECTOR") {
      return { ok: true, requiresComment: true };
    }
    return { ok: false, reason: "Откат статуса доступен только руководителям" };
  }

  return { ok: false, reason: "Нельзя перепрыгнуть статус" };
}

function isOrderRollback(from: OrderStatus, to: OrderStatus): boolean {
  return ORDER_STATUS_SEQUENCE.indexOf(to) < ORDER_STATUS_SEQUENCE.indexOf(from);
}

// Автоматическое поле даты при переходе
export const ORDER_STATUS_DATE_FIELDS: Partial<Record<OrderStatus, string>> = {
  FABRIC_ORDERED: "decisionDate",
  SEWING: "sewingStartDate",
  QC: "readyAtFactoryDate",
  READY_SHIP: "readyAtFactoryDate",
  IN_TRANSIT: "shipmentDate",
  WAREHOUSE_MSK: "arrivalActualDate",
  PACKING: "arrivalActualDate",
  SHIPPED_WB: "wbShipmentDate",
  ON_SALE: "saleStartDate",
};
