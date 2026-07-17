import { prisma } from "@/lib/prisma";
import { syncPackagingArrivalsCn, packagingBalances } from "@/server/packaging-stock";
import { InventoryClient, type InventoryRow } from "./inventory-client";

// Массовая инвентаризация упаковки: пересчитали склад — вводим факт по всем
// позициям одной таблицей. Каждый пересчёт = якорь учёта (Алёна 17.07).
export const dynamic = "force-dynamic";

export default async function PackagingInventoryPage() {
  await syncPackagingArrivalsCn();

  const items = await prisma.packagingItem.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true, sku: true, photoUrl: true },
  });
  const balances = await packagingBalances(items.map((i) => i.id));

  const rows: InventoryRow[] = items.map((i) => {
    const b = balances.get(i.id) ?? { cn: 0, msk: 0 };
    return { ...i, cn: b.cn, msk: b.msk };
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Инвентаризация упаковки</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Пересчитали склад — впиши факт. С этого числа учёт строится заново, история остаётся.
        </p>
      </div>
      <InventoryClient rows={rows} />
    </div>
  );
}
