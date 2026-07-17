import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth, apiError } from "@/server/api-helpers";
import { assertCan } from "@/lib/rbac";
import { adjustPackagingStock } from "@/server/packaging-stock";
import { logAudit } from "@/server/audit";

// Инвентаризация упаковки: довести остаток склада (Китай/Москва) до факта.
const schema = z.object({
  warehouse: z.enum(["CN", "MSK"]),
  actualQty: z.number().int().min(0),
  note: z.string().max(300).optional().nullable(),
});

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAuth();
    assertCan(session.user.role, "packaging.manage");
    const { id } = await ctx.params;
    const data = schema.parse(await req.json());

    const item = await prisma.packagingItem.findUnique({ where: { id }, select: { id: true, name: true } });
    if (!item) {
      return NextResponse.json({ error: { code: "not_found", message: "Позиция упаковки не найдена" } }, { status: 404 });
    }

    await adjustPackagingStock({
      packagingItemId: id,
      warehouse: data.warehouse,
      actualQty: data.actualQty,
      note: data.note ?? null,
      actorId: session.user.id,
    });

    await logAudit({
      action: "UPDATE",
      entityType: "PackagingItem",
      entityId: id,
      userId: session.user.id,
      changes: { inventory: data.warehouse, actualQty: data.actualQty },
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}
