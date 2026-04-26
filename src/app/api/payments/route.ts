import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { requireAuth, apiError } from "@/server/api-helpers";
import { assertCan } from "@/lib/rbac";
import { paymentCreateSchema } from "@/lib/validators/payment";

// GET /api/payments?from=2026-04-01&to=2026-05-01&type=ORDER|PACKAGING&status=PENDING|PAID
export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth();
    assertCan(session.user.role, "payment.read");

    const { searchParams } = new URL(req.url);
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const type = searchParams.get("type");
    const status = searchParams.get("status");

    const where: Prisma.PaymentWhereInput = {};
    if (from || to) {
      where.plannedDate = {};
      if (from) (where.plannedDate as Prisma.DateTimeFilter).gte = new Date(from);
      if (to) (where.plannedDate as Prisma.DateTimeFilter).lt = new Date(to);
    }
    if (type === "ORDER" || type === "PACKAGING") where.type = type;
    if (status === "PENDING" || status === "PAID") where.status = status;

    const payments = await prisma.payment.findMany({
      where,
      orderBy: { plannedDate: "asc" },
      take: 500,
      include: {
        order: {
          select: {
            id: true,
            orderNumber: true,
            productModel: { select: { name: true } },
            lines: {
              select: { productVariant: { select: { colorName: true } } },
              take: 3,
            },
          },
        },
        factory: { select: { id: true, name: true } },
        packagingItem: { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true } },
        paidBy: { select: { id: true, name: true } },
      },
    });
    return NextResponse.json(payments);
  } catch (e) {
    return apiError(e);
  }
}

// POST /api/payments — ручное создание (обычно для упаковки или произвольного платежа по заказу)
export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth();
    assertCan(session.user.role, "payment.create");

    const data = paymentCreateSchema.parse(await req.json());

    // Логика целостности: для ORDER — нужен orderId. Для PACKAGING — желательно supplierName или packagingItemId.
    if (data.type === "ORDER" && !data.orderId) {
      return NextResponse.json(
        { error: { code: "bad_request", message: "Для платежа по заказу нужен orderId" } },
        { status: 400 },
      );
    }

    // Подтянем factoryId из заказа, если не передан явно.
    let factoryId = data.factoryId ?? null;
    if (data.type === "ORDER" && data.orderId && !factoryId) {
      const o = await prisma.order.findUnique({ where: { id: data.orderId }, select: { factoryId: true } });
      factoryId = o?.factoryId ?? null;
    }

    const payment = await prisma.payment.create({
      data: {
        type: data.type,
        plannedDate: new Date(data.plannedDate),
        amount: data.amount,
        currency: data.currency ?? "RUB",
        label: data.label,
        invoiceUrl: data.invoiceUrl ?? null,
        notes: data.notes ?? null,
        orderId: data.orderId ?? null,
        factoryId,
        packagingItemId: data.packagingItemId ?? null,
        supplierName: data.supplierName ?? null,
        createdById: session.user.id,
      },
    });
    return NextResponse.json(payment, { status: 201 });
  } catch (e) {
    return apiError(e);
  }
}
