import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, apiError } from "@/server/api-helpers";
import { assertCan } from "@/lib/rbac";
import { productStatusChangeSchema } from "@/lib/validators/product";
import { canMoveProductStatus, PRODUCT_STATUS_DATE_FIELDS } from "@/lib/status-machine/product-statuses";

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAuth();
    const { id } = await ctx.params;

    const product = await prisma.product.findFirst({ where: { id, deletedAt: null } });
    if (!product) return NextResponse.json({ error: { code: "not_found" } }, { status: 404 });

    assertCan(session.user.role, "product.updateStatus", product.ownerId, session.user.id);

    const { toStatus, comment } = productStatusChangeSchema.parse(await req.json());
    const check = canMoveProductStatus(product.status, toStatus, session.user.role);

    if (!check.ok) {
      return NextResponse.json({ error: { code: "invalid_transition", message: check.reason } }, { status: 400 });
    }
    if (check.requiresComment && !comment?.trim()) {
      return NextResponse.json(
        { error: { code: "comment_required", message: "Откат статуса требует комментарий" } },
        { status: 400 },
      );
    }

    const dateField = PRODUCT_STATUS_DATE_FIELDS[toStatus];
    const updated = await prisma.$transaction(async (tx) => {
      const upd = await tx.product.update({
        where: { id },
        data: {
          status: toStatus,
          ...(dateField ? { [dateField]: new Date() } : {}),
        },
      });
      await tx.productStatusLog.create({
        data: {
          productId: id,
          fromStatus: product.status,
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
