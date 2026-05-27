import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { yearMonthToLabel } from "@/lib/format";

/**
 * План/Факт — НЕ продажи и НЕ рубли (Алёна).
 * План — это «выпуск продуктов»: сколько фасонов и штук каждый ответственный
 * должен выпустить за месяц. Факт — заказы с launchMonth=ym, owner=X:
 *   фасоны (count distinct productModelId) и штуки (sum of OrderLine.quantity).
 */
export default async function PlanVsFactPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  const sp = await searchParams;
  const year = Number(sp.year ?? new Date().getFullYear());

  const [plans, orders, users] = await Promise.all([
    prisma.monthlyPlan.findMany({
      where: { yearMonth: { gte: year * 100 + 1, lte: year * 100 + 12 } },
      include: { owner: { select: { id: true, name: true } } },
    }),
    prisma.order.findMany({
      where: {
        deletedAt: null,
        launchMonth: { gte: year * 100 + 1, lte: year * 100 + 12 },
      },
      select: {
        launchMonth: true,
        ownerId: true,
        productModelId: true,
        lines: { select: { quantity: true } },
      },
    }),
    prisma.user.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  // Считаем факт: (ym, ownerId) → { uniqueModels, totalUnits }
  type Fact = { uniqueModels: Set<string>; totalUnits: number };
  const factMap = new Map<string, Fact>();
  for (const o of orders) {
    const key = `${o.launchMonth}|${o.ownerId ?? ""}`;
    const f = factMap.get(key) ?? { uniqueModels: new Set<string>(), totalUnits: 0 };
    f.uniqueModels.add(o.productModelId);
    for (const l of o.lines) f.totalUnits += l.quantity;
    factMap.set(key, f);
  }

  // Список месяцев, по которым есть план или факт
  const months = new Set<number>();
  for (const p of plans) months.add(p.yearMonth);
  for (const o of orders) months.add(o.launchMonth);
  const sortedMonths = Array.from(months).sort();

  // Группируем планы по месяцу и ответственному
  type PlanRow = {
    ym: number;
    ownerId: string | null;
    ownerName: string;
    planModels: number;
    planUnits: number;
    factModels: number;
    factUnits: number;
  };
  const rows: PlanRow[] = [];
  for (const ym of sortedMonths) {
    const ymPlans = plans.filter((p) => p.yearMonth === ym);
    // Все ответственные, по которым есть план или факт за этот месяц
    const ownerIds = new Set<string | null>();
    for (const p of ymPlans) ownerIds.add(p.ownerId);
    for (const o of orders) if (o.launchMonth === ym) ownerIds.add(o.ownerId);

    for (const ownerId of ownerIds) {
      const owner = users.find((u) => u.id === ownerId);
      const planForOwner = ymPlans.filter((p) => p.ownerId === ownerId);
      const planModels = planForOwner.reduce((s, p) => s + (p.plannedModelCount ?? 0), 0);
      const planUnits = planForOwner.reduce((s, p) => s + (p.plannedQuantity ?? 0), 0);
      const f = factMap.get(`${ym}|${ownerId ?? ""}`);
      rows.push({
        ym,
        ownerId,
        ownerName: owner?.name ?? (ownerId ? "—" : "Без ответственного"),
        planModels,
        planUnits,
        factModels: f ? f.uniqueModels.size : 0,
        factUnits: f ? f.totalUnits : 0,
      });
    }
  }

  // Группируем для отображения по месяцу
  const byMonth = new Map<number, PlanRow[]>();
  for (const r of rows) {
    const arr = byMonth.get(r.ym) ?? [];
    arr.push(r);
    byMonth.set(r.ym, arr);
  }
  // Сортируем строки по имени ответственного
  for (const arr of byMonth.values()) {
    arr.sort((a, b) => a.ownerName.localeCompare(b.ownerName));
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">План / Факт выпуска {year}</h1>
          <p className="text-sm text-slate-500">
            Сколько фасонов и штук выпустил каждый ответственный относительно плана.
            Факт = заказы по месяцу запуска (launchMonth).
          </p>
        </div>
        <Link
          href="/admin/plans"
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
        >
          Редактировать план →
        </Link>
      </div>

      <div className="flex items-center gap-2 text-sm">
        <span className="text-slate-500">Год:</span>
        {[year - 1, year, year + 1].map((y) => (
          <Link
            key={y}
            href={`/plan-vs-fact?year=${y}`}
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              y === year ? "bg-slate-900 text-white" : "bg-white text-slate-700 border border-slate-300"
            }`}
          >
            {y}
          </Link>
        ))}
      </div>

      {sortedMonths.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center text-sm text-slate-500">
          На {year} год план и факт пустые.{" "}
          <Link href="/admin/plans" className="underline">
            Завести план
          </Link>
          .
        </div>
      ) : (
        <div className="space-y-4">
          {sortedMonths.map((ym) => {
            const arr = byMonth.get(ym) ?? [];
            const totalPlanModels = arr.reduce((s, r) => s + r.planModels, 0);
            const totalPlanUnits = arr.reduce((s, r) => s + r.planUnits, 0);
            const totalFactModels = arr.reduce((s, r) => s + r.factModels, 0);
            const totalFactUnits = arr.reduce((s, r) => s + r.factUnits, 0);
            return (
              <div key={ym} className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                <div className="flex items-baseline justify-between gap-3 border-b border-slate-100 bg-slate-50 px-4 py-2">
                  <div className="text-sm font-semibold capitalize text-slate-900">
                    {yearMonthToLabel(ym)}
                  </div>
                  <div className="text-xs text-slate-500">
                    Итого: фасонов <b className="text-slate-900">{totalFactModels}/{totalPlanModels || "—"}</b>{" · "}
                    штук <b className="text-slate-900">{totalFactUnits.toLocaleString("ru-RU")}/{totalPlanUnits ? totalPlanUnits.toLocaleString("ru-RU") : "—"}</b>
                  </div>
                </div>
                {/* Десктоп — таблица */}
                <table className="hidden min-w-full text-sm md:table">
                  <thead className="bg-white">
                    <tr>
                      <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase text-slate-500">Ответственный</th>
                      <th className="px-3 py-2 text-right text-[11px] font-semibold uppercase text-slate-500">Фасоны (факт/план)</th>
                      <th className="px-3 py-2 text-right text-[11px] font-semibold uppercase text-slate-500">Штуки (факт/план)</th>
                      <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase text-slate-500">Статус</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {arr.map((r) => {
                      const { status } = classifyRow(r);
                      return (
                        <tr key={`${r.ym}-${r.ownerId ?? "_"}`}>
                          <td className="px-3 py-2 font-medium text-slate-900">{r.ownerName}</td>
                          <td className="px-3 py-2 text-right text-slate-700">
                            {r.factModels} / {r.planModels || "—"}
                          </td>
                          <td className="px-3 py-2 text-right text-slate-700">
                            {r.factUnits.toLocaleString("ru-RU")} / {r.planUnits ? r.planUnits.toLocaleString("ru-RU") : "—"}
                          </td>
                          <td className="px-3 py-2">
                            <StatusChip status={status} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>

                {/* Мобильный — карточки. Таблица из 4 колонок на 390px нечитаема. */}
                <div className="divide-y divide-slate-100 md:hidden">
                  {arr.map((r) => {
                    const { status } = classifyRow(r);
                    const unitsPct = r.planUnits > 0 ? Math.min(100, Math.round((r.factUnits / r.planUnits) * 100)) : 0;
                    const modelsPct = r.planModels > 0 ? Math.min(100, Math.round((r.factModels / r.planModels) * 100)) : 0;
                    const barCls =
                      status === "ok" ? "bg-emerald-500"
                      : status === "warning" ? "bg-amber-500"
                      : status === "critical" ? "bg-red-500"
                      : "bg-slate-300";
                    return (
                      <div key={`${r.ym}-${r.ownerId ?? "_"}-m`} className="px-3 py-3">
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-sm font-semibold text-slate-900">{r.ownerName}</div>
                          <StatusChip status={status} />
                        </div>
                        <div className="mt-2 space-y-2 text-[12px]">
                          <PlanFactRow
                            label="Фасоны"
                            fact={r.factModels}
                            plan={r.planModels}
                            pct={modelsPct}
                            barCls={barCls}
                          />
                          <PlanFactRow
                            label="Штуки"
                            fact={r.factUnits}
                            plan={r.planUnits}
                            pct={unitsPct}
                            barCls={barCls}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

type RowStatus = "ok" | "warning" | "critical" | "no-plan";

function classifyRow(r: {
  planModels: number;
  planUnits: number;
  factModels: number;
  factUnits: number;
}): { status: RowStatus } {
  const modelsGap = r.factModels - r.planModels;
  const unitsGap = r.factUnits - r.planUnits;
  const hasPlan = r.planModels > 0 || r.planUnits > 0;
  const status: RowStatus = !hasPlan
    ? "no-plan"
    : modelsGap >= 0 && unitsGap >= 0
    ? "ok"
    : r.planUnits > 0 && Math.abs(unitsGap / r.planUnits) > 0.2
    ? "critical"
    : "warning";
  return { status };
}

function StatusChip({ status }: { status: RowStatus }) {
  if (status === "ok") return <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs text-emerald-700">✓ ОК</span>;
  if (status === "warning") return <span className="rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-700">⚠ Нужно ещё</span>;
  if (status === "critical") return <span className="rounded bg-red-100 px-2 py-0.5 text-xs text-red-700">🔴 Разрыв</span>;
  return <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-500">план не задан</span>;
}

function PlanFactRow({
  label,
  fact,
  plan,
  pct,
  barCls,
}: {
  label: string;
  fact: number;
  plan: number;
  pct: number;
  barCls: string;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-slate-500">{label}</span>
        <span className="tabular-nums text-slate-800">
          <b>{fact.toLocaleString("ru-RU")}</b>
          <span className="text-slate-400"> / {plan ? plan.toLocaleString("ru-RU") : "—"}</span>
        </span>
      </div>
      {plan > 0 && (
        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
          <div className={`h-full ${barCls}`} style={{ width: `${pct}%` }} />
        </div>
      )}
    </div>
  );
}
