import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { BrandPlanForm } from "@/components/planning/brand-plan-form";

export default async function EditBrandPlanPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const plan = await prisma.brandPlan.findUnique({ where: { id } });
  if (!plan) return notFound();

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-slate-900 md:text-2xl">Правка плана</h1>
      </div>
      <BrandPlanForm
        initial={{
          id: plan.id,
          name: plan.name,
          status: plan.status,
          season: plan.season ?? "",
          targetDate: plan.targetDate ? plan.targetDate.toISOString().slice(0, 10) : "",
          plannedModelsCount: plan.plannedModelsCount?.toString() ?? "",
          plannedUnitsPerModel: plan.plannedUnitsPerModel?.toString() ?? "",
          targetUnitPriceCny: plan.targetUnitPriceCny != null ? Number(plan.targetUnitPriceCny).toString() : "",
          cnyRubRate: plan.cnyRubRate != null ? Number(plan.cnyRubRate).toString() : "",
          budgetRub: plan.budgetRub != null ? Number(plan.budgetRub).toString() : "",
          notes: plan.notes ?? "",
        }}
      />
    </div>
  );
}
