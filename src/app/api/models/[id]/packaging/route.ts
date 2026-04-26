import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, apiError } from "@/server/api-helpers";
import { z } from "zod";

const schema = z.object({
  packagingItemId: z.string().min(1),
  quantityPerUnit: z.union([z.number(), z.string()]).optional(),
});

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireAuth();
    const { id } = await ctx.params;
    const items = await prisma.modelPackaging.findMany({
      where: { productModelId: id },
      include: { packagingItem: true },
      orderBy: { createdAt: "asc" },
    });
    return NextResponse.json({ items });
  } catch (e) {
    return apiError(e);
  }
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireAuth();
    const { id } = await ctx.params;
    const data = schema.parse(await req.json());

    const existing = await prisma.modelPackaging.findUnique({
      where: { productModelId_packagingItemId: { productModelId: id, packagingItemId: data.packagingItemId } },
    });
    if (existing) {
      return NextResponse.json(
        { error: { code: "conflict", message: "Эта упаковка уже привязана к фасону" } },
        { status: 409 },
      );
    }

    const link = await prisma.modelPackaging.create({
      data: {
        productModelId: id,
        packagingItemId: data.packagingItemId,
        quantityPerUnit: data.quantityPerUnit != null ? Number(data.quantityPerUnit) : 1,
      },
      include: { packagingItem: true },
    });
    return NextResponse.json(link, { status: 201 });
  } catch (e) {
    return apiError(e);
  }
}
