import { prisma } from "@/lib/prisma";
import { NewVariantButton } from "@/components/variants/new-variant-button";
import { resolveModelCost } from "@/lib/calculations/resolve-model-cost";
import { ListCapNotice } from "@/components/common/list-cap-notice";
import { VariantsListClient, type VariantListRow } from "@/components/variants/variants-list-client";

// Потолок поднят с 200 до 500 (топ-15): поиск и фильтры теперь живые на клиенте,
// поэтому грузим весь рабочий объём сразу.
const VARIANTS_CAP = 500;

export default async function VariantsPage() {
  const [variants, totalCount, models] = await Promise.all([
    prisma.productVariant.findMany({
      where: { deletedAt: null },
      orderBy: { updatedAt: "desc" },
      take: VARIANTS_CAP,
      include: {
        productModel: {
          select: {
            id: true,
            name: true,
            category: true,
            photoUrls: true,
            fullCost: true,
            purchasePriceRub: true,
            purchasePriceCny: true,
            cnyRubRate: true,
            targetCostRub: true,
            targetCostCny: true,
          },
        },
      },
    }),
    prisma.productVariant.count({ where: { deletedAt: null } }),
    prisma.productModel.findMany({
      where: { deletedAt: null },
      select: { id: true, name: true },
      orderBy: { updatedAt: "desc" },
    }),
  ]);

  const rows: VariantListRow[] = variants.map((v) => ({
    id: v.id,
    sku: v.sku,
    colorName: v.colorName,
    status: v.status,
    photoUrl: v.photoUrls[0] ?? null,
    modelId: v.productModel.id,
    modelName: v.productModel.name,
    modelPhotoUrl: v.productModel.photoUrls[0] ?? null,
    category: v.productModel.category,
    cost: resolveModelCost(v.productModel),
  }));

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 md:text-2xl">Цветомодели</h1>
          <p className="text-sm text-slate-500">
            Всего: {totalCount}
            {totalCount > variants.length && ` · показаны ${variants.length}`}
          </p>
        </div>
        <NewVariantButton models={models} />
      </div>

      <ListCapNotice shown={variants.length} cap={VARIANTS_CAP} unit="цветомоделей" />

      <VariantsListClient rows={rows} />
    </div>
  );
}
