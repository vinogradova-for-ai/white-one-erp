import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, apiError } from "@/server/api-helpers";
import { assertCan } from "@/lib/rbac";
import { orderCreateSchema } from "@/lib/validators/order";
import { calculateOrderEconomics } from "@/lib/calculations/product-cost";
import { Prisma } from "@prisma/client";

async function nextOrderNumber() {
  const year = new Date().getUTCFullYear();
  const last = await prisma.order.findFirst({
    where: { orderNumber: { startsWith: `ORD-${year}-` } },
    orderBy: { orderNumber: "desc" },
    select: { orderNumber: true },
  });
  const lastNum = last ? Number(last.orderNumber.split("-").pop()) : 0;
  const next = String(lastNum + 1).padStart(4, "0");
  return `ORD-${year}-${next}`;
}

export async function GET(req: NextRequest) {
  try {
    await requireAuth();
    const sp = req.nextUrl.searchParams;

    const where: Prisma.OrderWhereInput = { deletedAt: null };
    if (sp.get("status")) where.status = sp.get("status")! as Prisma.OrderWhereInput["status"];
    if (sp.get("orderType")) where.orderType = sp.get("orderType")! as Prisma.OrderWhereInput["orderType"];
    if (sp.get("launchMonth")) where.launchMonth = Number(sp.get("launchMonth"));
    if (sp.get("ownerId")) where.ownerId = sp.get("ownerId")!;
    if (sp.get("factoryId")) where.factoryId = sp.get("factoryId")!;
    if (sp.get("delayed") === "true") where.isDelayed = true;
    if (sp.get("hasIssue") === "true") where.hasIssue = true;

    const page = Math.max(1, Number(sp.get("page") ?? 1));
    const pageSize = Math.min(500, Math.max(1, Number(sp.get("pageSize") ?? 50)));

    const [items, total] = await Promise.all([
      prisma.order.findMany({
        where,
        orderBy: { updatedAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          product: { select: { sku: true, name: true, brand: true, category: true } },
          factory: { select: { id: true, name: true } },
          owner: { select: { id: true, name: true } },
        },
      }),
      prisma.order.count({ where }),
    ]);

    return NextResponse.json({ items, total, page, pageSize, totalPages: Math.ceil(total / pageSize) });
  } catch (e) {
    return apiError(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth();
    assertCan(session.user.role, "order.create");

    const body = await req.json();
    const data = orderCreateSchema.parse(body);

    const product = await prisma.product.findFirst({ where: { id: data.productId, deletedAt: null } });
    if (!product) return NextResponse.json({ error: { code: "not_found", message: "Изделие не найдено" } }, { status: 404 });

    const economics = calculateOrderEconomics(product, data.quantity);

    const order = await prisma.order.create({
      data: {
        orderNumber: await nextOrderNumber(),
        productId: data.productId,
        orderType: data.orderType,
        season: data.season ?? null,
        launchMonth: data.launchMonth,
        quantity: data.quantity,
        factoryId: data.factoryId || product.preferredFactoryId || null,
        ownerId: data.ownerId,
        deliveryMethod: data.deliveryMethod ?? null,
        paymentTerms: data.paymentTerms ?? null,
        prepaymentAmount: data.prepaymentAmount as Prisma.Decimal | null | undefined,
        finalPaymentAmount: data.finalPaymentAmount as Prisma.Decimal | null | undefined,
        packagingType: data.packagingType ?? null,
        notes: data.notes ?? null,
        snapshotFullCost: product.fullCost,
        snapshotWbPrice: product.wbPrice,
        snapshotCustomerPrice: product.customerPrice,
        snapshotWbCommissionPct: product.wbCommissionPct,
        snapshotDrrPct: product.drrPct,
        snapshotRedemptionPct: product.plannedRedemptionPct,
        batchCost: economics.batchCost,
        plannedRevenue: economics.plannedRevenue,
        plannedMargin: economics.plannedMargin,
      },
    });

    await prisma.orderStatusLog.create({
      data: {
        orderId: order.id,
        toStatus: order.status,
        changedById: session.user.id,
        comment: "Создание",
      },
    });

    return NextResponse.json(order, { status: 201 });
  } catch (e) {
    return apiError(e);
  }
}
