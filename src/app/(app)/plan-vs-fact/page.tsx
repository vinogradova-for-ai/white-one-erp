import { prisma } from "@/lib/prisma";
import { formatCurrency, yearMonthToLabel } from "@/lib/format";
import { BRAND_LABELS } from "@/lib/constants";

export default async function PlanVsFactPage() {
  const year = new Date().getFullYear();
  const [plans, orders] = await Promise.all([
    prisma.monthlyPlan.findMany({
      where: { yearMonth: { gte: year * 100 + 1, lte: year * 100 + 12 } },
      orderBy: [{ yearMonth: "asc" }, { brand: "asc" }, { category: "asc" }],
    }),
    prisma.order.findMany({
      where: {
        deletedAt: null,
        launchMonth: { gte: year * 100 + 1, lte: year * 100 + 12 },
      },
      select: {
        launchMonth: true,
        plannedRevenue: true,
        product: { select: { brand: true, category: true } },
      },
    }),
  ]);

  // Aggregate orders by (yearMonth, brand, category)
  const actualMap = new Map<string, number>();
  for (const o of orders) {
    const key = `${o.launchMonth}|${o.product.brand}|${o.product.category}`;
    actualMap.set(key, (actualMap.get(key) ?? 0) + Number(o.plannedRevenue ?? 0));
  }

  // Group plans by month
  const months = Array.from(new Set(plans.map((p) => p.yearMonth))).sort();
  const rows = months.map((ym) => {
    const plansForMonth = plans.filter((p) => p.yearMonth === ym);
    const totalPlan = plansForMonth.reduce((s, p) => s + Number(p.plannedRevenue), 0);
    const totalFact = plansForMonth.reduce((s, p) => {
      const key = `${p.yearMonth}|${p.brand}|${p.category}`;
      return s + (actualMap.get(key) ?? 0);
    }, 0);
    const gap = totalFact - totalPlan;
    const gapPct = totalPlan > 0 ? (gap / totalPlan) * 100 : 0;
    return {
      ym,
      totalPlan,
      totalFact,
      gap,
      gapPct,
      details: plansForMonth.map((p) => {
        const key = `${p.yearMonth}|${p.brand}|${p.category}`;
        const fact = actualMap.get(key) ?? 0;
        const plan = Number(p.plannedRevenue);
        return { ...p, fact, plan, gap: fact - plan };
      }),
    };
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">План / Факт {year}</h1>
        <p className="text-sm text-slate-500">Агрегация заказов по месяцу начала продаж против плана продаж</p>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500">Месяц</th>
              <th className="px-3 py-2 text-right text-xs font-semibold uppercase text-slate-500">План</th>
              <th className="px-3 py-2 text-right text-xs font-semibold uppercase text-slate-500">Факт (из заказов)</th>
              <th className="px-3 py-2 text-right text-xs font-semibold uppercase text-slate-500">Разрыв</th>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500">Статус</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r) => {
              const status =
                r.totalPlan === 0
                  ? "ok"
                  : r.gapPct >= 0
                    ? "ok"
                    : Math.abs(r.gapPct) > 20
                      ? "critical"
                      : "warning";
              return (
                <tr key={r.ym}>
                  <td className="px-3 py-2 font-medium capitalize">{yearMonthToLabel(r.ym)}</td>
                  <td className="px-3 py-2 text-right">{formatCurrency(r.totalPlan)}</td>
                  <td className="px-3 py-2 text-right">{formatCurrency(r.totalFact)}</td>
                  <td className={`px-3 py-2 text-right ${r.gap < 0 ? "text-red-600" : "text-emerald-600"}`}>
                    {r.gap >= 0 ? "+" : ""}{formatCurrency(r.gap)}
                  </td>
                  <td className="px-3 py-2">
                    {status === "critical" && <span className="rounded bg-red-100 px-2 py-0.5 text-xs text-red-700">🔴 Разрыв {Math.round(Math.abs(r.gapPct))}%</span>}
                    {status === "warning" && <span className="rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-700">⚠ Нужно ещё заказов</span>}
                    {status === "ok" && <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs text-emerald-700">✓ ОК</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">Детализация по брендам и категориям</h2>
        <div className="grid gap-3 md:grid-cols-2">
          {rows.filter((r) => r.totalPlan > 0).map((r) => (
            <div key={r.ym} className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="mb-2 text-sm font-medium capitalize text-slate-900">{yearMonthToLabel(r.ym)}</div>
              <div className="space-y-1 text-xs">
                {r.details.map((d) => (
                  <div key={d.id} className="flex justify-between">
                    <span className="text-slate-600">{BRAND_LABELS[d.brand]} · {d.category}</span>
                    <span className={d.gap < 0 ? "text-red-600" : "text-slate-900"}>
                      {formatCurrency(d.fact)} / {formatCurrency(d.plan)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
