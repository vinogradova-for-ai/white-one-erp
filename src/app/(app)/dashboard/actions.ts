"use server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { can, type Action } from "@/lib/rbac";
import { logAudit } from "@/server/audit";
import { revalidatePath } from "next/cache";
import type { Role } from "@prisma/client";

/**
 * Закрытие задачи с «Главного» одним тыком чек-бокса.
 *
 * Принцип («задача закрывается по результату, не по процессу»):
 *   галка означает БИЗНЕС-результат, а не «формально кликнули». Поэтому
 *   мы обновляем не флаг «выполнено», а реальные поля в БД, по которым
 *   задача в следующий раз УЖЕ НЕ попадёт в getMainScreenChecklist().
 *
 * actualDate — дата когда фактически случилось. Нужно для аналитики реальных
 * циклов (Алёна: «Средние циклы для каждого этапа можно оценить»). 4 кнопки:
 * Сегодня / Вчера / -2 дн / -3 дн + ручной ввод.
 *
 * Доступ гейтится через RBAC (read-only отделы не закрывают задачи), смена
 * статуса заказа пишет OrderStatusLog, все изменения логируются в аудит.
 *
 * Поддерживаемые kind'ы (где «галка» осмысленна, действие однозначное):
 *   order-qc        → Order.status = QC                  (заказали ОТК)
 *   accept-qc       → Order.status = READY_SHIP + qcDate (приняли ОТК)
 *   check-delivery  → Order.status = WAREHOUSE_MSK + arrivalActualDate
 *   size-chart      → ProductModel.sizeChartReady = true (нет даты)
 *   approve-sample  → ProductModel.status = APPROVED
 *   pkg-check-delivery → PackagingOrder.status=ARRIVED + arrivedDate
 *
 * Остальные kind'ы (order-sample, start-production, pkg-design, pkg-sample,
 * pkg-approve, pkg-launch) требуют ввода данных или создания сущности —
 * для них чек-бокс НЕ показываем, оставляем переход в карточку.
 */

type Kind =
  | "order-qc"
  | "accept-qc"
  | "check-delivery"
  | "size-chart"
  | "approve-sample"
  | "pkg-check-delivery";

// Какое право требуется для каждого действия.
const KIND_ACTION: Record<Kind, Action> = {
  "order-qc": "order.updateStatus",
  "accept-qc": "order.updateStatus",
  "check-delivery": "order.updateStatus",
  "size-chart": "product.update",
  "approve-sample": "product.updateStatus",
  "pkg-check-delivery": "packaging.manage",
};

export async function completeChecklistTask(
  kind: Kind,
  entityId: string,
  actualDateIso: string,
): Promise<{ ok: boolean; error?: string }> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Не авторизован" };
  const user = session.user as { id: string; role: Role };

  // RBAC: read-only отделы не закрывают задачи.
  if (!can(user.role, KIND_ACTION[kind])) {
    return { ok: false, error: "Недостаточно прав для этого действия" };
  }

  const actualDate = new Date(actualDateIso);
  if (Number.isNaN(actualDate.getTime())) {
    return { ok: false, error: "Неверная дата" };
  }

  try {
    switch (kind) {
      case "order-qc": {
        // Заказали ОТК: SEWING → QC. qcDate ещё не известна (это дата прохождения).
        await updateOrderStatus(entityId, "QC", user.id, {});
        break;
      }
      case "accept-qc": {
        // ОТК прошёл и принят: status → READY_SHIP. qcDate = actualDate если ещё null.
        const cur = await prisma.order.findUnique({ where: { id: entityId }, select: { qcDate: true } });
        await updateOrderStatus(entityId, "READY_SHIP", user.id, cur?.qcDate ? {} : { qcDate: actualDate });
        break;
      }
      case "check-delivery": {
        // Партия прибыла на склад. status → WAREHOUSE_MSK + arrivalActualDate.
        await updateOrderStatus(entityId, "WAREHOUSE_MSK", user.id, { arrivalActualDate: actualDate });
        break;
      }
      case "size-chart": {
        // Размерная сетка готова — boolean без даты.
        await prisma.productModel.update({
          where: { id: entityId },
          data: { sizeChartReady: true },
        });
        await logAudit({ action: "UPDATE", entityType: "ProductModel", entityId, userId: user.id, changes: { sizeChartReady: true } });
        break;
      }
      case "approve-sample": {
        // Образец утверждён.
        await prisma.productModel.update({
          where: { id: entityId },
          data: { status: "APPROVED" },
        });
        await logAudit({ action: "STATUS_CHANGE", entityType: "ProductModel", entityId, userId: user.id, changes: { to: "APPROVED" } });
        break;
      }
      case "pkg-check-delivery": {
        await prisma.packagingOrder.update({
          where: { id: entityId },
          data: {
            status: "ARRIVED",
            arrivedDate: actualDate,
          },
        });
        await logAudit({ action: "STATUS_CHANGE", entityType: "PackagingOrder", entityId, userId: user.id, changes: { to: "ARRIVED" } });
        break;
      }
    }
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }

  revalidatePath("/dashboard");
  return { ok: true };
}

// Смена статуса заказа + запись в OrderStatusLog (трасса «кто/когда/откуда-куда») атомарно.
async function updateOrderStatus(
  orderId: string,
  toStatus: "QC" | "READY_SHIP" | "WAREHOUSE_MSK",
  userId: string,
  extraData: Record<string, unknown>,
) {
  await prisma.$transaction(async (tx) => {
    const cur = await tx.order.findUnique({ where: { id: orderId }, select: { status: true } });
    await tx.order.update({ where: { id: orderId }, data: { status: toStatus, ...extraData } });
    if (cur && cur.status !== toStatus) {
      await tx.orderStatusLog.create({
        data: {
          orderId,
          fromStatus: cur.status,
          toStatus,
          changedById: userId,
          comment: "Закрытие задачи с Главного",
        },
      });
    }
  });
  await logAudit({ action: "STATUS_CHANGE", entityType: "Order", entityId: orderId, userId, changes: { to: toStatus } });
}
