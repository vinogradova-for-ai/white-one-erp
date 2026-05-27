"use server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

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

export async function completeChecklistTask(
  kind: Kind,
  entityId: string,
  actualDateIso: string,
): Promise<{ ok: boolean; error?: string }> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Не авторизован" };

  const actualDate = new Date(actualDateIso);
  if (Number.isNaN(actualDate.getTime())) {
    return { ok: false, error: "Неверная дата" };
  }

  try {
    switch (kind) {
      case "order-qc": {
        // Заказали ОТК: SEWING → QC. qcDate ещё не известна (это дата прохождения).
        await prisma.order.update({
          where: { id: entityId },
          data: { status: "QC" },
        });
        break;
      }
      case "accept-qc": {
        // ОТК прошёл и принят: status → READY_SHIP. qcDate = actualDate если ещё null.
        const cur = await prisma.order.findUnique({ where: { id: entityId }, select: { qcDate: true } });
        await prisma.order.update({
          where: { id: entityId },
          data: {
            status: "READY_SHIP",
            ...(cur?.qcDate ? {} : { qcDate: actualDate }),
          },
        });
        break;
      }
      case "check-delivery": {
        // Партия прибыла на склад. status → WAREHOUSE_MSK + arrivalActualDate.
        await prisma.order.update({
          where: { id: entityId },
          data: {
            status: "WAREHOUSE_MSK",
            arrivalActualDate: actualDate,
          },
        });
        break;
      }
      case "size-chart": {
        // Размерная сетка готова — boolean без даты.
        await prisma.productModel.update({
          where: { id: entityId },
          data: { sizeChartReady: true },
        });
        break;
      }
      case "approve-sample": {
        // Образец утверждён.
        await prisma.productModel.update({
          where: { id: entityId },
          data: { status: "APPROVED" },
        });
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
        break;
      }
    }
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }

  revalidatePath("/dashboard");
  return { ok: true };
}
