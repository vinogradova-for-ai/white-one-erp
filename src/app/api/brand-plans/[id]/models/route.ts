import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth, apiError } from "@/server/api-helpers";
import { assertCan } from "@/lib/rbac";
import { logAudit } from "@/server/audit";

// Привязка/отвязка фасона к плану-направлению.
// POST { modelId, attach: true|false } — ставит/снимает ProductModel.brandPlanId.
const schema = z.object({
  modelId: z.string().min(1),
  attach: z.boolean(),
});

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAuth();
    assertCan(session.user.role, "product.update");
    const { id } = await ctx.params;
    const { modelId, attach } = schema.parse(await req.json());

    const plan = await prisma.brandPlan.findUnique({ where: { id }, select: { id: true } });
    if (!plan) return NextResponse.json({ error: { code: "not_found" } }, { status: 404 });
    const model = await prisma.productModel.findFirst({
      where: { id: modelId, deletedAt: null },
      select: { id: true, brandPlanId: true },
    });
    if (!model) return NextResponse.json({ error: { code: "model_not_found" } }, { status: 404 });

    await prisma.productModel.update({
      where: { id: modelId },
      data: { brandPlanId: attach ? id : null },
    });
    await logAudit({
      action: "UPDATE",
      entityType: "ProductModel",
      entityId: modelId,
      userId: session.user.id,
      changes: { brandPlanId: attach ? id : null },
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}
