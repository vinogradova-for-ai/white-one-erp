import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, apiError } from "@/server/api-helpers";
import { assertCan } from "@/lib/rbac";
import { modelUpdateSchema } from "@/lib/validators/model";
import { logAudit } from "@/server/audit";
import { Prisma } from "@prisma/client";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireAuth();
    const { id } = await ctx.params;
    const model = await prisma.productModel.findFirst({
      where: { id, deletedAt: null },
      include: {
        owner: { select: { id: true, name: true } },
        preferredFactory: true,
        sizeGrid: true,
        variants: { where: { deletedAt: null } },
      },
    });
    if (!model) return NextResponse.json({ error: { code: "not_found" } }, { status: 404 });
    return NextResponse.json(model);
  } catch (e) {
    return apiError(e);
  }
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAuth();
    const { id } = await ctx.params;

    const existing = await prisma.productModel.findFirst({ where: { id, deletedAt: null } });
    if (!existing) return NextResponse.json({ error: { code: "not_found" } }, { status: 404 });

    assertCan(session.user.role, "product.update", existing.ownerId, session.user.id);

    const data = modelUpdateSchema.parse(await req.json());

    // Даты этапов разработки приходят строкой YYYY-MM-DD; конвертим в Date.
    const dateFields = ["patternsDate", "sampleDate", "approvedDate", "productionStartDate"] as const;
    const dateUpdates: Record<string, Date | null | undefined> = {};
    for (const f of dateFields) {
      const v = (data as Record<string, unknown>)[f];
      if (v === undefined) continue;
      dateUpdates[f] = v == null || v === "" ? null : new Date(String(v));
    }

    // Маржу/ROI/наценку не считаем — Алёна явно убрала это из скоупа сервиса.
    // Поля в БД остаются, но больше не обновляются.
    const updated = await prisma.productModel.update({
      where: { id },
      data: {
        ...data,
        ...dateUpdates,
        patternsUrl: data.patternsUrl === undefined ? undefined : data.patternsUrl || null,
      } as Prisma.ProductModelUncheckedUpdateInput,
    });
    await logAudit({
      action: "UPDATE",
      entityType: "ProductModel",
      entityId: id,
      userId: session.user.id,
      changes: data,
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

    // Нельзя удалить фасон, по которому есть живые заказы (решение Алёны): у заказов
    // своя финансовая жизнь (платежи, история) — сначала закрой/архивируй их.
    // Как у фабрики: блокируем удаление, а не прячем заказы побочным эффектом.
    const liveOrders = await prisma.order.count({ where: { productModelId: id, deletedAt: null } });
    if (liveOrders > 0) {
      return NextResponse.json(
        {
          error: {
            code: "in_use",
            message: `Нельзя удалить фасон: по нему есть ${liveOrders} заказ(ов). Сначала закройте или архивируйте их.`,
          },
        },
        { status: 409 },
      );
    }

    // Soft-delete каскадим на варианты: цвет не может «жить» без своего фасона,
    // иначе он остаётся в /variants, дропдаунах и счётчиках как живой.
    const now = new Date();
    await prisma.$transaction([
      prisma.productVariant.updateMany({
        where: { productModelId: id, deletedAt: null },
        data: { deletedAt: now },
      }),
      prisma.productModel.update({ where: { id }, data: { deletedAt: now } }),
    ]);
    await logAudit({
      action: "DELETE",
      entityType: "ProductModel",
      entityId: id,
      userId: session.user.id,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}
