import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuth, apiError } from "@/server/api-helpers";
import { assertCan } from "@/lib/rbac";
import { generatePaymentsForOrder } from "@/lib/payments/generate-for-order";

// POST /api/orders/[id]/regenerate-payments
// Удаляет PENDING-платежи по заказу и создаёт их заново по текущим paymentTerms/batchCost.
// Оплаченные (PAID) платежи НЕ трогает.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAuth();
    assertCan(session.user.role, "order.update");
    const { id } = await params;

    const order = await prisma.order.findFirst({
      where: { id, deletedAt: null },
      select: {
        id: true,
        paymentTerms: true,
        factoryId: true,
        createdAt: true,
        readyAtFactoryDate: true,
        launchMonth: true,
        lines: { select: { batchCost: true } },
      },
    });
    if (!order) {
      return NextResponse.json({ error: { code: "not_found", message: "Заказ не найден" } }, { status: 404 });
    }

    await prisma.payment.deleteMany({
      where: { orderId: id, status: "PENDING" },
    });

    const totalBatchCost = order.lines.reduce((a, l) => a + Number(l.batchCost ?? 0), 0);
    const generated = generatePaymentsForOrder({
      id: order.id,
      paymentTerms: order.paymentTerms,
      batchCost: totalBatchCost > 0 ? new Prisma.Decimal(totalBatchCost) : null,
      factoryId: order.factoryId,
      createdAt: order.createdAt,
      readyAtFactoryDate: order.readyAtFactoryDate,
      launchMonth: order.launchMonth,
    });
    if (generated.length > 0) {
      await prisma.payment.createMany({
        data: generated.map((p) => ({
          type: p.type,
          plannedDate: p.plannedDate,
          amount: p.amount,
          label: p.label,
          notes: p.notes,
          orderId: p.orderId,
          factoryId: p.factoryId,
          createdById: session.user.id,
        })),
      });
    }

    const payments = await prisma.payment.findMany({
      where: { orderId: id },
      orderBy: { plannedDate: "asc" },
    });
    return NextResponse.json(payments);
  } catch (e) {
    return apiError(e);
  }
}
