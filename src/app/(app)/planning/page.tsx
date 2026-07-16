import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { BRAND_PLAN_STATUS_LABELS, BRAND_PLAN_STATUS_COLORS } from "@/lib/validators/brand-plan";
import { orderTotalCost, MODEL_COST_SELECT } from "@/lib/queries/stats-page";
import { formatDate } from "@/lib/format";

// «Планирование» — направления развития бренда: рамка (сколько фасонов, потолок
// денег) и факт (создано фасонов, потрачено по заказам) по каждому направлению.
export default async function PlanningPage() {
  const plans = await prisma.brandPlan.findMany({
    orderBy: [{ createdAt: "desc" }],
    include: {
      owner: { select: { name: true } },
      models: {
        where: { deletedAt: null },
        select: {
          id: true,
          ...MODEL_COST_SELECT,
          orders: {
            where: { deletedAt: null },
            select: { lines: { select: { quantity: true, batchCost: true, snapshotFullCost: true } } },
          },
        },
      },
    },
  });

  const rows = plans.map((p) => {
    const spent = p.models.reduce(
      (sum, m) => sum + m.orders.reduce((s, o) => s + orderTotalCost(o.lines, m), 0),
      0,
    );
    const estimate =
      p.plannedModelsCount != null && p.plannedUnitsPerModel != null && p.targetUnitPriceCny != null && p.cnyRubRate != null
        ? p.plannedModelsCount * p.plannedUnitsPerModel * Number(p.targetUnitPriceCny) * Number(p.cnyRubRate)
        : null;
    return { plan: p, spent, estimate };
  });

  const fmt = (n: number) => Math.round(n).toLocaleString("ru-RU");

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 md:text-2xl">Планирование</h1>
          <p className="text-sm text-slate-500">
            Куда идёт бренд: направления, рамка по деньгам и план/факт.
          </p>
        </div>
        <Link
          href="/planning/new"
          className="flex h-11 shrink-0 items-center rounded-lg bg-slate-900 px-4 text-sm font-medium text-white hover:bg-slate-800"
        >
          + План
        </Link>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {rows.map(({ plan: p, spent, estimate }) => {
          const budget = p.budgetRub != null ? Number(p.budgetRub) : null;
          const over = budget != null && spent > budget;
          const pct = budget != null && budget > 0 ? Math.min(100, Math.round((spent / budget) * 100)) : null;
          return (
            <Link
              key={p.id}
              href={`/planning/${p.id}`}
              className={`block rounded-2xl border bg-white p-4 hover:border-slate-300 ${p.status === "CANCELLED" ? "opacity-60" : ""} border-slate-200`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate font-medium text-slate-900">{p.name}</div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500">
                    {p.season && <span>{p.season}</span>}
                    {p.targetDate && <span>к {formatDate(p.targetDate)}</span>}
                    {p.owner && <span>{p.owner.name}</span>}
                  </div>
                </div>
                <span className={`shrink-0 rounded px-2 py-0.5 text-xs ${BRAND_PLAN_STATUS_COLORS[p.status]}`}>
                  {BRAND_PLAN_STATUS_LABELS[p.status]}
                </span>
              </div>

              <div className="mt-3 grid grid-cols-3 gap-2 text-[11px]">
                <div>
                  <div className="text-slate-400">Фасоны</div>
                  <div className="font-semibold text-slate-900">
                    {p.models.length}
                    {p.plannedModelsCount != null && <span className="font-normal text-slate-500"> из {p.plannedModelsCount}</span>}
                  </div>
                </div>
                <div>
                  <div className="text-slate-400">Потрачено</div>
                  <div className={`font-semibold ${over ? "text-red-700 dark:text-red-300" : "text-slate-900"}`}>
                    {spent > 0 ? `${fmt(spent)} ₽` : "—"}
                  </div>
                </div>
                <div>
                  <div className="text-slate-400">Потолок</div>
                  <div className="font-semibold text-slate-900">{budget != null ? `${fmt(budget)} ₽` : estimate != null ? `≈${fmt(estimate)} ₽` : "—"}</div>
                </div>
              </div>

              {pct != null && (
                <div className="mt-2">
                  <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className={`h-full rounded-full ${over ? "bg-red-500" : "bg-emerald-500"}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <div className="mt-0.5 text-[10px] text-slate-400">
                    {over ? `превышение потолка` : `${pct}% бюджета`}
                  </div>
                </div>
              )}
            </Link>
          );
        })}
      </div>

      {rows.length === 0 && (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center text-sm text-slate-500">
          <div className="mb-2 text-3xl">🧭</div>
          Планов пока нет. Первый: куда идём и сколько готовы потратить.{" "}
          <Link href="/planning/new" className="text-slate-900 underline">Создать</Link>
        </div>
      )}
    </div>
  );
}
