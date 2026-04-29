import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, apiError } from "@/server/api-helpers";

/**
 * Принудительный пересинк: для всех ModelPackaging данной модели создаёт
 * недостающие OrderPackaging в открытых заказах (status NOT IN [ON_SALE]).
 * Идемпотентен: повторный вызов ничего не создаст (skipDuplicates).
 *
 * Лечит исторические заказы, которые были созданы ДО появления каскада
 * в POST /api/models/[id]/packaging — например, до фикса опечатки в
 * Prisma-relation, из-за которой каскад молча падал.
 */
export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireAuth();
    const { id: productModelId } = await ctx.params;

    const links = await prisma.modelPackaging.findMany({
      where: { productModelId },
      select: { packagingItemId: true, quantityPerUnit: true },
    });

    if (links.length === 0) {
      return NextResponse.json({ ok: true, propagated: 0, message: "У фасона ещё нет привязанной упаковки" });
    }

    const orders = await prisma.order.findMany({
      where: {
        productModelId,
        deletedAt: null,
        status: { not: "ON_SALE" },
      },
      select: {
        id: true,
        packagingItems: { select: { packagingItemId: true } },
      },
    });

    const toCreate: Array<{ orderId: string; packagingItemId: string; quantityPerUnit: number }> = [];
    for (const o of orders) {
      const existing = new Set(o.packagingItems.map((p) => p.packagingItemId));
      for (const link of links) {
        if (existing.has(link.packagingItemId)) continue;
        toCreate.push({
          orderId: o.id,
          packagingItemId: link.packagingItemId,
          quantityPerUnit: Number(link.quantityPerUnit),
        });
      }
    }

    if (toCreate.length > 0) {
      await prisma.orderPackaging.createMany({ data: toCreate, skipDuplicates: true });
    }

    return NextResponse.json({
      ok: true,
      propagated: toCreate.length,
      orders: orders.length,
      links: links.length,
    });
  } catch (e) {
    return apiError(e);
  }
}
