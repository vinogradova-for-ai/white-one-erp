import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, apiError } from "@/server/api-helpers";
import { z } from "zod";

const sizeGridCreateSchema = z.object({
  name: z.string().min(1, "Название обязательно").max(100),
  sizes: z.array(z.string().min(1)).min(1, "Нужен минимум один размер"),
  notes: z.string().optional().nullable(),
});

export async function GET() {
  try {
    await requireAuth();
    const items = await prisma.sizeGrid.findMany({ orderBy: { name: "asc" } });
    return NextResponse.json({ items });
  } catch (e) {
    return apiError(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireAuth();
    const data = sizeGridCreateSchema.parse(await req.json());
    // Нормализуем размеры — trim и без дубликатов
    const sizes = Array.from(new Set(data.sizes.map((s) => s.trim()).filter(Boolean)));
    if (sizes.length === 0) {
      return NextResponse.json(
        { error: { code: "validation", message: "Пустой список размеров" } },
        { status: 400 },
      );
    }
    const existing = await prisma.sizeGrid.findUnique({ where: { name: data.name } });
    if (existing) {
      return NextResponse.json(
        { error: { code: "conflict", message: "Размерная сетка с таким названием уже есть" } },
        { status: 409 },
      );
    }
    const grid = await prisma.sizeGrid.create({
      data: { name: data.name, sizes, notes: data.notes ?? null },
    });
    return NextResponse.json(grid, { status: 201 });
  } catch (e) {
    return apiError(e);
  }
}
