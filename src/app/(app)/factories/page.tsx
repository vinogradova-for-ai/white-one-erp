import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { FactoriesAdmin, type FactoryRow } from "./factories-admin";

export default async function FactoriesAdminPage() {
  const session = await auth();
  if (!session || (session.user.role !== "OWNER" && session.user.role !== "DIRECTOR")) {
    redirect("/dashboard");
  }

  const factories = await prisma.factory.findMany({
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
    include: { _count: { select: { orders: true, preferredForModels: true } } },
  });

  const rows: FactoryRow[] = factories.map((f) => ({
    id: f.id,
    name: f.name,
    country: f.country,
    city: f.city,
    contactName: f.contactName,
    contactInfo: f.contactInfo,
    capacityPerMonth: f.capacityPerMonth,
    notes: f.notes,
    isActive: f.isActive,
    usedByOrders: f._count.orders,
    usedByModels: f._count.preferredForModels,
  }));

  const activeCount = rows.filter((r) => r.isActive).length;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Фабрики</h1>
        <p className="text-sm text-slate-500">
          Справочник фабрик для заказов на производство. Активных: {activeCount} из {rows.length}
        </p>
      </div>
      <FactoriesAdmin initialFactories={rows} />
    </div>
  );
}
