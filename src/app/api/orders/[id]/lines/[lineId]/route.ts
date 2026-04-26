import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, apiError } from "@/server/api-helpers";
import { assertCan } from "@/lib/rbac";
import { orderLineUpdateSchema } from "@/lib/validators/order";
import { calculateOrderEconomics } from "@/lib/calculations/product-cost";

// PATCH /api/orders/[id]/lines/[lineId]
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; lineId: string }> },
) {
  try {
    const session = await requireAuth();
    assertCan(session.user.role, "order.update");
    const { id, lineId } = await params;

    const data = orderLineUpdateSchema.parse(await req.json());

    const line = await prisma.orderLine.findFirst({
      where: { id: lineId, orderId: id },
      include: { order: { include: { productModel: true } } },
    });
    if (!line) return NextResponse.json({ error: { code: "not_found" } }, { status: 404 });

    const patch: Record<string, unknown> = {};
    if (data.sizeDistribution !== undefined) patch.sizeDistribution = data.sizeDistribution ?? undefined;
    if (data.sizeDistributionActual !== undefined) patch.sizeDistributionActual = data.sizeDistributionActual ?? undefined;
    if (data.quantity !== undefined) {
      const eco = calculateOrderEconomics(line.order.productModel, data.quantity);
      patch.quantity = data.quantity;
      patch.batchCost = eco.batchCost;
      patch.plannedRevenue = eco.plannedRevenue;
      patch.plannedMargin = eco.plannedMargin;
    }

    const updated = await prisma.orderLine.update({ where: { id: lineId }, data: patch });
    return NextResponse.json(updated);
  } catch (e) {
    return apiError(e);
  }
}

// DELETE /api/orders/[id]/lines/[lineId]
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; lineId: string }> },
) {
  try {
    const session = await requireAuth();
    assertCan(session.user.role, "order.update");
    const { id, lineId } = await params;

    // Не даём удалить последнюю позицию — заказ должен иметь хотя бы одну.
    const count = await prisma.orderLine.count({ where: { orderId: id } });
    if (count <= 1) {
      return NextResponse.json(
        { error: { code: "bad_request", message: "Нельзя удалить последнюю позицию заказа" } },
        { status: 400 },
      );
    }

    await prisma.orderLine.delete({ where: { id: lineId } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}
