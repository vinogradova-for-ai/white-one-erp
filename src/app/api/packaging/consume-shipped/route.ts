import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, apiError } from "@/server/api-helpers";
import { assertCan } from "@/lib/rbac";
import { logAudit } from "@/server/audit";

// POST /api/packaging/consume-shipped — разовое списание «неучтённого расхода»:
// заказы уже отгружены на WB / в продаже, а их упаковка так и не списана со
// склада (упакованы до внедрения списания, или списание вернулось багом
// «возврат при отгрузке»). Идемпотентно: помечает consumedQty, второй клик
// ничего не спишет. Кнопка на /packaging видна только при наличии таких строк.
export async function POST() {
  try {
    const session = await requireAuth();
    assertCan(session.user.role, "packaging.manage");

    const usages = await prisma.orderPackaging.findMany({
      where: {
        consumedQty: null,
        order: { deletedAt: null, status: { in: ["SHIPPED_WB", "ON_SALE"] } },
      },
      select: {
        id: true,
        packagingItemId: true,
        quantityPerUnit: true,
        order: { select: { lines: { select: { quantity: true } } } },
      },
    });

    let totalConsumed = 0;
    const byItem = new Map<string, number>();

    await prisma.$transaction(async (tx) => {
      for (const u of usages) {
        const orderQty = u.order.lines.reduce((a, l) => a + l.quantity, 0);
        const need = Math.ceil(orderQty * Number(u.quantityPerUnit));
        if (need <= 0) continue;
        await tx.orderPackaging.update({ where: { id: u.id }, data: { consumedQty: need } });
        byItem.set(u.packagingItemId, (byItem.get(u.packagingItemId) ?? 0) + need);
        totalConsumed += need;
      }
      for (const [itemId, qty] of byItem) {
        // Не уводим остаток в минус: если Алёна уже поправила склад руками,
        // списываем что есть (различие — на её ручной корректировке).
        const item = await tx.packagingItem.findUnique({ where: { id: itemId }, select: { stock: true } });
        const newStock = Math.max(0, (item?.stock ?? 0) - qty);
        await tx.packagingItem.update({ where: { id: itemId }, data: { stock: newStock } });
      }
    });

    await logAudit({
      action: "UPDATE",
      entityType: "PackagingItem",
      entityId: "consume-shipped",
      userId: session.user.id,
      changes: { consumedRows: usages.length, totalConsumed },
    });

    return NextResponse.json({ ok: true, rows: usages.length, totalConsumed });
  } catch (e) {
    return apiError(e);
  }
}
