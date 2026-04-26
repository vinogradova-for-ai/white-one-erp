import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { PackagingOrderForm } from "@/components/packaging-orders/packaging-order-form";

export default async function NewPackagingOrderPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const [packagings, factories, users] = await Promise.all([
    prisma.packagingItem.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, type: true, photoUrl: true, unitPriceRub: true, unitPriceCny: true, priceCurrency: true, cnyRubRate: true },
    }),
    prisma.factory.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.user.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Новый заказ упаковки</h1>
        <p className="text-sm text-slate-500">Заказ партии на склад</p>
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
      />
    </div>
  );
}
