import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, apiError } from "@/server/api-helpers";
import { assertCan } from "@/lib/rbac";
import { shipmentAddOrderSchema, shipmentRemoveBatchSchema } from "@/lib/validators/shipment";
import { attachOrderToShipmentQty } from "@/server/batches";
import { syncOrderDatesFromCargo } from "@/server/sync-order-dates-from-cargo";
import { logAudit } from "@/server/audit";

// Добавить заказ в поставку — партия создаётся лениво (см. ensureBatchForShipment).
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAuth();
    assertCan(session.user.role, "shipment.manage");
    const { id: shipmentId } = await ctx.params;
    const { orderId, qty } = shipmentAddOrderSchema.parse(await req.json());

    const shipment = await prisma.shipment.findFirst({ where: { id: shipmentId, deletedAt: null } });
    if (!shipment) {
      return NextResponse.json({ error: { code: "not_found", message: "Поставка не найдена" } }, { status: 404 });
    }
    const order = await prisma.order.findFirst({ where: { id: orderId, deletedAt: null } });
    if (!order) {
      return NextResponse.json({ error: { code: "not_found", message: "Заказ не найден" } }, { status: 404 });
    }

    const result = await prisma.$transaction(async (tx) =>
      attachOrderToShipmentQty(tx, orderId, shipmentId, qty ?? null),
    );

    if (!result) {
      return NextResponse.json(
        { error: { code: "no_free_batch", message: "Все партии заказа уже в поставках. Разбейте заказ на партии на его карточке." } },
        { status: 400 },
      );
    }

    await logAudit({
      action: "UPDATE",
      entityType: "Shipment",
      entityId: shipmentId,
      userId: session.user.id,
      changes: { addedOrder: orderId, batchId: result.batchId, movedQty: result.movedQty, leftQty: result.leftQty },
    });

    await syncOrderDatesFromCargo([orderId], session.user.id);

    return NextResponse.json({ ok: true, batchId: result.batchId });
  } catch (e) {
    return apiError(e);
  }
}

// Убрать партию из поставки (партия остаётся, просто без поставки).
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAuth();
    assertCan(session.user.role, "shipment.manage");
    const { id: shipmentId } = await ctx.params;
    const { batchId } = shipmentRemoveBatchSchema.parse(await req.json());

    const batch = await prisma.orderBatch.findFirst({ where: { id: batchId, shipmentId } });
    if (!batch) {
      return NextResponse.json({ error: { code: "not_found", message: "Партия не найдена в этой поставке" } }, { status: 404 });
    }
    if (batch.receivedAt) {
      return NextResponse.json(
        { error: { code: "already_received", message: "Партия уже принята — убрать нельзя" } },
        { status: 400 },
      );
    }

    await prisma.orderBatch.update({ where: { id: batchId }, data: { shipmentId: null } });

    await logAudit({
      action: "UPDATE",
      entityType: "Shipment",
      entityId: shipmentId,
      userId: session.user.id,
      changes: { removedBatch: batchId },
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}
