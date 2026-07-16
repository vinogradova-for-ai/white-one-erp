import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth, apiError } from "@/server/api-helpers";
import { assertCan } from "@/lib/rbac";
import { logAudit } from "@/server/audit";

// POST /api/packaging/[id]/write-off — ручное списание со склада упаковки
// (переупаковка, брак, потеря). Не привязано к заказу: авто-списание под заказы
// делает changeOrderStatus при входе в PACKING. Причина обязательна — она
// попадает в аудит и показывается в «Движениях склада» карточки упаковки.
const writeOffSchema = z.object({
  qty: z.number().int().min(1),
  reason: z.string().trim().min(1, "Укажите причину — на что списываем"),
});

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAuth();
    assertCan(session.user.role, "packaging.manage");
    const { id } = await ctx.params;
    const { qty, reason } = writeOffSchema.parse(await req.json());

    const item = await prisma.packagingItem.findUnique({ where: { id }, select: { stock: true } });
    if (!item) return NextResponse.json({ error: { code: "not_found" } }, { status: 404 });
    if (qty > item.stock) {
      return NextResponse.json(
        {
          error: {
            code: "not_enough_stock",
            message: `На складе ${item.stock.toLocaleString("ru-RU")} шт — списать ${qty.toLocaleString("ru-RU")} нельзя. Если остаток в системе неверный, сначала поправьте его в карточке.`,
          },
        },
        { status: 400 },
      );
    }

    const updated = await prisma.packagingItem.update({
      where: { id },
      data: { stock: item.stock - qty },
    });
    await logAudit({
      action: "UPDATE",
      entityType: "PackagingItem",
      entityId: id,
      userId: session.user.id,
      changes: { writeOff: qty, reason, stockBefore: item.stock, stockAfter: updated.stock },
    });
    return NextResponse.json({ ok: true, stock: updated.stock });
  } catch (e) {
    return apiError(e);
  }
}
