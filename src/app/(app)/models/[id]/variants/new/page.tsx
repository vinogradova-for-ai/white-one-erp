import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { VariantForm } from "@/components/variants/variant-form";
import { DEFAULT_REDEMPTION_PCT } from "@/lib/constants";

export default async function NewVariantPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const model = await prisma.productModel.findFirst({
    where: { id, deletedAt: null },
    include: { sizeGrid: true },
  });
  if (!model) return notFound();

  const defaultRedemption = DEFAULT_REDEMPTION_PCT[model.category] ?? 30;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <div className="text-sm text-slate-500">Добавить цвет к фасону</div>
        <h1 className="text-2xl font-semibold text-slate-900">{model.name}</h1>
      </div>
      <div className="rounded-2xl border border-slate-200 bg-white p-6">
        <VariantForm
          modelId={model.id}
          countryOfOrigin={model.countryOfOrigin}
          sizes={model.sizeGrid?.sizes ?? []}
          defaultRedemption={defaultRedemption}
        />
      </div>
    </div>
  );
}
