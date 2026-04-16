import { prisma } from "@/lib/prisma";
import { OrderForm } from "@/components/orders/order-form";

export default async function NewOrderPage({
  searchParams,
}: {
  searchParams: Promise<{ variantId?: string }>;
}) {
  const sp = await searchParams;

  const [variants, factories, users] = await Promise.all([
    prisma.productVariant.findMany({
      where: { deletedAt: null, status: "READY_TO_ORDER" },
      select: {
        id: true,
        sku: true,
        colorName: true,
        photoUrls: true,
        customerPrice: true,
        fullCost: true,
        plannedRedemptionPct: true,
        defaultSizeProportion: true,
        productModel: {
          select: { name: true, preferredFactoryId: true, sizeGrid: { select: { sizes: true } } },
        },
      },
      orderBy: { sku: "asc" },
      take: 500,
    }),
    prisma.factory.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.user.findMany({
      where: { isActive: true, role: { in: ["OWNER", "DIRECTOR", "PRODUCT_MANAGER"] } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="text-2xl font-semibold text-slate-900">Новый заказ на производство</h1>
      <div className="rounded-2xl border border-slate-200 bg-white p-6">
        <OrderForm
          variants={variants.map((v) => ({
            id: v.id,
            sku: v.sku,
            colorName: v.colorName,
            modelName: v.productModel.name,
            photoUrl: v.photoUrls[0] ?? null,
            customerPrice: v.customerPrice?.toString() ?? null,
            fullCost: v.fullCost?.toString() ?? null,
            plannedRedemptionPct: v.plannedRedemptionPct?.toString() ?? null,
            sizes: v.productModel.sizeGrid?.sizes ?? [],
            defaultSizeProportion: v.defaultSizeProportion as Record<string, number> | null,
            preferredFactoryId: v.productModel.preferredFactoryId,
          }))}
          factories={factories}
          users={users}
          preselectedVariantId={sp.variantId}
        />
      </div>
    </div>
  );
}
