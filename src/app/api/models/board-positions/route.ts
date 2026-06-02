// Массовое сохранение позиций карточек на доске (/models/board).
// Используется кнопкой «Разложить сеткой» — за один запрос обновляем
// координаты всех фасонов сразу. Доска общая, проверки владельца нет.
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, apiError } from "@/server/api-helpers";
import { z } from "zod";

const bodySchema = z.object({
  positions: z
    .array(
      z.object({
        id: z.string().min(1),
        x: z.number().finite(),
        y: z.number().finite(),
        // Размер опционально — «Сеткой» заодно выравнивает размеры карточек.
        w: z.number().finite().min(80).max(2000).optional(),
        h: z.number().finite().min(80).max(2000).optional(),
      }),
    )
    .max(2000),
});

export async function PATCH(req: NextRequest) {
  try {
    await requireAuth();
    const { positions } = bodySchema.parse(await req.json());

    await prisma.$transaction(
      positions.map((p) =>
        prisma.productModel.update({
          where: { id: p.id },
          data: {
            canvasX: p.x,
            canvasY: p.y,
            ...(p.w !== undefined ? { canvasW: p.w } : {}),
            ...(p.h !== undefined ? { canvasH: p.h } : {}),
          },
        }),
      ),
    );

    return NextResponse.json({ ok: true, count: positions.length });
  } catch (e) {
    return apiError(e);
  }
}
