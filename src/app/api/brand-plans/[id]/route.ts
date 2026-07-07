import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, apiError } from "@/server/api-helpers";
import { assertCan } from "@/lib/rbac";
import { brandPlanUpdateSchema } from "@/lib/validators/brand-plan";
import { logAudit } from "@/server/audit";

// План не удаляем — «не идём» = статус CANCELLED (закон «никогда не удалять»).

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireAuth();
    const { id } = await ctx.params;
    const plan = await prisma.brandPlan.findUnique({
      where: { id },
      include: { models: { where: { deletedAt: null }, select: { id: true, name: true } } },
    });
    if (!plan) return NextResponse.json({ error: { code: "not_found" } }, { status: 404 });
    return NextResponse.json(plan);
  } catch (e) {
    return apiError(e);
  }
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAuth();
    assertCan(session.user.role, "plan.manage");
    const { id } = await ctx.params;
    const data = brandPlanUpdateSchema.parse(await req.json());
    const existing = await prisma.brandPlan.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: { code: "not_found" } }, { status: 404 });

    const patch: Record<string, unknown> = {};
    if (data.name !== undefined) patch.name = data.name;
    if (data.status !== undefined) patch.status = data.status;
    if (data.season !== undefined) patch.season = data.season || null;
    if (data.targetDate !== undefined) patch.targetDate = data.targetDate ? new Date(data.targetDate) : null;
    if (data.plannedModelsCount !== undefined) patch.plannedModelsCount = data.plannedModelsCount;
    if (data.plannedUnitsPerModel !== undefined) patch.plannedUnitsPerModel = data.plannedUnitsPerModel;
    if (data.targetUnitPriceCny !== undefined) patch.targetUnitPriceCny = data.targetUnitPriceCny;
    if (data.cnyRubRate !== undefined) patch.cnyRubRate = data.cnyRubRate;
    if (data.budgetRub !== undefined) patch.budgetRub = data.budgetRub;
    if (data.notes !== undefined) patch.notes = data.notes || null;
    if (data.ownerId !== undefined) patch.ownerId = data.ownerId || null;

    const updated = await prisma.brandPlan.update({ where: { id }, data: patch });
    await logAudit({
      action: "UPDATE",
      entityType: "BrandPlan",
      entityId: id,
      userId: session.user.id,
      changes: data,
    });
    return NextResponse.json(updated);
  } catch (e) {
    return apiError(e);
  }
}
