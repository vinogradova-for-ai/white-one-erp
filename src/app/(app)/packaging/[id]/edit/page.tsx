import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PackagingForm } from "@/components/packaging/packaging-form";

export default async function EditPackagingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [item, users] = await Promise.all([
    prisma.packagingItem.findUnique({ where: { id } }),
    prisma.user.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);
  if (!item) return notFound();

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-2xl font-semibold text-slate-900">Редактировать: {item.name}</h1>
      <div className="rounded-2xl border border-slate-200 bg-white p-6">
        <PackagingForm
          users={users}
          initial={{
            id: item.id,
            name: item.name,
            type: item.type,
            sku: item.sku ?? "",
            description: item.description ?? "",
            photoUrl: item.photoUrl ?? "",
            stock: item.stock,
            minStock: item.minStock,
            notes: item.notes ?? "",
            isActive: item.isActive,
            unitPriceRub: item.unitPriceRub?.toString() ?? "",
            unitPriceCny: item.unitPriceCny?.toString() ?? "",
            priceCurrency: (item.priceCurrency as "RUB" | "CNY" | null) ?? "RUB",
            cnyRubRate: item.cnyRubRate?.toString() ?? "",
            ownerId: item.ownerId ?? "",
          }}
        />
      </div>
    </div>
  );
}
