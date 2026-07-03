import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { OrderForm } from "@/components/orders/order-form";

export default async function NewOrderPage({
  searchParams,
}: {
  searchParams: Promise<{ modelId?: string; variantId?: string; stage?: string }>;
}) {
  const sp = await searchParams;
  const session = await auth();
  const currentUserId = session?.user?.id ?? null;

  const [models, factories, users] = await Promise.all([
    prisma.productModel.findMany({
      where: {
        deletedAt: null,
        variants: { some: { deletedAt: null } },
      },
      orderBy: { name: "asc" },
      take: 500,
      select: {
        id: true,
        name: true,
        photoUrls: true,
        countryOfOrigin: true,
        preferredFactoryId: true,
        customerPrice: true,
        fullCost: true,
        purchasePriceRub: true,
        purchasePriceCny: true,
        cnyRubRate: true,
        targetCostRub: true,
        targetCostCny: true,
        plannedRedemptionPct: true,
        defaultSizeProportion: true,
        sizeGrid: { select: { sizes: true } },
        variants: {
          where: { deletedAt: null },
          orderBy: { colorName: "asc" },
          select: {
            id: true,
            sku: true,
            colorName: true,
            photoUrls: true,
            defaultSizeProportion: true,
          },
        },
        packagingItems: {
          select: {
            quantityPerUnit: true,
            packagingItem: {
              select: {
                id: true,
                name: true,
                stock: true,
                photoUrl: true,
                packagingOrderLines: {
                  where: { packagingOrder: { status: { notIn: ["ARRIVED", "CANCELLED"] } } },
                  select: { quantity: true },
                },
              },
            },
          },
        },
      },
    }),
    prisma.factory.findMany({
      // П6: в форме заказа на пошив — только швейные фабрики.
      where: { isActive: true, kind: "SEWING" },
      select: { id: true, name: true, country: true },
      orderBy: { name: "asc" },
    }),
    prisma.user.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  // Если пришли со страницы фасона/варианта — подставим ID модели
  let preselectedModelId = sp.modelId;
  if (!preselectedModelId && sp.variantId) {
    const v = await prisma.productVariant.findUnique({
      where: { id: sp.variantId },
      select: { productModelId: true },
    });
    preselectedModelId = v?.productModelId ?? undefined;
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <h1 className="text-2xl font-semibold text-slate-900">Новый заказ на производство</h1>
      <div className="rounded-2xl border border-slate-200 bg-white p-6">
        <OrderForm
          models={models.map((m) => ({
            id: m.id,
            name: m.name,
            photoUrl: m.photoUrls[0] ?? null,
            countryOfOrigin: m.countryOfOrigin ?? null,
            preferredFactoryId: m.preferredFactoryId,
            customerPrice: m.customerPrice?.toString() ?? null,
            fullCost: m.fullCost?.toString() ?? null,
            purchasePriceRub: m.purchasePriceRub?.toString() ?? null,
            purchasePriceCny: m.purchasePriceCny?.toString() ?? null,
            cnyRubRate: m.cnyRubRate?.toString() ?? null,
            targetCostRub: m.targetCostRub?.toString() ?? null,
            targetCostCny: m.targetCostCny?.toString() ?? null,
            plannedRedemptionPct: m.plannedRedemptionPct?.toString() ?? null,
            sizes: m.sizeGrid?.sizes ?? [],
            defaultSizeProportion: (m.defaultSizeProportion as Record<string, number> | null) ?? null,
            variants: m.variants.map((v) => ({
              id: v.id,
              sku: v.sku,
              colorName: v.colorName,
              photoUrl: v.photoUrls[0] ?? null,
              defaultSizeProportion: (v.defaultSizeProportion as Record<string, number> | null) ?? null,
            })),
            packaging: m.packagingItems.map((p) => ({
              id: p.packagingItem.id,
              name: p.packagingItem.name,
              photoUrl: p.packagingItem.photoUrl,
              quantityPerUnit: Number(p.quantityPerUnit),
              stock: p.packagingItem.stock,
              inProductionQty: p.packagingItem.packagingOrderLines.reduce((a, l) => a + l.quantity, 0),
            })),
          }))}
          factories={factories}
          users={users}
          preselectedModelId={preselectedModelId}
          preselectedVariantId={sp.variantId}
          preselectedStage={sp.stage}
          defaultOwnerId={currentUserId}
        />
      </div>
    </div>
  );
}
