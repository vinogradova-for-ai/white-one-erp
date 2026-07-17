import { prisma } from "@/lib/prisma";
import { logAudit } from "@/server/audit";
import type { OrderStatus, Role } from "@prisma/client";
// Единый источник переходов и дат-на-статус — тот же, что читает UI-компонент.
import { ORDER_TRANSITIONS, ORDER_STATUS_DATE_FIELDS } from "@/lib/status-machine/order-statuses";
import { ORDER_STATUS_ORDER } from "@/lib/constants";

/**
 * ЕДИНАЯ точка смены статуса заказа.
 *
 * Раньше логика жила в двух местах: роут /api/orders/[id]/status (новый UI смены
 * статуса) и приватный updateOrderStatus в dashboard/actions.ts (чек-боксы
 * «Главного»). Они дублировали запись OrderStatusLog + аудит, и — что важнее —
 * ГЕЙТ упаковки при входе в PACKING (проверка дефицита + списание consumedQty)
 * жил ТОЛЬКО в роуте. Стоило бы дашборду однажды двинуть заказ в PACKING напрямую
 * через prisma — списание упаковки было бы обойдено. Теперь обе двери зовут эту
 * функцию: гейт и списание — в одном месте, разъехаться нельзя.
 *
 * Проверку RBAC и парсинг тела делает вызывающий (роут/actions) — здесь только
 * бизнес-логика перехода. Транзакция атомарна: статус + даты + списание/возврат
 * упаковки + OrderStatusLog. Аудит — после коммита (не блокирующий).
 */

export type ChangeOrderStatusResult =
  | { ok: true }
  | { ok: false; code: string; message: string };

export async function changeOrderStatus(params: {
  orderId: string;
  toStatus: OrderStatus;
  actorId: string;
  actorRole: Role;
  comment?: string | null;
  /** Дополнительные поля к записи заказа (напр. arrivalActualDate/qcDate с дашборда). */
  extraData?: Record<string, unknown>;
  /** Текст комментария в OrderStatusLog по умолчанию (если comment не передан). */
  logComment?: string | null;
}): Promise<ChangeOrderStatusResult> {
  const { orderId, toStatus, actorId, actorRole, extraData } = params;

  const order = await prisma.order.findFirst({
    where: { id: orderId, deletedAt: null },
    include: { lines: { select: { quantity: true } } },
  });
  if (!order) return { ok: false, code: "not_found", message: "Заказ не найден" };

  if (order.status === toStatus) {
    return { ok: false, code: "no_change", message: "Статус не изменился" };
  }

  const allowed = ORDER_TRANSITIONS[order.status] ?? [];
  const isAdmin = actorRole === "OWNER" || actorRole === "DIRECTOR";
  if (!allowed.includes(toStatus) && !isAdmin) {
    return { ok: false, code: "invalid_transition", message: "Нельзя перепрыгнуть статус" };
  }

  const totalQuantity = order.lines.reduce((a, l) => a + l.quantity, 0);

  // Переход в «Упаковка» — проверяем ЧЕСТНЫЙ дефицит (аудит п.7):
  //   доступно = ТОЛЬКО физический остаток stock, минус потребность ДРУГИХ
  //   заказов, уже упаковывающихся/на складе (конкуренция за один остаток).
  //   «В производстве» (едет из Китая) в «доступно» НЕ входит.
  let packingUsages: Array<{
    id: string;
    packagingItemId: string;
    quantityPerUnit: unknown;
    consumedQty: number | null;
  }> = [];
  if (toStatus === "PACKING") {
    const usages = await prisma.orderPackaging.findMany({
      where: { orderId },
      include: {
        packagingItem: {
          select: {
            id: true,
            name: true,
            stock: true,
            // Потребность конкурирующих заказов: те, что уже в PACKING/WAREHOUSE_MSK
            // (кроме текущего) и ещё не отгружены. Их упаковка зарезервирована.
            orderUsages: {
              where: {
                orderId: { not: orderId },
                order: {
                  deletedAt: null,
                  status: { in: ["PACKING", "WAREHOUSE_MSK"] },
                },
              },
              select: {
                quantityPerUnit: true,
                order: { select: { lines: { select: { quantity: true } } } },
              },
            },
          },
        },
      },
    });
    if (usages.length === 0) {
      return {
        ok: false,
        code: "no_packaging",
        message:
          "К заказу не привязана упаковка. Добавьте позиции в блоке «Упаковка — потребность» на карточке заказа.",
      };
    }
    const shortages = usages
      .map((u) => {
        const need = Math.ceil(totalQuantity * Number(u.quantityPerUnit));
        const reservedByOthers = u.packagingItem.orderUsages.reduce((a, ou) => {
          const otherQty = ou.order.lines.reduce((s, l) => s + l.quantity, 0);
          return a + Math.ceil(otherQty * Number(ou.quantityPerUnit));
        }, 0);
        const available = u.packagingItem.stock - reservedByOthers;
        return { name: u.packagingItem.name, shortage: need - available };
      })
      .filter((s) => s.shortage > 0);
    if (shortages.length > 0) {
      const msg = shortages.map((s) => `${s.name}: не хватает ${s.shortage} шт`).join("; ");
      return {
        ok: false,
        code: "packaging_shortage",
        message: `Нельзя начать упаковку — дефицит: ${msg}. Увеличьте остатки или запустите производство.`,
      };
    }
    packingUsages = usages.map((u) => ({
      id: u.id,
      packagingItemId: u.packagingItemId,
      quantityPerUnit: u.quantityPerUnit,
      consumedQty: u.consumedQty,
    }));
  }

  // Возврат упаковки на склад — ТОЛЬКО при откате НАЗАД (до «Упаковки»).
  // Раньше условие срабатывало и при движении вперёд (PACKING → SHIPPED_WB):
  // товар физически упакован и уехал, а система «возвращала» упаковку на склад —
  // остатки завышались с каждым отгруженным заказом (правка Алёны №4, 03.07).
  const isRollingBackFromPacking =
    order.status === "PACKING" &&
    ORDER_STATUS_ORDER.indexOf(toStatus) < ORDER_STATUS_ORDER.indexOf("PACKING");

  const dateField = ORDER_STATUS_DATE_FIELDS[toStatus];
  // Конец ОТК: раньше qcDate ставил переход в READY_SHIP; статус выпилен
  // (04.07, «только ОТК»), поэтому при QC → IN_TRANSIT дозаполняем qcDate,
  // если его не отметили отдельно — иначе Гант остаётся без конца фазы ОТК.
  const fillQcDate = toStatus === "IN_TRANSIT" && !order.qcDate;
  await prisma.$transaction(async (tx) => {
    await tx.order.update({
      where: { id: orderId },
      data: {
        status: toStatus,
        ...(dateField ? { [dateField]: new Date() } : {}),
        ...(fillQcDate ? { qcDate: new Date() } : {}),
        ...(extraData ?? {}),
      },
    });

    // Списание упаковки при входе в PACKING. Идемпотентно: списываем только те
    // позиции, у которых ещё не проставлен consumedQty (не списывали раньше).
    if (toStatus === "PACKING") {
      for (const u of packingUsages) {
        if (u.consumedQty != null) continue;
        const need = Math.ceil(totalQuantity * Number(u.quantityPerUnit));
        if (need <= 0) continue;
        await tx.packagingItem.update({
          where: { id: u.packagingItemId },
          data: { stock: { decrement: need } },
        });
        await tx.orderPackaging.update({
          where: { id: u.id },
          data: { consumedQty: need },
        });
        // Журнал мини-товарного учёта (17.07): расход Москвы той же транзакцией.
        await tx.packagingMovement.create({
          data: {
            packagingItemId: u.packagingItemId,
            date: new Date(),
            kind: "PACK_MSK",
            deltaMsk: -need,
            note: `упаковано под заказ ${order.orderNumber}`,
            createdById: actorId,
          },
        });
      }
    }

    // Откат из PACKING назад — возвращаем списанное на склад и обнуляем consumedQty.
    if (isRollingBackFromPacking) {
      const consumed = await tx.orderPackaging.findMany({
        where: { orderId, consumedQty: { not: null } },
        select: { id: true, packagingItemId: true, consumedQty: true },
      });
      for (const c of consumed) {
        if (!c.consumedQty) continue;
        await tx.packagingItem.update({
          where: { id: c.packagingItemId },
          data: { stock: { increment: c.consumedQty } },
        });
        await tx.orderPackaging.update({
          where: { id: c.id },
          data: { consumedQty: null },
        });
        // Журнал: возврат из упаковки (откат статуса) — той же транзакцией.
        await tx.packagingMovement.create({
          data: {
            packagingItemId: c.packagingItemId,
            date: new Date(),
            kind: "PACK_MSK_ROLLBACK",
            deltaMsk: c.consumedQty,
            note: `возврат из упаковки · заказ ${order.orderNumber}`,
            createdById: actorId,
          },
        });
      }
    }

    await tx.orderStatusLog.create({
      data: {
        orderId,
        fromStatus: order.status,
        toStatus,
        changedById: actorId,
        comment: params.comment ?? params.logComment ?? null,
      },
    });
  });

  await logAudit({
    action: "STATUS_CHANGE",
    entityType: "Order",
    entityId: orderId,
    userId: actorId,
    changes: { from: order.status, to: toStatus },
  });

  return { ok: true };
}
