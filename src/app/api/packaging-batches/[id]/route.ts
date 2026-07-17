import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, apiError } from "@/server/api-helpers";
import { assertCan } from "@/lib/rbac";
import { z } from "zod";
import { cargoLineWeightSchema } from "@/lib/validators/shipment";
import { syncPackagingStockForShipment } from "@/server/packaging-stock";
import { logAudit } from "@/server/audit";

// PATCH /api/packaging-batches/[id] { weightKgOverride } — ручная поправка
// веса партии упаковки в раскидке стоимости карго (null = обратно на авто).
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAuth();
    assertCan(session.user.role, "shipment.manage");
    const { id } = await ctx.params;
    const body = await req.json();
    const { weightKgOverride } = cargoLineWeightSchema.partial().parse(body);
    const { inKit } = z.object({ inKit: z.boolean().optional() }).parse(body);

    const batch = await prisma.packagingOrderBatch.findUnique({ where: { id } });
    if (!batch) {
      return NextResponse.json({ error: { code: "not_found", message: "Партия упаковки не найдена" } }, { status: 404 });
    }

    await prisma.packagingOrderBatch.update({
      where: { id },
      data: {
        ...(weightKgOverride !== undefined ? { weightKgOverride } : {}),
        ...(inKit !== undefined ? { inKit } : {}),
      },
    });
    // Комплект списывается с Китая при выезде — пересчитать движения карго.
    if (inKit !== undefined && batch.shipmentId) {
      await syncPackagingStockForShipment(batch.shipmentId);
    }
    await logAudit({
      action: "UPDATE",
      entityType: "PackagingOrderBatch",
      entityId: id,
      userId: session.user.id,
      changes: { weightKgOverride, inKit },
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}
