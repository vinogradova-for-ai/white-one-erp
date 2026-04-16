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

export function canMoveOrderStatus(
  from: OrderStatus,
  to: OrderStatus,
  actorRole: Role,
): { ok: boolean; reason?: string; requiresComment?: boolean } {
  if (from === to) return { ok: false, reason: "Статус не изменился" };

  if (ORDER_TRANSITIONS[from].includes(to)) {
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
  const order: OrderStatus[] = [
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
  return order.indexOf(to) < order.indexOf(from);
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
