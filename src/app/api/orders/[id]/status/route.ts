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

    const order = await prisma.order.findFirst({ where: { id, deletedAt: null } });
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
