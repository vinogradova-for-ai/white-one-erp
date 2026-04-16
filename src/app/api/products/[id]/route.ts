import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, apiError } from "@/server/api-helpers";
import { assertCan } from "@/lib/rbac";
import { productUpdateSchema } from "@/lib/validators/product";
import { calculateProductEconomics } from "@/lib/calculations/product-cost";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireAuth();
    const { id } = await ctx.params;
    const product = await prisma.product.findFirst({
      where: { id, deletedAt: null },
      include: {
        owner: { select: { id: true, name: true } },
        preferredFactory: true,
        statusLogs: {
          orderBy: { changedAt: "desc" },
          take: 20,
          include: { changedBy: { select: { name: true } } },
        },
        orders: {
          where: { deletedAt: null },
          orderBy: { createdAt: "desc" },
          take: 20,
        },
      },
    });
    if (!product) return NextResponse.json({ error: { code: "not_found" } }, { status: 404 });
    return NextResponse.json(product);
  } catch (e) {
    return apiError(e);
  }
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAuth();
    const { id } = await ctx.params;

    const existing = await prisma.product.findFirst({ where: { id, deletedAt: null } });
    if (!existing) return NextResponse.json({ error: { code: "not_found" } }, { status: 404 });

    assertCan(session.user.role, "product.update", existing.ownerId, session.user.id);

    const body = await req.json();
    const data = productUpdateSchema.parse(body);

    const merged = { ...existing, ...data };
    const economics = calculateProductEconomics(merged);

    const updated = await prisma.product.update({
      where: { id },
      data: {
        ...data,
        patternsUrl: data.patternsUrl === undefined ? undefined : data.patternsUrl || null,
        techDocsUrl: data.techDocsUrl === undefined ? undefined : data.techDocsUrl || null,
        sampleUrl: data.sampleUrl === undefined ? undefined : data.sampleUrl || null,
        fullCost: economics.fullCost ?? null,
        marginBeforeDrr: economics.marginBeforeDrr ?? null,
        marginAfterDrrPct: economics.marginAfterDrrPct ?? null,
        roi: economics.roi ?? null,
        markupPct: economics.markupPct ?? null,
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
    await prisma.product.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}
