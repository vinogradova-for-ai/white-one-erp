import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { ModelEditForm } from "@/components/models/model-edit-form";
import { ModelPackagingKit } from "@/components/models/model-packaging-kit";

export default async function EditModelPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [model, users, factories, sizeGrids, packagingItems] = await Promise.all([
    prisma.productModel.findFirst({ where: { id, deletedAt: null } }),
    prisma.user.findMany({
      where: { isActive: true, role: { in: ["OWNER", "DIRECTOR", "PRODUCT_MANAGER"] } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.factory.findMany({
      where: { isActive: true },
      select: { id: true, name: true, country: true },
      orderBy: { name: "asc" },
    }),
    prisma.sizeGrid.findMany({ select: { id: true, name: true, sizes: true }, orderBy: { name: "asc" } }),
    prisma.packagingItem.findMany({
      where: { isActive: true },
      select: { id: true, name: true, type: true, photoUrl: true },
      orderBy: { name: "asc" },
    }),
  ]);

  if (!model) return notFound();

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="text-2xl font-semibold text-slate-900">Редактирование фасона</h1>
      <div className="rounded-2xl border border-slate-200 bg-white p-6">
        <ModelEditForm
          model={{
            id: model.id,
            name: model.name,
            brand: model.brand,
            category: model.category,
            subcategory: model.subcategory ?? "",
            sizeGridId: model.sizeGridId ?? "",
            countryOfOrigin: model.countryOfOrigin,
            preferredFactoryId: model.preferredFactoryId ?? "",
            developmentType: model.developmentType,
            isRepeat: model.isRepeat,
            fabricName: model.fabricName ?? "",
            fabricComposition: model.fabricComposition ?? "",
            fabricConsumption: model.fabricConsumption?.toString() ?? "",
            fabricPricePerMeter: model.fabricPricePerMeter?.toString() ?? "",
            fabricCurrency: (model.fabricCurrency ?? "CNY") as "RUB" | "CNY",
            patternsUrl: model.patternsUrl ?? "",
            photoUrls: model.photoUrls,
            ownerId: model.ownerId,
            notes: model.notes ?? "",
            purchasePriceCny: model.purchasePriceCny?.toString() ?? "",
            purchasePriceRub: model.purchasePriceRub?.toString() ?? "",
            cnyRubRate: model.cnyRubRate?.toString() ?? "13.5",
            packagingCost: model.packagingCost.toString(),
            wbLogisticsCost: model.wbLogisticsCost.toString(),
            wbPrice: model.wbPrice?.toString() ?? "",
            customerPrice: model.customerPrice?.toString() ?? "",
            wbCommissionPct: model.wbCommissionPct.toString(),
            drrPct: model.drrPct.toString(),
            plannedRedemptionPct: model.plannedRedemptionPct?.toString() ?? "",
            targetCostCny: model.targetCostCny?.toString() ?? "",
            targetCostRub: model.targetCostRub?.toString() ?? "",
            targetCostNote: model.targetCostNote ?? "",
          }}
          users={users}
          factories={factories}
          sizeGrids={sizeGrids}
        />
      </div>
      <div className="rounded-2xl border border-slate-200 bg-white p-6">
        <ModelPackagingKit modelId={model.id} allPackagings={packagingItems} />
      </div>
    </div>
  );
}
