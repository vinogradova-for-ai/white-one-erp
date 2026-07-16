import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, apiError } from "@/server/api-helpers";
import { assertCan } from "@/lib/rbac";
import { shipmentStatusChangeSchema } from "@/lib/validators/shipment";
import { syncOrdersOnShipmentDepart } from "@/server/batches";
import { logAudit } from "@/server/audit";

// Смена статуса поставки. Переход в IN_TRANSIT проставляет departDate и двигает
// заказы, у которых ВСЕ партии уехали/приняты, в IN_TRANSIT (через changeOrderStatus).
// Переход в ARRIVED проставляет arriveDate. RECEIVED — ручная отметка «принята вся».
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAuth();
    assertCan(session.user.role, "shipment.manage");
    const { id } = await ctx.params;
    const { status } = shipmentStatusChangeSchema.parse(await req.json());

    const existing = await prisma.shipment.findFirst({ where: { id, deletedAt: null } });
    if (!existing) {
      return NextResponse.json({ error: { code: "not_found", message: "Поставка не найдена" } }, { status: 404 });
    }
    if (existing.status === status) {
      return NextResponse.json({ error: { code: "no_change", message: "Статус не изменился" } }, { status: 400 });
    }

    const now = new Date();
    await prisma.shipment.update({
      where: { id },
      data: {
        status,
        // Проставляем даты при первом входе в статус, не затирая уже проставленные.
        ...(status === "IN_TRANSIT" && !existing.departDate ? { departDate: now } : {}),
        ...(status === "ARRIVED" && !existing.arriveDate ? { arriveDate: now } : {}),
      },
    });

    await logAudit({
      action: "STATUS_CHANGE",
      entityType: "Shipment",
      entityId: id,
      userId: session.user.id,
      changes: { from: existing.status, to: status },
    });

    // Выезд поставки — двигаем заказы вперёд по циклу (после коммита поставки).
    if (status === "IN_TRANSIT") {
      await syncOrdersOnShipmentDepart({
        shipmentId: id,
        actorId: session.user.id,
        actorRole: session.user.role,
      });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}
