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

    const qty = data.quantityPerUnit != null ? Number(data.quantityPerUnit) : 1;
    const link = await prisma.modelPackaging.create({
      data: {
        productModelId: id,
        packagingItemId: data.packagingItemId,
        quantityPerUnit: qty,
      },
      include: { packagingItem: true },
    });

    // Каскад: добавить эту упаковку во все ещё не проданные заказы этого фасона.
    const openOrders = await prisma.order.findMany({
      where: {
        productModelId: id,
        deletedAt: null,
        status: { not: "ON_SALE" },
      },
      select: { id: true, packaging: { select: { packagingItemId: true } } },
    });
    const toCreate = openOrders
      .filter((o) => !o.packaging.some((p) => p.packagingItemId === data.packagingItemId))
      .map((o) => ({
        orderId: o.id,
        packagingItemId: data.packagingItemId,
        quantityPerUnit: qty,
      }));
    if (toCreate.length > 0) {
      await prisma.orderPackaging.createMany({ data: toCreate, skipDuplicates: true });
    }
    return NextResponse.json({ ...link, propagatedToOrders: toCreate.length }, { status: 201 });
  } catch (e) {
    return apiError(e);
  }
}
