import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, apiError } from "@/server/api-helpers";
import { assertCan } from "@/lib/rbac";
import { cargoLineWeightSchema } from "@/lib/validators/shipment";
import { logAudit } from "@/server/audit";

// Ручная поправка веса партии в карго (кг). null = вернуть авто-расчёт
// (штуки × вес штуки цветомодели). Используется в раскидке стоимости карго.
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAuth();
    assertCan(session.user.role, "shipment.manage");
    const { id } = await ctx.params;
    const { weightKgOverride } = cargoLineWeightSchema.parse(await req.json());

    const batch = await prisma.orderBatch.findUnique({ where: { id } });
    if (!batch) {
      return NextResponse.json({ error: { code: "not_found", message: "Партия не найдена" } }, { status: 404 });
    }

    const updated = await prisma.orderBatch.update({
      where: { id },
      data: { weightKgOverride },
    });

    await logAudit({
      action: "UPDATE",
      entityType: "OrderBatch",
      entityId: id,
      userId: session.user.id,
      changes: { weightKgOverride },
    });

    return NextResponse.json({ batch: updated });
  } catch (e) {
    return apiError(e);
  }
}
