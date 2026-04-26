import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, apiError } from "@/server/api-helpers";
import { packagingUpdateSchema } from "@/lib/validators/packaging";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireAuth();
    const { id } = await ctx.params;
    const item = await prisma.packagingItem.findUnique({
      where: { id },
      include: {
        orderUsages: {
          include: {
            order: {
              select: {
                id: true,
                orderNumber: true,
                status: true,
                productModel: { select: { name: true } },
                lines: {
                  select: {
                    quantity: true,
                    productVariant: { select: { sku: true, colorName: true } },
                  },
                },
              },
            },
          },
        },
      },
    });
    if (!item) return NextResponse.json({ error: { code: "not_found" } }, { status: 404 });
    return NextResponse.json(item);
  } catch (e) {
    return apiError(e);
  }
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireAuth();
    const { id } = await ctx.params;
    const data = packagingUpdateSchema.parse(await req.json());
    const existing = await prisma.packagingItem.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: { code: "not_found" } }, { status: 404 });

    // Преобразование строковых дат
    const dateFields = [
      "decisionDate",
      "designReadyDate",
      "sampleRequestedDate",
      "sampleApprovedDate",
      "productionStartDate",
    ] as const;
    const processed: Record<string, unknown> = { ...data };
    for (const f of dateFields) {
      const v = processed[f];
      if (typeof v === "string") processed[f] = v ? new Date(v) : null;
    }

    const updated = await prisma.packagingItem.update({ where: { id }, data: processed });
    return NextResponse.json(updated);
  } catch (e) {
    return apiError(e);
  }
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireAuth();
    const { id } = await ctx.params;
    const item = await prisma.packagingItem.findUnique({
      where: { id },
      include: { _count: { select: { orderUsages: true } } },
    });
    if (!item) return NextResponse.json({ error: { code: "not_found" } }, { status: 404 });
    if (item._count.orderUsages > 0) {
      return NextResponse.json(
        {
          error: {
            code: "in_use",
            message: `Нельзя удалить: используется в ${item._count.orderUsages} заказах. Отправьте в архив вместо удаления.`,
          },
        },
        { status: 409 },
      );
    }
    await prisma.packagingItem.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}
