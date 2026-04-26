import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, apiError } from "@/server/api-helpers";
import { assertCan } from "@/lib/rbac";
import { variantUpdateSchema } from "@/lib/validators/variant";
import { Prisma } from "@prisma/client";
import { canMoveVariantStatus } from "@/lib/status-machine/product-statuses";

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
      select: {
        id: true,
        status: true,
        productModel: { select: { ownerId: true } },
      },
    });
    if (!existing) return NextResponse.json({ error: { code: "not_found" } }, { status: 404 });

    assertCan(session.user.role, "product.update", existing.productModel.ownerId, session.user.id);

    const data = variantUpdateSchema.parse(await req.json());

    if (data.status && data.status !== existing.status) {
      const check = canMoveVariantStatus(existing.status, data.status);
      if (!check.ok) {
        return NextResponse.json(
          { error: { code: "invalid_transition", message: check.reason ?? "Недопустимый переход" } },
          { status: 400 },
        );
      }
    }

    const updated = await prisma.productVariant.update({
      where: { id },
      data: data as Prisma.ProductVariantUncheckedUpdateInput,
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
    const existing = await prisma.productVariant.findUnique({ where: { id }, select: { sku: true } });
    if (!existing) return NextResponse.json({ error: { code: "not_found" } }, { status: 404 });
    // Префиксируем SKU, чтобы освободить его для повторного использования
    // (иначе unique-constraint не даст завести новый цвет с тем же артикулом)
    const archivedSku = `${existing.sku}__deleted_${Date.now()}`;
    await prisma.productVariant.update({
      where: { id },
      data: { deletedAt: new Date(), sku: archivedSku },
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}
