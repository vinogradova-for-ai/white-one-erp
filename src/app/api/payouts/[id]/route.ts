import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, apiError } from "@/server/api-helpers";
import { assertCan } from "@/lib/rbac";
import { logAudit } from "@/server/audit";

// DELETE /api/payouts/[id] — мягкое удаление оплаты.
// Право payment.delete = только OWNER/DIRECTOR. Разнесения при этом гаснут:
// physically мы их удаляем (allocations хранятся только у живой оплаты), поэтому
// подсчёт «оплачено фактом» смотрит на payout.deletedAt=null — плановые платежи
// снова становятся открытыми.
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAuth();
    assertCan(session.user.role, "payment.delete");
    const { id } = await params;

    const existing = await prisma.factoryPayout.findUnique({
      where: { id },
      select: { id: true, amount: true, deletedAt: true, factory: { select: { name: true } } },
    });
    if (!existing || existing.deletedAt) {
      return NextResponse.json({ error: { code: "not_found", message: "Оплата не найдена" } }, { status: 404 });
    }

    await prisma.factoryPayout.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    await logAudit({
      action: "DELETE",
      entityType: "FactoryPayout",
      entityId: id,
      userId: session.user.id,
      changes: { amount: existing.amount.toString(), factory: existing.factory.name },
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}
