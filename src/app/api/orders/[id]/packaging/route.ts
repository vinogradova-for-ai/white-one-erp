import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, apiError } from "@/server/api-helpers";
import { orderPackagingSchema } from "@/lib/validators/packaging";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireAuth();
    const { id } = await ctx.params;
    const items = await prisma.orderPackaging.findMany({
      where: { orderId: id },
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
    const data = orderPackagingSchema.parse(await req.json());

    const order = await prisma.order.findUnique({ where: { id } });
    if (!order) return NextResponse.json({ error: { code: "not_found" } }, { status: 404 });

    const existing = await prisma.orderPackaging.findUnique({
      where: { orderId_packagingItemId: { orderId: id, packagingItemId: data.packagingItemId } },
    });
    if (existing) {
      return NextResponse.json(
        { error: { code: "conflict", message: "Эта упаковка уже привязана к заказу" } },
        { status: 409 },
      );
    }

    const link = await prisma.orderPackaging.create({
      data: {
        orderId: id,
        packagingItemId: data.packagingItemId,
        quantityPerUnit: data.quantityPerUnit != null ? Number(data.quantityPerUnit) : 1,
        notes: data.notes ?? null,
      },
      include: {
        packagingItem: {
          include: {
            packagingOrderLines: {
              where: { packagingOrder: { status: { notIn: ["ARRIVED", "CANCELLED"] } } },
              select: { quantity: true },
            },
          },
        },
      },
    });
    const inProductionQty = link.packagingItem.packagingOrderLines.reduce(
      (a, l) => a + l.quantity,
      0,
    );
    return NextResponse.json(
      {
        ...link,
        packagingItem: {
          id: link.packagingItem.id,
          name: link.packagingItem.name,
          type: link.packagingItem.type,
          stock: link.packagingItem.stock,
          inProductionQty,
        },
      },
      { status: 201 },
    );
  } catch (e) {
    return apiError(e);
  }
}
