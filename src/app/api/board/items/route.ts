// Свободные элементы доски фасонов (/models/board): текст / стикер / картинка.
// Доска общая на команду — создавать и менять может любой залогиненный сотрудник.
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, apiError } from "@/server/api-helpers";
import { z } from "zod";

const createSchema = z.object({
  type: z.enum(["TEXT", "STICKY", "IMAGE"]),
  x: z.number().finite(),
  y: z.number().finite(),
  w: z.number().finite().min(20).max(4000),
  h: z.number().finite().min(20).max(4000),
  z: z.number().int().optional(),
  text: z.string().max(5000).optional().nullable(),
  color: z.string().max(20).optional().nullable(),
  fontSize: z.number().int().min(6).max(400).optional().nullable(),
  fontWeight: z.number().int().optional().nullable(),
  align: z.enum(["left", "center", "right"]).optional().nullable(),
  fontFamily: z.string().max(40).optional().nullable(),
  imageUrl: z.string().max(2000).optional().nullable(),
});

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth();
    const data = createSchema.parse(await req.json());

    const item = await prisma.boardItem.create({
      data: {
        type: data.type,
        x: data.x,
        y: data.y,
        w: data.w,
        h: data.h,
        z: data.z ?? 0,
        text: data.text ?? null,
        color: data.color ?? null,
        fontSize: data.fontSize ?? null,
        fontWeight: data.fontWeight ?? null,
        align: data.align ?? null,
        fontFamily: data.fontFamily ?? null,
        imageUrl: data.imageUrl ?? null,
        createdById: session.user.id,
      },
    });

    return NextResponse.json({ item });
  } catch (e) {
    return apiError(e);
  }
}
