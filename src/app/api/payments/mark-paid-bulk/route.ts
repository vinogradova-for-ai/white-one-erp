import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, apiError } from "@/server/api-helpers";
import { assertCan } from "@/lib/rbac";
import { paymentMarkPaidBulkSchema } from "@/lib/validators/payment";
import { logAudit } from "@/server/audit";

// POST /api/payments/mark-paid-bulk { ids: string[], paidAt? }
// Массовая отметка «оплачено» для выбранных платежей (чекбоксы в «Предстоящих»).
// Идемпотентно: платежи, уже в статусе PAID, пропускаются (не перебиваем paidAt).
export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth();
    assertCan(session.user.role, "payment.markPaid");
    const body = await req.json().catch(() => ({}));
    const { ids, paidAt } = paymentMarkPaidBulkSchema.parse(body);
    const when = paidAt ? new Date(paidAt) : new Date();

    // Отмечаем только реально ожидающие — уже оплаченные не трогаем.
    const targets = await prisma.payment.findMany({
      where: { id: { in: ids }, status: "PENDING" },
      select: { id: true },
    });
    if (targets.length === 0) return NextResponse.json({ count: 0 });
    const targetIds = targets.map((t) => t.id);

    await prisma.payment.updateMany({
      where: { id: { in: targetIds } },
      data: { status: "PAID", paidAt: when, paidById: session.user.id },
    });
    await Promise.all(
      targetIds.map((id) =>
        logAudit({
          action: "STATUS_CHANGE",
          entityType: "Payment",
          entityId: id,
          userId: session.user.id,
          changes: { to: "PAID" },
        }),
      ),
    );
    return NextResponse.json({ count: targetIds.length });
  } catch (e) {
    return apiError(e);
  }
}
