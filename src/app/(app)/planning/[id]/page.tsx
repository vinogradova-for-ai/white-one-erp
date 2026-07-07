import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { can } from "@/lib/rbac";
import type { Role } from "@prisma/client";
import { BRAND_PLAN_STATUS_LABELS, BRAND_PLAN_STATUS_COLORS } from "@/lib/validators/brand-plan";
import { orderTotalCost, MODEL_COST_SELECT } from "@/lib/queries/stats-page";
import { PlanModelsManager, DetachModelButton } from "@/components/planning/plan-models-manager";
import { formatDate } from "@/lib/format";

const fmt = (n: number) => Math.round(n).toLocaleString("ru-RU");

export default async function BrandPlanDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  const role = session?.user?.role as Role | undefined;
  const canManage = role ? can(role, "plan.manage") : false;

  const plan = await prisma.brandPlan.findUnique({
    where: { id },
    include: {
      owner: { select: { name: true } },
      models: {
        where: { deletedAt: null },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          name: true,
          category: true,
          status: true,
          ...MODEL_COST_SELECT,
          orders: {
            where: { deletedAt: null },
            select: {
              id: true,
              orderNumber: true,
              lines: { select: { quantity: true, batchCost: true, snapshotFullCost: true } },
            },
          },
        },
      },
    },
  });
  if (!plan) return notFound();

  // Свободные фасоны для привязки (не в других планах)
  const freeModels = canManage
    ? await prisma.productModel.findMany({
        where: { deletedAt: null, brandPlanId: null },
        orderBy: { createdAt: "desc" },
        select: { id: true, name: true, category: true },
        take: 300,
      })
    : [];

  const modelRows = plan.models.map((m) => {
    const spent = m.orders.reduce((s, o) => s + orderTotalCost(o.lines, m), 0);
    const units = m.orders.reduce((s, o) => s + o.lines.reduce((a, l) => a + l.quantity, 0), 0);
    return { m, spent, units };
  });
  const spent = modelRows.reduce((s, r) => s + r.spent, 0);

  const budget = plan.budgetRub != null ? Number(plan.budgetRub) : null;
  const estimate =
    plan.plannedModelsCount != null && plan.plannedUnitsPerModel != null && plan.targetUnitPriceCny != null && plan.cnyRubRate != null
      ? plan.plannedModelsCount * plan.plannedUnitsPerModel * Number(plan.targetUnitPriceCny) * Number(plan.cnyRubRate)
      : null;
  const ceiling = budget ?? estimate;
  const over = ceiling != null && spent > ceiling;
  const pct = ceiling != null && ceiling > 0 ? Math.min(100, Math.round((spent / ceiling) * 100)) : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-start">
        <div className="min-w-0">
          <div className="text-xs text-slate-500">
            <Link href="/planning" className="hover:underline">Планирование</Link>
          </div>
          <h1 className="text-2xl font-semibold text-slate-900">{plan.name}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <span className={`rounded px-2 py-0.5 ${BRAND_PLAN_STATUS_COLORS[plan.status]}`}>
              {BRAND_PLAN_STATUS_LABELS[plan.status]}
            </span>
            {plan.season && <span>{plan.season}</span>}
            {plan.targetDate && <span>запуститься к {formatDate(plan.targetDate)}</span>}
            {plan.owner && <span>Ответственный: {plan.owner.name}</span>}
          </div>
        </div>
        {canManage && (
          <Link
            href={`/planning/${plan.id}/edit`}
            className="shrink-0 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
          >
            Редактировать
          </Link>
        )}
      </div>

      {/* Рамка и план/факт */}
      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Фасоны</div>
          <div className="mt-1 text-2xl font-semibold text-slate-900">
            {plan.models.length}
            {plan.plannedModelsCount != null && (
              <span className="text-base font-normal text-slate-500"> из {plan.plannedModelsCount} задуманных</span>
            )}
          </div>
          {plan.plannedUnitsPerModel != null && (
            <div className="mt-1 text-xs text-slate-500">тестовая партия ~{plan.plannedUnitsPerModel} шт на фасон</div>
          )}
        </div>

        <div className={`rounded-2xl border p-4 ${over ? "border-red-200 bg-red-50 dark:border-red-400/20 dark:bg-red-400/10" : "border-slate-200 bg-white"}`}>
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Потрачено (по заказам)</div>
          <div className={`mt-1 text-2xl font-semibold ${over ? "text-red-700 dark:text-red-300" : "text-slate-900"}`}>
            {fmt(spent)} ₽
          </div>
          {ceiling != null && (
            <>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200/70">
                <div className={`h-full rounded-full ${over ? "bg-red-500" : "bg-emerald-500"}`} style={{ width: `${pct}%` }} />
              </div>
              <div className="mt-1 text-xs text-slate-500">
                {over
                  ? `превышение на ${fmt(spent - ceiling)} ₽`
                  : `осталось ${fmt(ceiling - spent)} ₽ из ${fmt(ceiling)} ₽`}
              </div>
            </>
          )}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Рамка</div>
          <div className="mt-1 space-y-1 text-sm text-slate-700">
            {plan.targetUnitPriceCny != null && (
              <div>
                закупка ~<span className="font-semibold">{Number(plan.targetUnitPriceCny)} ¥</span>
                {plan.cnyRubRate != null && <span className="text-slate-500"> (курс {Number(plan.cnyRubRate)})</span>}
              </div>
            )}
            {budget != null && (
              <div>
                потолок <span className="font-semibold">{fmt(budget)} ₽</span>
              </div>
            )}
            {estimate != null && (
              <div className="text-xs text-slate-500">
                прикидка теста ≈ {fmt(estimate)} ₽
                {budget != null && (estimate > budget ? " — выше потолка ⚠️" : " — влезает")}
              </div>
            )}
            {plan.targetUnitPriceCny == null && budget == null && <div className="text-slate-400">не задана</div>}
          </div>
        </div>
      </div>

      {plan.notes && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Заметки</h2>
          <p className="whitespace-pre-line text-sm text-slate-700">{plan.notes}</p>
        </div>
      )}

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-slate-900">Фасоны плана ({plan.models.length})</h2>
          <PlanModelsManager planId={plan.id} freeModels={freeModels} canManage={canManage} />
        </div>

        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500">Фасон</th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500">Категория</th>
                <th className="px-3 py-2 text-right text-xs font-semibold uppercase text-slate-500">Заказано, шт</th>
                <th className="px-3 py-2 text-right text-xs font-semibold uppercase text-slate-500">Затраты, ₽</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {modelRows.map(({ m, spent: mSpent, units }) => (
                <tr key={m.id}>
                  <td className="px-3 py-2">
                    <Link href={`/models/${m.id}`} className="font-medium text-slate-900 hover:underline">
                      {m.name}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-xs text-slate-600">{m.category}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{units > 0 ? units.toLocaleString("ru-RU") : "—"}</td>
                  <td className="px-3 py-2 text-right font-medium tabular-nums">{mSpent > 0 ? fmt(mSpent) : "—"}</td>
                  <td className="px-3 py-2 text-right">
                    {canManage && <DetachModelButton planId={plan.id} modelId={m.id} />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {plan.models.length === 0 && (
            <div className="p-8 text-center text-sm text-slate-500">
              Фасонов пока нет. Продакты создают фасоны в «Фасонах», здесь их привязываем к плану — и затраты
              начнут считаться против потолка.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
