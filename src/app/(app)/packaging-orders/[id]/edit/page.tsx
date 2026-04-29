import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { PackagingOrderForm } from "@/components/packaging-orders/packaging-order-form";

export default async function EditPackagingOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const { id } = await params;

  const [order, packagings, factories, users] = await Promise.all([
    prisma.packagingOrder.findUnique({
      where: { id },
      include: {
        lines: true,
        payments: { orderBy: { plannedDate: "asc" } },
      },
    }),
    prisma.packagingItem.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, type: true, photoUrl: true, unitPriceRub: true, unitPriceCny: true, priceCurrency: true, cnyRubRate: true },
    }),
    prisma.factory.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.user.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  if (!order) return notFound();

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <div className="font-mono text-xs text-slate-500">{order.orderNumber}</div>
        <h1 className="text-2xl font-semibold text-slate-900">Редактирование заказа упаковки</h1>
      </div>
      <PackagingOrderForm
        packagings={packagings.map((p) => ({
          id: p.id,
          name: p.name,
          type: p.type,
          photoUrl: p.photoUrl,
          unitPriceRub: p.unitPriceRub?.toString() ?? null,
          unitPriceCny: p.unitPriceCny?.toString() ?? null,
          priceCurrency: p.priceCurrency as "RUB" | "CNY" | null,
          cnyRubRate: p.cnyRubRate?.toString() ?? null,
        }))}
        factories={factories}
        users={users}
        defaultOwnerId={session.user.id}
        initial={{
          id: order.id,
          lines: order.lines.map((l) => ({
            packagingItemId: l.packagingItemId,
            quantity: l.quantity,
            unitPriceRub: l.unitPriceRub?.toString() ?? "",
            unitPriceCny: l.unitPriceCny?.toString() ?? "",
            priceCurrency: (l.priceCurrency as "RUB" | "CNY") ?? "RUB",
            cnyRubRate: l.cnyRubRate?.toString() ?? "",
          })),
          factoryId: order.factoryId ?? "",
          supplierName: order.supplierName ?? "",
          productionEndDate: order.productionEndDate ? order.productionEndDate.toISOString().slice(0, 10) : "",
          expectedDate: order.expectedDate ? order.expectedDate.toISOString().slice(0, 10) : "",
          ownerId: order.ownerId,
          notes: order.notes ?? "",
          deliveryMethod: order.deliveryMethod ?? "CARGO_CN",
          payments: order.payments.map((p) => ({
            id: p.id,
            plannedDate: p.plannedDate.toISOString().slice(0, 10),
            amount: Number(p.amount),
            label: p.label,
            paid: p.status === "PAID",
          })),
        }}
      />
    </div>
  );
}
