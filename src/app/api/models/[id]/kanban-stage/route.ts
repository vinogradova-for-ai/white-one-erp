// Канбан-эндпоинт для drag-перевода фасона между под-этапами Разработки.
// В отличие от /status (со строгой машиной состояний), здесь разрешаем
// прыжки через шаги и откаты — канбан-доска показывает реальное состояние
// процесса, и Алёна должна иметь возможность поправить руками без модалок.
//
// Принимает { targetStage: "idea" | "sample" | "ideal_sample" | "sizing_done" }.
// Обновляет ProductModel.status / sizeChartReady, проставляет нужную дату
// если она была пустая. Для дат, которые «прошли» по цепочке, тоже проставит
// сегодня (если null) — чтобы цепочка дат не имела пропусков.
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, apiError } from "@/server/api-helpers";
import { assertCan } from "@/lib/rbac";
import { z } from "zod";

const bodySchema = z.object({
  targetStage: z.enum(["idea", "sample", "ideal_sample", "sizing_done"]),
});

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAuth();
    const { id } = await ctx.params;

    const model = await prisma.productModel.findFirst({ where: { id, deletedAt: null } });
    if (!model) return NextResponse.json({ error: { code: "not_found" } }, { status: 404 });

    assertCan(session.user.role, "product.updateStatus", model.ownerId, session.user.id);

    const { targetStage } = bodySchema.parse(await req.json());

    // Если модель уже в производстве с активным заказом — drag в разработке
    // не должен ничего ломать. Это защита от случайного срабатывания.
    const hasActiveOrder = await prisma.order.findFirst({
      where: { productModelId: id, deletedAt: null },
      select: { id: true },
    });
    if (hasActiveOrder) {
      return NextResponse.json(
        { error: { code: "has_active_order", message: "У модели уже есть заказ — статус разработки меняется через заказ или вручную в форме" } },
        { status: 400 },
      );
    }

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    // Маппинг канбан-стадия → поля БД. sampleDate/approvedDate/productionStartDate
    // проставляются только если были null (чтобы откат назад не затирал реальные даты).
    const update: {
      status?: "IDEA" | "SAMPLE" | "APPROVED";
      sizeChartReady?: boolean;
      sampleDate?: Date | null;
      approvedDate?: Date | null;
      productionStartDate?: Date | null;
    } = {};

    if (targetStage === "idea") {
      update.status = "IDEA";
      update.sizeChartReady = false;
    } else if (targetStage === "sample") {
      update.status = "SAMPLE";
      update.sizeChartReady = false;
      if (!model.sampleDate) update.sampleDate = today;
    } else if (targetStage === "ideal_sample") {
      update.status = "APPROVED";
      update.sizeChartReady = false;
      if (!model.sampleDate) update.sampleDate = today;
      if (!model.approvedDate) update.approvedDate = today;
    } else if (targetStage === "sizing_done") {
      update.status = "APPROVED";
      update.sizeChartReady = true;
      if (!model.sampleDate) update.sampleDate = today;
      if (!model.approvedDate) update.approvedDate = today;
      if (!model.productionStartDate) update.productionStartDate = today;
    }

    await prisma.productModel.update({ where: { id }, data: update });

    return NextResponse.json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}
