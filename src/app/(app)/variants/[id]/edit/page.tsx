import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { VariantEditForm } from "@/components/variants/variant-edit-form";

export default async function EditVariantPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const variant = await prisma.productVariant.findFirst({
    where: { id, deletedAt: null },
    include: { productModel: { include: { sizeGrid: true } } },
  });
  if (!variant) return notFound();

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <div className="text-sm text-slate-500">{variant.productModel.name}</div>
        <h1 className="text-2xl font-semibold text-slate-900">Редактирование варианта — {variant.colorName}</h1>
      </div>
      <div className="rounded-2xl border border-slate-200 bg-white p-6">
        <VariantEditForm
          variantId={variant.id}
          countryOfOrigin={variant.productModel.countryOfOrigin}
          sizes={variant.productModel.sizeGrid?.sizes ?? []}
          initial={{
            sku: variant.sku,
            colorName: variant.colorName,
            pantoneCode: variant.pantoneCode ?? "",
            photoUrls: variant.photoUrls,
            defaultSizeProportion: (variant.defaultSizeProportion as Record<string, number> | null) ?? {},
            purchasePriceCny: variant.purchasePriceCny?.toString() ?? "",
            purchasePriceRub: variant.purchasePriceRub?.toString() ?? "",
            cnyRubRate: variant.cnyRubRate?.toString() ?? "13.5",
            packagingCost: variant.packagingCost.toString(),
            wbLogisticsCost: variant.wbLogisticsCost.toString(),
            wbPrice: variant.wbPrice?.toString() ?? "",
            customerPrice: variant.customerPrice?.toString() ?? "",
            wbCommissionPct: variant.wbCommissionPct.toString(),
            drrPct: variant.drrPct.toString(),
            plannedRedemptionPct: variant.plannedRedemptionPct?.toString() ?? "",
            lengthCm: variant.lengthCm?.toString() ?? "",
            widthCm: variant.widthCm?.toString() ?? "",
            heightCm: variant.heightCm?.toString() ?? "",
            weightG: variant.weightG?.toString() ?? "",
            liters: variant.liters?.toString() ?? "",
            hsCode: variant.hsCode ?? "",
            packagingType: variant.packagingType ?? "",
            notes: variant.notes ?? "",
          }}
        />
      </div>
    </div>
  );
}
