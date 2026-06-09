import { prisma } from "@/lib/prisma";
import { computeOrderStatus } from "@/lib/order-auto-status";
import { isForwardOrderStatus } from "@/lib/status-machine/order-statuses";

/**
 * Двигает статус заказа ВПЕРЁД по таймлайну и фиксирует в БД + логе.
 *
 * Зачем: авто-статус (computeOrderStatus) раньше пересчитывался ТОЛЬКО при
 * сохранении заказа (PATCH). Если заказ после прохождения даты никто не
 * редактировал, статус «застревал» — например, «Готов к отгрузке», когда по
 * датам товар уже едет (qcDate в прошлом). Гант при этом показывает правду
 * (линия «сегодня» в полосе Доставки), а бейдж — устаревший статус.
 *
 * Идемпотентно: если двигать некуда — ничего не делает. Назад НЕ откатывает
 * (forward-only), поэтому вручную продвинутый статус не собьётся.
 * Актор лога — ответственный за заказ (ownerId).
 */
async function advanceOne(o: {
  id: string;
  status: import("@prisma/client").OrderStatus;
  ownerId: string;
  readyAtFactoryDate: Date | null;
  qcDate: Date | null;
  arrivalPlannedDate: Date | null;
  arrivalActualDate: Date | null;
}): Promise<boolean> {
  const newStatus = computeOrderStatus(o);
  if (newStatus === o.status || !isForwardOrderStatus(o.status, newStatus)) return false;
  await prisma.$transaction([
    prisma.order.update({ where: { id: o.id }, data: { status: newStatus } }),
    prisma.orderStatusLog.create({
      data: {
        orderId: o.id,
        fromStatus: o.status,
        toStatus: newStatus,
        changedById: o.ownerId,
        comment: "Автостатус по таймлайну",
      },
    }),
  ]);
  return true;
}

const SELECT = {
  id: true,
  status: true,
  ownerId: true,
  readyAtFactoryDate: true,
  qcDate: true,
  arrivalPlannedDate: true,
  arrivalActualDate: true,
} as const;

/**
 * Пересчёт статуса одного заказа при открытии его карточки. Best-effort:
 * ошибка не должна ронять страницу заказа.
 */
export async function syncOrderStatusForward(orderId: string): Promise<void> {
  try {
    const o = await prisma.order.findFirst({
      where: { id: orderId, deletedAt: null },
      select: SELECT,
    });
    if (o) await advanceOne(o);
  } catch (err) {
    console.warn("[sync-order-status] failed:", (err as Error)?.message);
  }
}
