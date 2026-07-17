import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, apiError } from "@/server/api-helpers";
import { assertCan } from "@/lib/rbac";
import {
  shipmentPackagingOrderSchema,
  shipmentRemovePackagingBatchSchema,
} from "@/lib/validators/shipment";
import { ensurePackagingBatchForShipment } from "@/server/packaging-batches";
import { logAudit } from "@/server/audit";

// POST /api/shipments/[id]/packaging-orders { packagingOrderId }
// Привязать заказ упаковки к карго — партия создаётся лениво (17.07: упаковка
// едет частями разными карго, зеркало «добавить заказ в поставку» у одежды).
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAuth();
    assertCan(session.user.role, "shipment.manage");
    const { id: shipmentId } = await ctx.params;
    const { packagingOrderId } = shipmentPackagingOrderSchema.parse(await req.json());

    const shipment = await prisma.shipment.findFirst({ where: { id: shipmentId, deletedAt: null } });
    if (!shipment) {
      return NextResponse.json({ error: { code: "not_found", message: "Поставка не найдена" } }, { status: 404 });
    }
    const po = await prisma.packagingOrder.findUnique({ where: { id: packagingOrderId } });
    if (!po) {
      return NextResponse.json({ error: { code: "not_found", message: "Заказ упаковки не найден" } }, { status: 404 });
    }

    const result = await prisma.$transaction(async (tx) => {
      const batch = await ensurePackagingBatchForShipment(tx, packagingOrderId);
      if (!batch) return null;
      await tx.packagingOrderBatch.update({ where: { id: batch.batchId }, data: { shipmentId } });
      return batch;
    });

    if (!result) {
      return NextResponse.json(
        { error: { code: "no_free_batch", message: "Все партии заказа упаковки уже в карго. Разбейте заказ на партии на его карточке." } },
        { status: 400 },
      );
    }

    await logAudit({
      action: "UPDATE",
      entityType: "Shipment",
      entityId: shipmentId,
      userId: session.user.id,
      changes: { addedPackagingOrder: po.orderNumber, batchId: result.batchId },
    });
    return NextResponse.json({ ok: true, batchId: result.batchId });
  } catch (e) {
    return apiError(e);
  }
}

// DELETE /api/shipments/[id]/packaging-orders { batchId } — убрать партию
// упаковки из карго (партия остаётся, просто без карго).
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAuth();
    assertCan(session.user.role, "shipment.manage");
    const { id: shipmentId } = await ctx.params;
    const { batchId } = shipmentRemovePackagingBatchSchema.parse(await req.json());

    const batch = await prisma.packagingOrderBatch.findFirst({
      where: { id: batchId, shipmentId },
      include: { packagingOrder: { select: { orderNumber: true } } },
    });
    if (!batch) {
      return NextResponse.json({ error: { code: "not_found", message: "Партия упаковки не найдена в этой поставке" } }, { status: 404 });
    }
    await prisma.packagingOrderBatch.update({ where: { id: batchId }, data: { shipmentId: null } });
    await logAudit({
      action: "UPDATE",
      entityType: "Shipment",
      entityId: shipmentId,
      userId: session.user.id,
      changes: { removedPackagingOrder: batch.packagingOrder.orderNumber, batchId },
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}
