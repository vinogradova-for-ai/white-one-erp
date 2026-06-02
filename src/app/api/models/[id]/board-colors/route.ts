// Сохранение раскладки фасона на доске коллекции «Раскладка по цветам».
// Доска общая на команду (кабинет один) — проверки владельца нет, как у
// canvas-position. Меняются только косметические поля boardColors/collectionOrder.
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, apiError } from "@/server/api-helpers";
import { z } from "zod";

const bodySchema = z.object({
  // Список hex-цветов, выложенных для фасона (пусто = убрать фасон с доски).
  boardColors: z.array(z.string().regex(/^#[0-9a-fA-F]{6}$/)).max(40).optional(),
  // Порядок ряда на доске (drag-сортировка). null = сбросить в авто.
  collectionOrder: z.number().int().nullable().optional(),
});

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireAuth();
    const { id } = await ctx.params;
    const body = bodySchema.parse(await req.json());

    const model = await prisma.productModel.findFirst({
      where: { id, deletedAt: null },
      select: { id: true },
    });
    if (!model) return NextResponse.json({ error: { code: "not_found" } }, { status: 404 });

    await prisma.productModel.update({
      where: { id },
      data: {
        ...(body.boardColors !== undefined ? { boardColors: body.boardColors } : {}),
        ...(body.collectionOrder !== undefined ? { collectionOrder: body.collectionOrder } : {}),
      },
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}
