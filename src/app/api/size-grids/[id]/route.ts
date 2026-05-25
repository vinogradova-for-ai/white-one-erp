import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, apiError } from "@/server/api-helpers";
import { z } from "zod";

const sizeGridUpdateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  sizes: z.array(z.string().min(1)).min(1).optional(),
  notes: z.string().nullable().optional(),
});

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireAuth();
    const { id } = await ctx.params;
    const grid = await prisma.sizeGrid.findUnique({
      where: { id },
      include: { _count: { select: { models: true } } },
    });
    if (!grid) return NextResponse.json({ error: { code: "not_found" } }, { status: 404 });
    return NextResponse.json(grid);
  } catch (e) {
    return apiError(e);
  }
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAuth();
    if (session.user.role !== "OWNER" && session.user.role !== "DIRECTOR") {
      return NextResponse.json({ error: { code: "forbidden" } }, { status: 403 });
    }
    const { id } = await ctx.params;
    const data = sizeGridUpdateSchema.parse(await req.json());

    if (data.sizes) {
      data.sizes = Array.from(new Set(data.sizes.map((s) => s.trim()).filter(Boolean)));
      if (data.sizes.length === 0) {
        return NextResponse.json({ error: { code: "validation", message: "Пустой список размеров" } }, { status: 400 });
      }
    }
    const updated = await prisma.sizeGrid.update({ where: { id }, data });
    return NextResponse.json(updated);
  } catch (e) {
    return apiError(e);
  }
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAuth();
    if (session.user.role !== "OWNER" && session.user.role !== "DIRECTOR") {
      return NextResponse.json({ error: { code: "forbidden" } }, { status: 403 });
    }
    const { id } = await ctx.params;
    const grid = await prisma.sizeGrid.findUnique({
      where: { id },
      include: { _count: { select: { models: true } } },
    });
    if (!grid) return NextResponse.json({ error: { code: "not_found" } }, { status: 404 });
    if (grid._count.models > 0) {
      return NextResponse.json(
        { error: { code: "conflict", message: `Сетка используется в ${grid._count.models} фасонах — удалить нельзя` } },
        { status: 409 },
      );
    }
    await prisma.sizeGrid.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}
