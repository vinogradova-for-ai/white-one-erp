import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, apiError } from "@/server/api-helpers";
import { assertCan } from "@/lib/rbac";
import { orderLineAddSchema } from "@/lib/validators/order";
import { calculateOrderEconomics } from "@/lib/calculations/product-cost";

// POST /api/orders/[id]/lines — добавить позицию (цвет) в заказ
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAuth();
    assertCan(session.user.role, "order.update");
    const { id } = await params;

    const data = orderLineAddSchema.parse(await req.json());

    const order = await prisma.order.findFirst({
      where: { id, deletedAt: null },
      include: { productModel: true },
    });
    if (!order) return NextResponse.json({ error: { code: "not_found" } }, { status: 404 });

    // Проверяем что вариант принадлежит фасону заказа
    const variant = await prisma.productVariant.findFirst({
      where: { id: data.productVariantId, deletedAt: null, productModelId: order.productModelId },
    });
    if (!variant) {
      return NextResponse.json(
        { error: { code: "bad_request", message: "Цвет относится к другому фасону" } },
        { status: 400 },
      );
    }

    const eco = calculateOrderEconomics(order.productModel, data.quantity);

    const line = await prisma.orderLine.create({
      data: {
        orderId: id,
        productVariantId: data.productVariantId,
        quantity: data.quantity,
        sizeDistribution: data.sizeDistribution ?? undefined,
        snapshotFullCost: order.productModel.fullCost,
        snapshotWbPrice: order.productModel.wbPrice,
        snapshotCustomerPrice: order.productModel.customerPrice,
        snapshotWbCommissionPct: order.productModel.wbCommissionPct,
        snapshotDrrPct: order.productModel.drrPct,
        snapshotRedemptionPct: order.productModel.plannedRedemptionPct,
        batchCost: eco.batchCost,
        plannedRevenue: eco.plannedRevenue,
        plannedMargin: eco.plannedMargin,
      },
    });
    return NextResponse.json(line, { status: 201 });
  } catch (e) {
    return apiError(e);
  }
}
