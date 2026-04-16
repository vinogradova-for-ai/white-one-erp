import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, apiError } from "@/server/api-helpers";
import { assertCan } from "@/lib/rbac";
import { orderCreateSchema } from "@/lib/validators/order";
import { calculateOrderEconomics } from "@/lib/calculations/product-cost";

async function nextOrderNumber() {
  const year = new Date().getUTCFullYear();
  const last = await prisma.order.findFirst({
    where: { orderNumber: { startsWith: `ORD-${year}-` } },
    orderBy: { orderNumber: "desc" },
    select: { orderNumber: true },
  });
  const lastNum = last ? Number(last.orderNumber.split("-").pop()) : 0;
  return `ORD-${year}-${String(lastNum + 1).padStart(4, "0")}`;
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth();
    assertCan(session.user.role, "order.create");
    const data = orderCreateSchema.parse(await req.json());

    const variant = await prisma.productVariant.findFirst({
      where: { id: data.productVariantId, deletedAt: null },
      include: { productModel: true },
    });
    if (!variant) return NextResponse.json({ error: { code: "not_found", message: "Вариант не найден" } }, { status: 404 });

    const eco = calculateOrderEconomics(variant, data.quantity);

    const order = await prisma.order.create({
      data: {
        orderNumber: await nextOrderNumber(),
        productVariantId: data.productVariantId,
        orderType: data.orderType,
        season: data.season ?? null,
        launchMonth: data.launchMonth,
        quantity: data.quantity,
        sizeDistribution: data.sizeDistribution ?? undefined,
        factoryId: data.factoryId || variant.productModel.preferredFactoryId || null,
        ownerId: data.ownerId,
        deliveryMethod: data.deliveryMethod ?? null,
        paymentTerms: data.paymentTerms ?? null,
        packagingType: data.packagingType ?? null,
        notes: data.notes ?? null,
        snapshotFullCost: variant.fullCost,
        snapshotWbPrice: variant.wbPrice,
        snapshotCustomerPrice: variant.customerPrice,
        snapshotWbCommissionPct: variant.wbCommissionPct,
        snapshotDrrPct: variant.drrPct,
        snapshotRedemptionPct: variant.plannedRedemptionPct,
        batchCost: eco.batchCost,
        plannedRevenue: eco.plannedRevenue,
        plannedMargin: eco.plannedMargin,
      },
    });
    await prisma.orderStatusLog.create({
      data: { orderId: order.id, toStatus: order.status, changedById: session.user.id, comment: "Создание" },
    });
    return NextResponse.json(order, { status: 201 });
  } catch (e) {
    return apiError(e);
  }
}
