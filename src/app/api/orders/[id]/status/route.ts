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

    // Переход в «Упаковка» — проверяем, что по всем привязанным упаковкам хватает материала
    if (toStatus === "PACKING") {
      const usages = await prisma.orderPackaging.findMany({
        where: { orderId: id },
        include: {
          packagingItem: {
            select: {
              name: true,
              stock: true,
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
      const totalQuantity = order.lines.reduce((a, l) => a + l.quantity, 0);
      const shortages = usages
        .map((u) => {
          const total = Math.ceil(totalQuantity * Number(u.quantityPerUnit));
          const inProd = u.packagingItem.packagingOrderLines.reduce((a, l) => a + l.quantity, 0);
          const have = u.packagingItem.stock + inProd;
          return { name: u.packagingItem.name, shortage: total - have };
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
    }

    const dateField = ORDER_STATUS_DATE_FIELDS[toStatus];
    const updated = await prisma.$transaction(async (tx) => {
      const upd = await tx.order.update({
        where: { id },
        data: {
          status: toStatus,
          ...(dateField ? { [dateField]: new Date() } : {}),
        },
      });
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
