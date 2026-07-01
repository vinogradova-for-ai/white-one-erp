import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, apiError } from "@/server/api-helpers";
import { assertCan } from "@/lib/rbac";
import { orderStatusChangeSchema } from "@/lib/validators/order";
import { logAudit } from "@/server/audit";
// Единый источник переходов и дат-на-статус — без локальных копий, чтобы
// UI/роут/каноничный модуль не разъехались (см. аудит БД-консистентности).
import { ORDER_TRANSITIONS, ORDER_STATUS_DATE_FIELDS } from "@/lib/status-machine/order-statuses";

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAuth();
    const { id } = await ctx.params;
    assertCan(session.user.role, "order.updateStatus"); // RBAC: смена статуса заказа

    const order = await prisma.order.findFirst({
      where: { id, deletedAt: null },
      include: { lines: { select: { quantity: true } } },
    });
    if (!order) return NextResponse.json({ error: { code: "not_found" } }, { status: 404 });

    const { toStatus, comment } = orderStatusChangeSchema.parse(await req.json());

    const allowed = ORDER_TRANSITIONS[order.status];
    const isAdmin = session.user.role === "OWNER" || session.user.role === "DIRECTOR";

    if (!allowed.includes(toStatus) && !isAdmin) {
      return NextResponse.json(
        { error: { code: "invalid_transition", message: "Нельзя перепрыгнуть статус" } },
        { status: 400 },
      );
    }

    const totalQuantity = order.lines.reduce((a, l) => a + l.quantity, 0);

    // Переход в «Упаковка» — проверяем ЧЕСТНЫЙ дефицит (аудит п.7):
    //   доступно = ТОЛЬКО физический остаток stock, минус потребность ДРУГИХ
    //   заказов, уже упаковывающихся/на складе (конкуренция за один остаток).
    //   «В производстве» (едет из Китая) в «доступно» НЕ входит — показываем
    //   его отдельно справочно. Раньше have = stock + inProd, и потребность
    //   соседних заказов не вычиталась — гейт пропускал реальную нехватку.
    let packingUsages: Array<{
      id: string;
      packagingItemId: string;
      quantityPerUnit: unknown;
      consumedQty: number | null;
      packagingItem: { name: string };
    }> = [];
    if (toStatus === "PACKING") {
      const usages = await prisma.orderPackaging.findMany({
        where: { orderId: id },
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
                  orderId: { not: id },
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
              packagingOrderLines: {
                where: { packagingOrder: { status: { notIn: ["ARRIVED", "CANCELLED"] } } },
                select: { quantity: true },
              },
            },
          },
        },
      });
      if (usages.length === 0) {
        return NextResponse.json(
          {
            error: {
              code: "no_packaging",
              message:
                "К заказу не привязана упаковка. Добавьте позиции в блоке «Упаковка — потребность» на карточке заказа.",
            },
          },
          { status: 400 },
        );
      }
      const shortages = usages
        .map((u) => {
          const need = Math.ceil(totalQuantity * Number(u.quantityPerUnit));
          // Зарезервировано другими заказами в упаковке/на складе.
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
        return NextResponse.json(
          {
            error: {
              code: "packaging_shortage",
              message: `Нельзя начать упаковку — дефицит: ${msg}. Увеличьте остатки или запустите производство.`,
            },
          },
          { status: 400 },
        );
      }
      packingUsages = usages.map((u) => ({
        id: u.id,
        packagingItemId: u.packagingItemId,
        quantityPerUnit: u.quantityPerUnit,
        consumedQty: u.consumedQty,
        packagingItem: { name: u.packagingItem.name },
      }));
    }

    // Откат из «Упаковка» назад — возвращаем ранее списанную упаковку на склад.
    const isLeavingPacking = order.status === "PACKING" && toStatus !== "PACKING";

    const dateField = ORDER_STATUS_DATE_FIELDS[toStatus];
    const updated = await prisma.$transaction(async (tx) => {
      const upd = await tx.order.update({
        where: { id },
        data: {
          status: toStatus,
          ...(dateField ? { [dateField]: new Date() } : {}),
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
        }
      }

      // Откат из PACKING — возвращаем списанное на склад и обнуляем consumedQty.
      if (isLeavingPacking) {
        const consumed = await tx.orderPackaging.findMany({
          where: { orderId: id, consumedQty: { not: null } },
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
        }
      }

      await tx.orderStatusLog.create({
        data: {
          orderId: id,
          fromStatus: order.status,
          toStatus,
          changedById: session.user.id,
          comment,
        },
      });
      return upd;
    });
    await logAudit({
      action: "STATUS_CHANGE",
      entityType: "Order",
      entityId: id,
      userId: session.user.id,
      changes: { from: order.status, to: toStatus },
    });
    return NextResponse.json(updated);
  } catch (e) {
    return apiError(e);
  }
}
