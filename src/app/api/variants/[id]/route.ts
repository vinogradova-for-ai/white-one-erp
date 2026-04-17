import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, apiError } from "@/server/api-helpers";
import { assertCan } from "@/lib/rbac";
import { variantUpdateSchema } from "@/lib/validators/variant";
import { calculateVariantEconomics } from "@/lib/calculations/product-cost";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireAuth();
    const { id } = await ctx.params;
    const variant = await prisma.productVariant.findFirst({
      where: { id, deletedAt: null },
      include: { productModel: { include: { sizeGrid: true } } },
    });
    if (!variant) return NextResponse.json({ error: { code: "not_found" } }, { status: 404 });
    return NextResponse.json(variant);
  } catch (e) {
    return apiError(e);
  }
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAuth();
    const { id } = await ctx.params;

    const existing = await prisma.productVariant.findFirst({
      where: { id, deletedAt: null },
      include: { productModel: { select: { ownerId: true } } },
    });
    if (!existing) return NextResponse.json({ error: { code: "not_found" } }, { status: 404 });

    assertCan(session.user.role, "product.update", existing.productModel.ownerId, session.user.id);

    const data = variantUpdateSchema.parse(await req.json());
    const merged = { ...existing, ...data };
    const eco = calculateVariantEconomics(merged);

    const updated = await prisma.productVariant.update({
      where: { id },
      data: {
        ...data,
        fullCost: eco.fullCost ?? null,
        marginBeforeDrr: eco.marginBeforeDrr ?? null,
        marginAfterDrrPct: eco.marginAfterDrrPct ?? null,
        roi: eco.roi ?? null,
        markupPct: eco.markupPct ?? null,
      },
    });
    return NextResponse.json(updated);
  } catch (e) {
    return apiError(e);
  }
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAuth();
    assertCan(session.user.role, "product.delete");
    const { id } = await ctx.params;
    await prisma.productVariant.update({ where: { id }, data: { deletedAt: new Date() } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}
