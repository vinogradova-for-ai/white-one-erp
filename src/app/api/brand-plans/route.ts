import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, apiError } from "@/server/api-helpers";
import { assertCan } from "@/lib/rbac";
import { brandPlanCreateSchema } from "@/lib/validators/brand-plan";
import { logAudit } from "@/server/audit";

// «Планирование» — направления развития бренда.

export async function GET() {
  try {
    await requireAuth();
    const plans = await prisma.brandPlan.findMany({
      orderBy: [{ createdAt: "desc" }],
      include: { models: { where: { deletedAt: null }, select: { id: true } } },
    });
    return NextResponse.json(plans);
  } catch (e) {
    return apiError(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth();
    assertCan(session.user.role, "plan.manage");
    const data = brandPlanCreateSchema.parse(await req.json());

    const plan = await prisma.brandPlan.create({
      data: {
        name: data.name,
        status: data.status ?? "IDEA",
        season: data.season || null,
        targetDate: data.targetDate ? new Date(data.targetDate) : null,
        plannedModelsCount: data.plannedModelsCount ?? null,
        plannedUnitsPerModel: data.plannedUnitsPerModel ?? null,
        targetUnitPriceCny: data.targetUnitPriceCny ?? null,
        cnyRubRate: data.cnyRubRate ?? null,
        budgetRub: data.budgetRub ?? null,
        notes: data.notes || null,
        ownerId: data.ownerId || session.user.id,
      },
    });
    await logAudit({
      action: "CREATE",
      entityType: "BrandPlan",
      entityId: plan.id,
      userId: session.user.id,
      changes: data,
    });
    return NextResponse.json(plan, { status: 201 });
  } catch (e) {
    return apiError(e);
  }
}
