import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, apiError } from "@/server/api-helpers";
import { assertCan } from "@/lib/rbac";
import { cargoLineWeightSchema } from "@/lib/validators/shipment";
import { logAudit } from "@/server/audit";

// PATCH /api/packaging-batches/[id] { weightKgOverride } — ручная поправка
// веса партии упаковки в раскидке стоимости карго (null = обратно на авто).
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAuth();
    assertCan(session.user.role, "shipment.manage");
    const { id } = await ctx.params;
    const { weightKgOverride } = cargoLineWeightSchema.parse(await req.json());

    const batch = await prisma.packagingOrderBatch.findUnique({ where: { id } });
    if (!batch) {
      return NextResponse.json({ error: { code: "not_found", message: "Партия упаковки не найдена" } }, { status: 404 });
    }

    await prisma.packagingOrderBatch.update({ where: { id }, data: { weightKgOverride } });
    await logAudit({
      action: "UPDATE",
      entityType: "PackagingOrderBatch",
      entityId: id,
      userId: session.user.id,
      changes: { weightKgOverride },
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}
