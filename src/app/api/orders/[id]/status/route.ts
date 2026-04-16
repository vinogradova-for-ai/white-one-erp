import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, apiError } from "@/server/api-helpers";
import { assertCan } from "@/lib/rbac";
import { orderStatusChangeSchema } from "@/lib/validators/order";
import { canMoveOrderStatus, ORDER_STATUS_DATE_FIELDS } from "@/lib/status-machine/order-statuses";

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAuth();
    const { id } = await ctx.params;

    const order = await prisma.order.findFirst({ where: { id, deletedAt: null } });
    if (!order) return NextResponse.json({ error: { code: "not_found" } }, { status: 404 });

    assertCan(session.user.role, "order.updateStatus", order.ownerId, session.user.id);

    const { toStatus, comment } = orderStatusChangeSchema.parse(await req.json());
    const check = canMoveOrderStatus(order.status, toStatus, session.user.role);
    if (!check.ok) {
      return NextResponse.json({ error: { code: "invalid_transition", message: check.reason } }, { status: 400 });
    }
    if (check.requiresComment && !comment?.trim()) {
      return NextResponse.json(
        { error: { code: "comment_required", message: "Откат статуса требует комментарий" } },
        { status: 400 },
      );
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
    return NextResponse.json(updated);
  } catch (e) {
    return apiError(e);
  }
}
