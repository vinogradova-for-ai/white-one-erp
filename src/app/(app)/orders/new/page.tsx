import { prisma } from "@/lib/prisma";
import { OrderForm } from "@/components/orders/order-form";

export default async function NewOrderPage({
  searchParams,
}: {
  searchParams: Promise<{ productId?: string }>;
}) {
  const sp = await searchParams;
  const [products, factories, users] = await Promise.all([
    prisma.product.findMany({
      where: {
        deletedAt: null,
        status: { in: ["READY_FOR_PRODUCTION", "APPROVED"] },
      },
      select: { id: true, sku: true, name: true, brand: true, customerPrice: true, fullCost: true, plannedRedemptionPct: true, preferredFactoryId: true },
      orderBy: { name: "asc" },
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
          products={products.map((p) => ({
            id: p.id,
            sku: p.sku,
            name: p.name,
            brand: p.brand,
            customerPrice: p.customerPrice?.toString() ?? null,
            fullCost: p.fullCost?.toString() ?? null,
            plannedRedemptionPct: p.plannedRedemptionPct?.toString() ?? null,
            preferredFactoryId: p.preferredFactoryId,
          }))}
          factories={factories}
          users={users}
          preselectedProductId={sp.productId}
        />
      </div>
    </div>
  );
}
