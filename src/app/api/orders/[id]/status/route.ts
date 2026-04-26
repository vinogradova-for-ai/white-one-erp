import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, apiError } from "@/server/api-helpers";
import { orderStatusChangeSchema } from "@/lib/validators/order";
import { OrderStatus } from "@prisma/client";

const ORDER_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PREPARATION: ["FABRIC_ORDERED"],
  FABRIC_ORDERED: ["SEWING"],
  SEWING: ["QC"],
  QC: ["READY_SHIP", "SEWING"],
  READY_SHIP: ["IN_TRANSIT"],
  IN_TRANSIT: ["WAREHOUSE_MSK"],
  WAREHOUSE_MSK: ["PACKING"],
  PACKING: ["SHIPPED_WB"],
  SHIPPED_WB: ["ON_SALE"],
  ON_SALE: [],
};

const DATE_FIELDS: Partial<Record<OrderStatus, string>> = {
  FABRIC_ORDERED: "decisionDate",
  SEWING: "sewingStartDate",
  QC: "readyAtFactoryDate",
  READY_SHIP: "readyAtFactoryDate",
  IN_TRANSIT: "shipmentDate",
  WAREHOUSE_MSK: "arrivalActualDate",
  PACKING: "arrivalActualDate",
  SHIPPED_WB: "wbShipmentDate",
  ON_SALE: "saleStartDate",
};

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAuth();
    const { id } = await ctx.params;

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

    const dateField = DATE_FIELDS[toStatus];
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
    return NextResponse.json(updated);
  } catch (e) {
    return apiError(e);
  }
}
