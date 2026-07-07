import { BrandPlanForm } from "@/components/planning/brand-plan-form";

export default function NewBrandPlanPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-slate-900 md:text-2xl">Новый план</h1>
        <p className="text-sm text-slate-500">
          Направление бренда: что добавляем, сколько фасонов и не больше каких денег.
        </p>
      </div>
      <BrandPlanForm />
    </div>
  );
}
