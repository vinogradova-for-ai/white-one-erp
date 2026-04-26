import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { VariantEditForm } from "@/components/variants/variant-edit-form";

export default async function EditVariantPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const variant = await prisma.productVariant.findFirst({
    where: { id, deletedAt: null },
    include: { productModel: true },
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
          initial={{
            sku: variant.sku,
            colorName: variant.colorName,
            fabricColorCode: variant.fabricColorCode ?? "",
            photoUrls: variant.photoUrls,
          }}
        />
      </div>
    </div>
  );
}
