import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, apiError } from "@/server/api-helpers";
import { assertCan } from "@/lib/rbac";
import { shipmentUpdateSchema } from "@/lib/validators/shipment";
import { logAudit } from "@/server/audit";

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAuth();
    assertCan(session.user.role, "shipment.manage");
    const { id } = await ctx.params;
    const data = shipmentUpdateSchema.parse(await req.json());

    const existing = await prisma.shipment.findFirst({ where: { id, deletedAt: null } });
    if (!existing) {
      return NextResponse.json({ error: { code: "not_found", message: "Поставка не найдена" } }, { status: 404 });
    }

    const shipment = await prisma.shipment.update({
      where: { id },
      data: {
        ...(data.carrier !== undefined ? { carrier: data.carrier } : {}),
        ...(data.comment !== undefined ? { comment: data.comment } : {}),
        ...(data.departDate !== undefined ? { departDate: data.departDate ? new Date(data.departDate) : null } : {}),
        ...(data.arriveDate !== undefined ? { arriveDate: data.arriveDate ? new Date(data.arriveDate) : null } : {}),
      },
    });

    await logAudit({
      action: "UPDATE",
      entityType: "Shipment",
      entityId: id,
      userId: session.user.id,
      changes: data,
    });

    return NextResponse.json({ shipment });
  } catch (e) {
    return apiError(e);
  }
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAuth();
    // Мягкое удаление поставки — только OWNER/DIRECTOR.
    assertCan(session.user.role, "shipment.delete");
    const { id } = await ctx.params;

    const existing = await prisma.shipment.findFirst({ where: { id, deletedAt: null } });
    if (!existing) {
      return NextResponse.json({ error: { code: "not_found", message: "Поставка не найдена" } }, { status: 404 });
    }

    // Отвязываем партии от поставки (SetNull) и мягко гасим поставку.
    await prisma.$transaction(async (tx) => {
      await tx.orderBatch.updateMany({ where: { shipmentId: id }, data: { shipmentId: null } });
      await tx.shipment.update({ where: { id }, data: { deletedAt: new Date() } });
    });

    await logAudit({
      action: "DELETE",
      entityType: "Shipment",
      entityId: id,
      userId: session.user.id,
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}
