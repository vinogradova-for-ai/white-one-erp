import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, apiError } from "@/server/api-helpers";
import { assertCan } from "@/lib/rbac";
import { modelUpdateSchema } from "@/lib/validators/model";

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

    const updated = await prisma.productModel.update({
      where: { id },
      data: {
        ...data,
        patternsUrl: data.patternsUrl === undefined ? undefined : data.patternsUrl || null,
        techPackUrl: data.techPackUrl === undefined ? undefined : data.techPackUrl || null,
        sampleApprovalUrl: data.sampleApprovalUrl === undefined ? undefined : data.sampleApprovalUrl || null,
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
    await prisma.productModel.update({ where: { id }, data: { deletedAt: new Date() } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}
