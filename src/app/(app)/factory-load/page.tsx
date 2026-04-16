import { prisma } from "@/lib/prisma";
import { formatNumber, yearMonthToLabel } from "@/lib/format";

export default async function FactoryLoadPage() {
  const year = 2026;
  const [factories, orders] = await Promise.all([
    prisma.factory.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
    prisma.order.findMany({
      where: { deletedAt: null, launchMonth: { gte: year * 100 + 1, lte: year * 100 + 12 } },
      select: { factoryId: true, launchMonth: true, quantity: true },
    }),
  ]);

  const months = Array.from({ length: 12 }, (_, i) => year * 100 + (i + 1));
  const matrix: Record<string, Record<number, number>> = {};
  for (const f of factories) {
    matrix[f.id] = {};
    for (const m of months) matrix[f.id][m] = 0;
  }
  for (const o of orders) {
    if (!o.factoryId || !matrix[o.factoryId]) continue;
    matrix[o.factoryId][o.launchMonth] = (matrix[o.factoryId][o.launchMonth] ?? 0) + o.quantity;
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Загрузка фабрик {year}</h1>
        <p className="text-sm text-slate-500">Количество штук в заказах по месяцу запуска продаж</p>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="sticky left-0 z-10 bg-slate-50 px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500">Фабрика</th>
              <th className="px-3 py-2 text-right text-xs font-semibold uppercase text-slate-500">Мощн./мес</th>
              {months.map((m) => (
                <th key={m} className="px-3 py-2 text-right text-xs font-semibold uppercase text-slate-500 capitalize">
                  {yearMonthToLabel(m).split(" ")[0]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {factories.map((f) => (
              <tr key={f.id} className="hover:bg-slate-50">
                <td className="sticky left-0 z-10 bg-white px-3 py-2 font-medium">
                  {f.name}
                  <div className="text-xs text-slate-500">{f.country}</div>
                </td>
                <td className="px-3 py-2 text-right text-xs text-slate-500">{f.capacityPerMonth ? formatNumber(f.capacityPerMonth) : "—"}</td>
                {months.map((m) => {
                  const qty = matrix[f.id]?.[m] ?? 0;
                  const pct = f.capacityPerMonth ? (qty / f.capacityPerMonth) * 100 : null;
                  const overload = pct !== null && pct > 100;
                  const warning = pct !== null && pct > 70 && pct <= 100;
                  return (
                    <td key={m} className={`px-3 py-2 text-right text-xs ${overload ? "bg-red-50 font-medium text-red-700" : warning ? "bg-amber-50 text-amber-700" : ""}`}>
                      {qty > 0 ? formatNumber(qty) : <span className="text-slate-300">0</span>}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
