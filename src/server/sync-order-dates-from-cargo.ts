import { prisma } from "@/lib/prisma";
import { logAudit } from "@/server/audit";

/**
 * Гант — план, который уточняется ФАКТОМ мероприятий (прожарка 17.07):
 *  - выехало ПЕРВОЕ карго с партией заказа → конец «ОТК» (= старт «Доставки»,
 *    поле qcDate) встаёт по фактической дате выезда;
 *  - пока партии едут → конец «Доставки» (arrivalPlannedDate) = плановое
 *    прибытие ПОСЛЕДНЕГО карго с партиями заказа;
 *  - факт прибытия последней партии ставит приёмка (уже работает).
 * Для заказов УПАКОВКИ симметрично: productionEndDate ← первый выезд,
 * expectedDate ← позднейшее прибытие.
 *
 * Вызывается после смены дат/статуса карго и привязки/отвязки партий.
 * Ручной сдвиг в Ганте остаётся возможен — следующее событие карго уточнит.
 */

function sameDay(a: Date | null, b: Date | null): boolean {
  if (a == null || b == null) return a === b;
  return a.toISOString().slice(0, 10) === b.toISOString().slice(0, 10);
}

export async function syncOrderDatesFromCargo(orderIds: string[], actorId: string): Promise<void> {
  for (const orderId of [...new Set(orderIds)]) {
    try {
      const order = await prisma.order.findFirst({
        where: { id: orderId, deletedAt: null },
        select: {
          id: true,
          qcDate: true,
          arrivalPlannedDate: true,
          batches: {
            where: { shipmentId: { not: null } },
            select: {
              shipment: {
                select: { cargoNumber: true, number: true, departDate: true, arriveDate: true, arrivalActualDate: true },
              },
            },
          },
        },
      });
      if (!order || order.batches.length === 0) continue;

      const departs = order.batches
        .map((b) => b.shipment?.departDate)
        .filter((d): d is Date => d != null);
      const arrivals = order.batches
        .map((b) => b.shipment?.arrivalActualDate ?? b.shipment?.arriveDate)
        .filter((d): d is Date => d != null);

      const firstDepart = departs.length ? new Date(Math.min(...departs.map((d) => d.getTime()))) : null;
      const lastArrival = arrivals.length ? new Date(Math.max(...arrivals.map((d) => d.getTime()))) : null;

      const data: Record<string, Date> = {};
      if (firstDepart && !sameDay(order.qcDate, firstDepart)) data.qcDate = firstDepart;
      if (lastArrival && !sameDay(order.arrivalPlannedDate, lastArrival)) data.arrivalPlannedDate = lastArrival;
      if (Object.keys(data).length === 0) continue;

      await prisma.order.update({ where: { id: orderId }, data });
      const src = order.batches[0].shipment?.cargoNumber ?? order.batches[0].shipment?.number ?? "карго";
      await logAudit({
        action: "UPDATE",
        entityType: "Order",
        entityId: orderId,
        userId: actorId,
        changes: { ...jsonDates(data), note: `уточнено фактом карго ${src}` },
      });
    } catch (err) {
      console.warn("[sync-order-dates-from-cargo] failed:", (err as Error)?.message);
    }
  }
}

/** Упаковка: производство кончается первым выездом, доставка — последним прибытием. */
export async function syncPackagingDatesFromCargo(packagingOrderIds: string[]): Promise<void> {
  for (const id of [...new Set(packagingOrderIds)]) {
    try {
      const po = await prisma.packagingOrder.findUnique({
        where: { id },
        select: {
          id: true,
          productionEndDate: true,
          expectedDate: true,
          batches: {
            where: { shipmentId: { not: null } },
            select: {
              shipment: { select: { departDate: true, arriveDate: true, arrivalActualDate: true } },
            },
          },
        },
      });
      if (!po || po.batches.length === 0) continue;

      const departs = po.batches.map((b) => b.shipment?.departDate).filter((d): d is Date => d != null);
      const arrivals = po.batches
        .map((b) => b.shipment?.arrivalActualDate ?? b.shipment?.arriveDate)
        .filter((d): d is Date => d != null);
      const firstDepart = departs.length ? new Date(Math.min(...departs.map((d) => d.getTime()))) : null;
      const lastArrival = arrivals.length ? new Date(Math.max(...arrivals.map((d) => d.getTime()))) : null;

      const data: Record<string, Date> = {};
      if (firstDepart && !sameDay(po.productionEndDate, firstDepart)) data.productionEndDate = firstDepart;
      if (lastArrival && !sameDay(po.expectedDate, lastArrival)) data.expectedDate = lastArrival;
      if (Object.keys(data).length === 0) continue;
      await prisma.packagingOrder.update({ where: { id }, data });
    } catch (err) {
      console.warn("[sync-packaging-dates-from-cargo] failed:", (err as Error)?.message);
    }
  }
}

/** Все заказы и заказы упаковки, чьи партии едут этим карго. */
export async function syncAllDatesForShipment(shipmentId: string, actorId: string): Promise<void> {
  const [batches, pkgBatches] = await Promise.all([
    prisma.orderBatch.findMany({ where: { shipmentId }, select: { orderId: true } }),
    prisma.packagingOrderBatch.findMany({ where: { shipmentId }, select: { packagingOrderId: true } }),
  ]);
  await syncOrderDatesFromCargo(batches.map((b) => b.orderId), actorId);
  await syncPackagingDatesFromCargo(pkgBatches.map((b) => b.packagingOrderId));
}

function jsonDates(d: Record<string, Date>): Record<string, string> {
  return Object.fromEntries(Object.entries(d).map(([k, v]) => [k, v.toISOString().slice(0, 10)]));
}
