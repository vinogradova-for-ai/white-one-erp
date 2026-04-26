import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, apiError } from "@/server/api-helpers";
import { assertCan } from "@/lib/rbac";
import { paymentUpdateSchema } from "@/lib/validators/payment";

// PATCH /api/payments/[id]
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAuth();
    assertCan(session.user.role, "payment.update");
    const { id } = await params;

    const data = paymentUpdateSchema.parse(await req.json());

    const updated = await prisma.payment.update({
      where: { id },
      data: {
        ...(data.plannedDate !== undefined ? { plannedDate: new Date(data.plannedDate) } : {}),
        ...(data.amount !== undefined ? { amount: data.amount } : {}),
        ...(data.label !== undefined ? { label: data.label } : {}),
        ...(data.notes !== undefined ? { notes: data.notes } : {}),
        ...(data.supplierName !== undefined ? { supplierName: data.supplierName } : {}),
        ...(data.invoiceUrl !== undefined ? { invoiceUrl: data.invoiceUrl } : {}),
      },
    });
    return NextResponse.json(updated);
  } catch (e) {
    return apiError(e);
  }
}

// DELETE /api/payments/[id] — только админ (RBAC пропустит только их)
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAuth();
    assertCan(session.user.role, "payment.delete");
    const { id } = await params;
    await prisma.payment.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}
