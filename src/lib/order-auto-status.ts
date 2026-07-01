import type { OrderStatus } from "@prisma/client";

type OrderDates = {
  readyAtFactoryDate: Date | null;
  qcDate: Date | null;
  arrivalPlannedDate: Date | null;
  arrivalActualDate: Date | null;
};

/**
 * Статус заказа подтягивается из позиции «сегодня» в Ганте:
 *  arrivalActualDate ≤ today  → WAREHOUSE_MSK (товар ФАКТИЧЕСКИ на складе МСК)
 *  qcDate ≤ today             → IN_TRANSIT (ОТК пройден, едет)
 *  readyAtFactoryDate ≤ today → QC (производство закончилось, ОТК)
 *  иначе если есть хоть одна дата → SEWING (в пошиве)
 *  иначе                       → PREPARATION (даты не заданы)
 *
 * ВАЖНО (аудит п.6): «Прибыл на склад» (WAREHOUSE_MSK) выставляется ТОЛЬКО по
 * ФАКТИЧЕСКОЙ дате прибытия arrivalActualDate (или ручной сменой статуса).
 * Раньше здесь была ветка «arrivalPlannedDate < today → WAREHOUSE_MSK» — она
 * помечала «прибыл» опоздавший заказ, который на самом деле ещё едет. Убрана:
 * прошедший ПЛАН прибытия больше не двигает статус. Опоздание подсвечивается
 * отдельно (isOrderLate) — без записи в БД.
 */
export function computeOrderStatus(d: OrderDates): OrderStatus {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  if (d.arrivalActualDate && d.arrivalActualDate.getTime() <= today.getTime()) {
    return "WAREHOUSE_MSK";
  }
  if (d.qcDate && d.qcDate.getTime() <= today.getTime()) {
    return "IN_TRANSIT";
  }
  if (d.readyAtFactoryDate && d.readyAtFactoryDate.getTime() <= today.getTime()) {
    return "QC";
  }
  if (d.readyAtFactoryDate || d.qcDate || d.arrivalPlannedDate) {
    return "SEWING";
  }
  return "PREPARATION";
}

/**
 * Опаздывает ли заказ: плановая дата прибытия прошла, а факта прибытия нет.
 * Это подсветка «опаздывает N дн» на карточке/в списке/в тултипе Ганта —
 * БЕЗ смены статуса в БД (заказ ещё едет, а не «на складе»).
 *
 * Возвращает число просроченных дней (>0) или 0, если не опаздывает.
 */
export function orderLateDays(d: OrderDates, now: Date = new Date()): number {
  if (!d.arrivalPlannedDate || d.arrivalActualDate) return 0;
  const today = new Date(now);
  today.setUTCHours(0, 0, 0, 0);
  const planned = new Date(d.arrivalPlannedDate);
  planned.setUTCHours(0, 0, 0, 0);
  const diffMs = today.getTime() - planned.getTime();
  if (diffMs <= 0) return 0;
  return Math.floor(diffMs / (24 * 60 * 60 * 1000));
}
