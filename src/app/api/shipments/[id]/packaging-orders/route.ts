import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, apiError } from "@/server/api-helpers";
import { assertCan } from "@/lib/rbac";
import { shipmentPackagingOrderSchema } from "@/lib/validators/shipment";
import { logAudit } from "@/server/audit";

// POST /api/shipments/[id]/packaging-orders { packagingOrderId }
// Привязать заказ упаковки к поставке — упаковка едет тем же карго, что одежда.
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

    await prisma.packagingOrder.update({ where: { id: packagingOrderId }, data: { shipmentId } });
    await logAudit({
      action: "UPDATE",
      entityType: "Shipment",
      entityId: shipmentId,
      userId: session.user.id,
      changes: { addedPackagingOrder: po.orderNumber },
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}

// DELETE /api/shipments/[id]/packaging-orders { packagingOrderId } — отвязать.
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAuth();
    assertCan(session.user.role, "shipment.manage");
    const { id: shipmentId } = await ctx.params;
    const { packagingOrderId } = shipmentPackagingOrderSchema.parse(await req.json());

    const po = await prisma.packagingOrder.findFirst({ where: { id: packagingOrderId, shipmentId } });
    if (!po) {
      return NextResponse.json({ error: { code: "not_found", message: "Заказ упаковки не найден в этой поставке" } }, { status: 404 });
    }
    await prisma.packagingOrder.update({ where: { id: packagingOrderId }, data: { shipmentId: null } });
    await logAudit({
      action: "UPDATE",
      entityType: "Shipment",
      entityId: shipmentId,
      userId: session.user.id,
      changes: { removedPackagingOrder: po.orderNumber },
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}
