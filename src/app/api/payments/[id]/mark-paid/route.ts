import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, apiError } from "@/server/api-helpers";
import { assertCan } from "@/lib/rbac";
import { paymentMarkPaidSchema } from "@/lib/validators/payment";

// POST /api/payments/[id]/mark-paid { paidAt? }
// Отмечает платёж как оплаченный. Если paidAt не передан — ставим сейчас.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAuth();
    assertCan(session.user.role, "payment.markPaid");
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const data = paymentMarkPaidSchema.parse(body);

    const updated = await prisma.payment.update({
      where: { id },
      data: {
        status: "PAID",
        paidAt: data.paidAt ? new Date(data.paidAt) : new Date(),
        paidById: session.user.id,
      },
    });
    return NextResponse.json(updated);
  } catch (e) {
    return apiError(e);
  }
}

// DELETE /api/payments/[id]/mark-paid — откат в PENDING
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAuth();
    assertCan(session.user.role, "payment.markPaid");
    const { id } = await params;
    const updated = await prisma.payment.update({
      where: { id },
      data: { status: "PENDING", paidAt: null, paidById: null },
    });
    return NextResponse.json(updated);
  } catch (e) {
    return apiError(e);
  }
}
