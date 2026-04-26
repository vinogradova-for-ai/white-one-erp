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

    // Для перехода в SAMPLE — нужно фото
    if (toStatus === "SAMPLE" && (model.photoUrls?.length ?? 0) === 0) {
      return NextResponse.json(
        { error: { code: "no_photo", message: "Добавьте хотя бы одно фото перед переходом в «Образец»" } },
        { status: 400 },
      );
    }

    // Для перехода в APPROVED — нужна заполненная экономика и размерная сетка
    if (toStatus === "APPROVED") {
      const missing: string[] = [];
      if (model.fullCost == null) missing.push("экономика (закупка и цены)");
      if (!model.sizeGridId) missing.push("размерная сетка");
      if ((model.photoUrls?.length ?? 0) === 0) missing.push("фото");
      if (missing.length > 0) {
        return NextResponse.json(
          {
            error: {
              code: "incomplete",
              message: `Перед переводом в «Утверждён» заполните: ${missing.join(", ")}`,
            },
          },
          { status: 400 },
        );
      }
    }

    // Для перехода в IN_PRODUCTION — нужен хотя бы один вариант в «Готов к заказу»
    if (toStatus === "IN_PRODUCTION") {
      const readyVariantCount = await prisma.productVariant.count({
        where: { productModelId: id, deletedAt: null, status: "READY_TO_ORDER" },
      });
      if (readyVariantCount === 0) {
        return NextResponse.json(
          {
            error: {
              code: "no_ready_variants",
              message:
                "Нет ни одного варианта в статусе «Готов к заказу». Добавьте цвета к фасону и отметьте их готовыми.",
            },
          },
          { status: 400 },
        );
      }
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
