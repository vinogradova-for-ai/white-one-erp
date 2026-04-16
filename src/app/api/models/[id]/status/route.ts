import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, apiError } from "@/server/api-helpers";
import { assertCan } from "@/lib/rbac";
import { modelStatusChangeSchema } from "@/lib/validators/model";
import { canMoveModelStatus, MODEL_STATUS_DATE_FIELDS } from "@/lib/status-machine/product-statuses";

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAuth();
    const { id } = await ctx.params;

    const model = await prisma.productModel.findFirst({ where: { id, deletedAt: null } });
    if (!model) return NextResponse.json({ error: { code: "not_found" } }, { status: 404 });

    assertCan(session.user.role, "product.updateStatus", model.ownerId, session.user.id);

    const { toStatus, comment } = modelStatusChangeSchema.parse(await req.json());
    const check = canMoveModelStatus(model.status, toStatus, session.user.role);
    if (!check.ok) {
      return NextResponse.json({ error: { code: "invalid_transition", message: check.reason } }, { status: 400 });
    }
    if (check.requiresComment && !comment?.trim()) {
      return NextResponse.json(
        { error: { code: "comment_required", message: "Откат требует комментарий" } },
        { status: 400 },
      );
    }

    // Для перехода в SAMPLE проверим, что есть фото модели
    if (toStatus === "SAMPLE" && (model.photoUrls?.length ?? 0) === 0) {
      return NextResponse.json(
        { error: { code: "no_photo", message: "Добавьте хотя бы одно фото перед переходом в «Образец»" } },
        { status: 400 },
      );
    }

    const dateField = MODEL_STATUS_DATE_FIELDS[toStatus];
    const updated = await prisma.$transaction(async (tx) => {
      const upd = await tx.productModel.update({
        where: { id },
        data: {
          status: toStatus,
          ...(dateField ? { [dateField]: new Date() } : {}),
        },
      });
      await tx.productModelStatusLog.create({
        data: {
          productModelId: id,
          fromStatus: model.status,
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
