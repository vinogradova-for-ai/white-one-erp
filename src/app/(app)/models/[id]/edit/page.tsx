import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { ModelEditForm } from "@/components/models/model-edit-form";

export default async function EditModelPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [model, users, factories, sizeGrids, allTagsRaw] = await Promise.all([
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
    prisma.sizeGrid.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.productModel.findMany({ where: { deletedAt: null }, select: { tags: true } }),
  ]);

  if (!model) return notFound();

  const allTags = Array.from(new Set(allTagsRaw.flatMap((m) => m.tags))).sort();

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="text-2xl font-semibold text-slate-900">Редактирование фасона</h1>
      <div className="rounded-2xl border border-slate-200 bg-white p-6">
        <ModelEditForm
          model={{
            id: model.id,
            name: model.name,
            category: model.category,
            subcategory: model.subcategory ?? "",
            tags: model.tags,
            sizeGridId: model.sizeGridId ?? "",
            countryOfOrigin: model.countryOfOrigin,
            preferredFactoryId: model.preferredFactoryId ?? "",
            developmentType: model.developmentType,
            isRepeat: model.isRepeat,
            fabricName: model.fabricName ?? "",
            fabricConsumption: model.fabricConsumption?.toString() ?? "",
            fabricPricePerMeter: model.fabricPricePerMeter?.toString() ?? "",
            fabricCurrency: (model.fabricCurrency ?? "CNY") as "RUB" | "CNY",
            patternsUrl: model.patternsUrl ?? "",
            techPackUrl: model.techPackUrl ?? "",
            photoUrls: model.photoUrls,
            ownerId: model.ownerId,
            notes: model.notes ?? "",
          }}
          users={users}
          factories={factories}
          sizeGrids={sizeGrids}
          existingTags={allTags}
        />
      </div>
    </div>
  );
}
