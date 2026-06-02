// Сохранение позиции карточки фасона на бесконечной доске (/models/board).
// Доска общая на всю команду (кабинет один), поэтому проверки владельца нет —
// двигать карточки может любой залогиненный сотрудник. Меняются только
// косметические поля canvasX/canvasY.
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, apiError } from "@/server/api-helpers";
import { assertCan } from "@/lib/rbac";
import { z } from "zod";

const bodySchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
  // Размер и слой карточки на доске — опционально (приходят при ресайзе / bring-to-front).
  w: z.number().finite().min(80).max(2000).optional(),
  h: z.number().finite().min(80).max(2000).optional(),
  z: z.number().int().optional(),
});

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAuth();
    assertCan(session.user.role, "product.update"); // RBAC: правка карточки фасона
    const { id } = await ctx.params;
    const { x, y, w, h, z } = bodySchema.parse(await req.json());

    const model = await prisma.productModel.findFirst({
      where: { id, deletedAt: null },
      select: { id: true },
    });
    if (!model) return NextResponse.json({ error: { code: "not_found" } }, { status: 404 });

    await prisma.productModel.update({
      where: { id },
      data: {
        canvasX: x,
        canvasY: y,
        ...(w !== undefined ? { canvasW: w } : {}),
        ...(h !== undefined ? { canvasH: h } : {}),
        ...(z !== undefined ? { canvasZ: z } : {}),
      },
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}
