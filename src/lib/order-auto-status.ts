import type { OrderStatus } from "@prisma/client";

type OrderDates = {
  readyAtFactoryDate: Date | null;
  qcDate: Date | null;
  arrivalPlannedDate: Date | null;
  arrivalActualDate: Date | null;
};

/**
 * Статус заказа подтягивается из позиции «сегодня» в Ганте:
 *  arrivalActualDate ≤ today  → WAREHOUSE_MSK (товар на складе МСК)
 *  arrivalPlannedDate < today → WAREHOUSE_MSK (по плану уже должен прибыть)
 *  qcDate ≤ today             → IN_TRANSIT (ОТК пройден, едет)
 *  readyAtFactoryDate ≤ today → QC (производство закончилось, ОТК)
 *  иначе если есть хоть одна дата → SEWING (в пошиве)
 *  иначе                       → PREPARATION (даты не заданы)
 */
export function computeOrderStatus(d: OrderDates): OrderStatus {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  if (d.arrivalActualDate && d.arrivalActualDate.getTime() <= today.getTime()) {
    return "WAREHOUSE_MSK";
  }
  if (d.arrivalPlannedDate && d.arrivalPlannedDate.getTime() < today.getTime()) {
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
