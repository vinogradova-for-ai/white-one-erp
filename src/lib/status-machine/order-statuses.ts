import { OrderStatus, Role } from "@prisma/client";

// Жёсткая последовательность — нельзя перепрыгнуть.
// FABRIC_ORDERED («Ткань заказана») из UI больше не предлагается как отдельный
// шаг (аудит п.5): по факту его никто вручную не проставлял, заказы шли сразу в
// пошив. Из enum статус НЕ убираем (его читают склад и детектор «застряло»), но
// из PREPARATION даём прямой переход в SEWING в обход FABRIC_ORDERED. Сам
// FABRIC_ORDERED остаётся валидной точкой цепи для легаси-данных.
// READY_SHIP («Готов к отгрузке») выпилен так же (Алёна 04.07: «у нас нет
// отдельного статуса, только ОТК»): из QC теперь сразу IN_TRANSIT, данные
// смигрированы READY_SHIP→QC; из enum не убираем — история логов.
export const ORDER_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PREPARATION: ["SEWING", "FABRIC_ORDERED"],
  FABRIC_ORDERED: ["SEWING"],
  SEWING: ["QC"],
  QC: ["IN_TRANSIT", "SEWING"], // ОТК пройден → в Доставку; может вернуть на пошив
  READY_SHIP: ["IN_TRANSIT"], // легаси-точка, недостижима из живых переходов
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

// Автоматическое поле даты при переходе.
// QC = производство закончилось, ОТК начался → readyAtFactoryDate.
// READY_SHIP = ОТК пройден, готов к отгрузке → qcDate (конец ОТК / старт Доставки
// в фазах Ганта). Раньше здесь тоже стоял readyAtFactoryDate — он повторно
// перезаписывался, а qcDate оставался null, из-за чего Гант рисовал ОТК/Доставку
// криво. Дашборд («ОТК принят») уже пишет qcDate — теперь совпадает.
export const ORDER_STATUS_DATE_FIELDS: Partial<Record<OrderStatus, string>> = {
  FABRIC_ORDERED: "decisionDate",
  SEWING: "sewingStartDate",
  QC: "readyAtFactoryDate",
  READY_SHIP: "qcDate",
  IN_TRANSIT: "shipmentDate",
  WAREHOUSE_MSK: "arrivalActualDate",
  PACKING: "arrivalActualDate",
  SHIPPED_WB: "wbShipmentDate",
  ON_SALE: "saleStartDate",
};
