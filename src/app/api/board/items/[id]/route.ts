// Обновление / удаление свободного элемента доски (/models/board).
// Доска общая на команду — без проверки владельца.
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, apiError } from "@/server/api-helpers";
import { assertCan } from "@/lib/rbac";
import { z } from "zod";

const patchSchema = z.object({
  x: z.number().finite().optional(),
  y: z.number().finite().optional(),
  w: z.number().finite().min(20).max(4000).optional(),
  h: z.number().finite().min(20).max(4000).optional(),
  z: z.number().int().optional(),
  rotation: z.number().finite().optional(),
  text: z.string().max(5000).optional().nullable(),
  color: z.string().max(20).optional().nullable(),
  fontSize: z.number().int().min(6).max(400).optional().nullable(),
  fontWeight: z.number().int().optional().nullable(),
  align: z.enum(["left", "center", "right"]).optional().nullable(),
  fontFamily: z.string().max(40).optional().nullable(),
  imageUrl: z.string().max(2000).optional().nullable(),
});

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAuth();
    assertCan(session.user.role, "product.update"); // гард RBAC
    const { id } = await ctx.params;
    const data = patchSchema.parse(await req.json());

    const existing = await prisma.boardItem.findFirst({
      where: { id, deletedAt: null },
      select: { id: true },
    });
    if (!existing) return NextResponse.json({ error: { code: "not_found" } }, { status: 404 });

    const item = await prisma.boardItem.update({ where: { id }, data });
    return NextResponse.json({ item });
  } catch (e) {
    return apiError(e);
  }
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAuth();
    assertCan(session.user.role, "product.update"); // гард RBAC
    const { id } = await ctx.params;

    const existing = await prisma.boardItem.findFirst({
      where: { id, deletedAt: null },
      select: { id: true },
    });
    if (!existing) return NextResponse.json({ error: { code: "not_found" } }, { status: 404 });

    await prisma.boardItem.update({ where: { id }, data: { deletedAt: new Date() } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}
