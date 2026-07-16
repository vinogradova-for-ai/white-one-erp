import Link from "next/link";
import { SEASONS } from "@/lib/seasons";
import {
  getSeasonOverview,
  getAllSeasonsSummary,
  type SeasonOverview,
} from "@/lib/queries/season-goals";
import { FillPlanButton } from "./fill-plan-button";

/**
 * «Цели сезона» — обзорная панель руководителя продукт-отдела.
 * Одним взглядом: цель → прогресс → раскладка по PM/категориям/месяцам → заторы.
 *
 * Дефолтный сезон в табе — текущий по дате (если сегодня ∈ месяцам сезона),
 * иначе — ближайший будущий, иначе — первый в SEASONS.
 */
export const dynamic = "force-dynamic";

export default async function SeasonsPage({
  searchParams,
}: {
  searchParams: Promise<{ s?: string }>;
}) {
  const sp = await searchParams;
  const today = new Date();
  const todayYm = today.getFullYear() * 100 + (today.getMonth() + 1);
  const currentSeason = SEASONS.find((s) => s.months.includes(todayYm));
  const upcomingSeason = SEASONS.find((s) => s.months.some((m) => m >= todayYm));
  const defaultKey = currentSeason?.key ?? upcomingSeason?.key ?? SEASONS[0].key;
  const activeKey = sp.s && SEASONS.some((s) => s.key === sp.s) ? sp.s : defaultKey;

  // Честная заглушка: сегодня за пределами всех описанных сезонов (нет ни
  // текущего, ни будущего). Раньше экран молча откатывался на «Лето 2026» и
  // показывал прошлогодние данные как дефолт. Теперь — заметный баннер, чтобы
  // добавить сезоны на новый год (аудит блок ④).
  const noSeasonForToday = !currentSeason && !upcomingSeason;
  const currentYear = today.getFullYear();

  const [overview, summaries] = await Promise.all([
    getSeasonOverview(activeKey),
    getAllSeasonsSummary(),
  ]);

  if (!overview) {
    return <div className="p-6 text-sm text-slate-500">Сезон не найден.</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 md:text-2xl">Цели</h1>
          <p className="text-sm text-slate-500">
            10 артикулов и 20 000 шт в месяц — общая цель отдела.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <FillPlanButton />
          <Link
            href="/plan-vs-fact"
            className="flex h-10 items-center rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-700 hover:bg-slate-50 active:bg-slate-100"
          >
            План/Факт →
          </Link>
          <Link
            href="/admin/plans"
            className="flex h-10 items-center rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-700 hover:bg-slate-50 active:bg-slate-100"
          >
            Редактировать план →
          </Link>
        </div>
      </div>

      {noSeasonForToday && (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-300">
          ⚠️ Сезоны на {currentYear} год не настроены — показан последний
          описанный сезон, данные могут быть неактуальны. Добавьте сезоны на{" "}
          {currentYear} в <code className="rounded bg-amber-100 px-1 dark:bg-amber-400/10">src/lib/seasons.ts</code>.
        </div>
      )}

      {/* Табы сезонов — одна прокручиваемая строка на мобиле */}
      <div className="no-scrollbar -mx-4 flex gap-1.5 overflow-x-auto px-4 md:mx-0 md:flex-wrap md:px-0">
        {summaries.map((s) => {
          const active = s.season.key === activeKey;
          const factPct = s.goalQuantity > 0 ? Math.round((s.factQuantity / s.goalQuantity) * 100) : 0;
          return (
            <Link
              key={s.season.key}
              href={`/seasons?s=${s.season.key}`}
              className={`inline-flex min-h-[40px] shrink-0 items-center gap-2 rounded-full border px-3 text-sm transition ${
                active
                  ? "border-slate-900 bg-slate-900 text-white"
                  : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
              }`}
            >
              <span className="font-medium">{s.season.title}</span>
              <span
                className={`rounded-full px-1.5 py-0.5 text-[11px] font-semibold ${
                  active ? "bg-white/20 text-white" : "bg-slate-100 text-slate-700"
                }`}
              >
                {factPct}%
              </span>
            </Link>
          );
        })}
      </div>

      <SeasonHeadline overview={overview} />

      {/* Heatmap по месяцам */}
      <Section title="Нагрузка по месяцам" hint="План vs Факт по штукам">
        <MonthlyHeatmap overview={overview} />
      </Section>

      {/* По PM */}
      <Section title="По продакт-менеджерам" hint="Кто сколько везёт">
        <OwnersBreakdown overview={overview} />
      </Section>

      {/* По категориям */}
      <Section title="По категориям сезона" hint="Что в плане и что уже сделано">
        <CategoriesBreakdown overview={overview} />
      </Section>

      {/* Заторы */}
      <Section title="Заторы" hint="Что мешает добежать до цели">
        <Blockers overview={overview} />
      </Section>
    </div>
  );
}

function SeasonHeadline({ overview }: { overview: SeasonOverview }) {
  const factModelPct = overview.goalModels > 0 ? Math.min(100, Math.round((overview.factModels / overview.goalModels) * 100)) : 0;
  const factQtyPct = overview.goalQuantity > 0 ? Math.min(100, Math.round((overview.factQuantity / overview.goalQuantity) * 100)) : 0;
  const planModelGap = overview.goalModels - overview.plannedModels;
  const planQtyGap = overview.goalQuantity - overview.plannedQuantity;
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <div className="text-xs uppercase tracking-wide text-slate-400">{overview.season.title}</div>
          <div className="text-lg font-semibold text-slate-900">
            Цель: <b>{overview.goalModels}</b> артикулов · <b>{overview.goalQuantity.toLocaleString("ru-RU")}</b> шт
          </div>
        </div>
        <div className="text-xs text-slate-500">
          {overview.season.months.length} мес · 10/мес × {overview.season.months.length}
        </div>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <GoalBar
          label="Артикулы"
          fact={overview.factModels}
          plan={overview.plannedModels}
          goal={overview.goalModels}
          pct={factModelPct}
          gap={planModelGap}
        />
        <GoalBar
          label="Штуки"
          fact={overview.factQuantity}
          plan={overview.plannedQuantity}
          goal={overview.goalQuantity}
          pct={factQtyPct}
          gap={planQtyGap}
        />
      </div>
    </div>
  );
}

function GoalBar({
  label, fact, plan, goal, pct, gap,
}: {
  label: string; fact: number; plan: number; goal: number; pct: number; gap: number;
}) {
  // planPct — насколько план покрывает цель.
  const planPct = goal > 0 ? Math.min(100, Math.round((plan / goal) * 100)) : 0;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <div className="text-sm font-medium text-slate-700">{label}</div>
        <div className="text-sm tabular-nums text-slate-800">
          <b>{fact.toLocaleString("ru-RU")}</b>
          <span className="text-slate-400"> / план {plan.toLocaleString("ru-RU")}</span>
          <span className="text-slate-400"> / цель {goal.toLocaleString("ru-RU")}</span>
        </div>
      </div>
      {/* Двойной бар: подложка = цель, синяя = план, зелёная = факт */}
      <div className="relative mt-1.5 h-2.5 overflow-hidden rounded-full bg-slate-100">
        <div className="absolute inset-y-0 left-0 bg-blue-100 dark:bg-blue-400/15" style={{ width: `${planPct}%` }} />
        <div
          className={`absolute inset-y-0 left-0 ${pct >= 90 ? "bg-emerald-500" : pct >= 50 ? "bg-amber-500" : "bg-red-400"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="mt-1 flex items-baseline justify-between gap-2 text-[11px] text-slate-500">
        <span>{pct}% к цели</span>
        {gap > 0 && <span className="text-amber-700 dark:text-amber-300">план короче цели на {gap.toLocaleString("ru-RU")}</span>}
        {gap === 0 && <span className="text-emerald-700 dark:text-emerald-300">план = цели</span>}
        {gap < 0 && <span className="text-blue-700 dark:text-blue-300">план выше цели на {(-gap).toLocaleString("ru-RU")}</span>}
      </div>
    </div>
  );
}

function MonthlyHeatmap({ overview }: { overview: SeasonOverview }) {
  return (
    <div className="grid gap-2 sm:grid-cols-3">
      {overview.monthly.map((m) => {
        const cls =
          m.loadStatus === "ok" ? "border-emerald-200 bg-emerald-50 dark:border-emerald-400/20 dark:bg-emerald-400/10"
          : m.loadStatus === "underplan" ? "border-amber-200 bg-amber-50 dark:border-amber-400/20 dark:bg-amber-400/10"
          : m.loadStatus === "overload" ? "border-red-200 bg-red-50 dark:border-red-400/20 dark:bg-red-400/10"
          : m.loadStatus === "gap" ? "border-slate-300 bg-slate-50 border-dashed"
          : "border-slate-200 bg-white";
        const label =
          m.loadStatus === "ok" ? "🟢 в плане"
          : m.loadStatus === "underplan" ? "🟡 копится"
          : m.loadStatus === "overload" ? "🔴 факт сильно ниже плана"
          : m.loadStatus === "gap" ? "⚪ план не задан"
          : "📅 впереди";
        const pct = m.plannedQuantity > 0 ? Math.min(100, Math.round((m.factQuantity / m.plannedQuantity) * 100)) : 0;
        return (
          <div key={m.yearMonth} className={`rounded-xl border p-3 ${cls}`}>
            <div className="flex items-baseline justify-between gap-2">
              <div className="text-sm font-semibold capitalize text-slate-900">{m.label}</div>
              <div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-1.5 text-xs">
              <Cell title="Артикулы" fact={m.factModels} plan={m.plannedModels} />
              <Cell title="Штуки" fact={m.factQuantity} plan={m.plannedQuantity} />
            </div>
            {m.plannedQuantity > 0 && (
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/70">
                <div
                  className={`h-full ${pct >= 90 ? "bg-emerald-500" : pct >= 50 ? "bg-amber-500" : "bg-red-400"}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            )}
            {/* §4 UX-аудита: у «план не задан» — кнопка задания плана прямо в ячейке */}
            {m.loadStatus === "gap" && (
              <Link
                href={`/admin/plans?year=${Math.floor(m.yearMonth / 100)}`}
                className="mt-2 inline-flex min-h-[36px] items-center rounded-lg border border-slate-300 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
              >
                Задать план →
              </Link>
            )}
          </div>
        );
      })}
    </div>
  );
}

function Cell({ title, fact, plan }: { title: string; fact: number; plan: number }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-slate-400">{title}</div>
      <div className="tabular-nums text-slate-800">
        <b>{fact.toLocaleString("ru-RU")}</b>
        <span className="text-slate-400"> / {plan ? plan.toLocaleString("ru-RU") : "—"}</span>
      </div>
    </div>
  );
}

function OwnersBreakdown({ overview }: { overview: SeasonOverview }) {
  if (overview.byOwner.length === 0) {
    return <Empty>Пока никому ничего не назначено в этом сезоне.</Empty>;
  }
  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {overview.byOwner.map((o) => {
        const qtyPct = o.plannedQuantity > 0 ? Math.min(100, Math.round((o.factQuantity / o.plannedQuantity) * 100)) : 0;
        const status = o.plannedQuantity === 0
          ? "no-plan"
          : qtyPct >= 90 ? "ok"
          : qtyPct >= 50 ? "warning"
          : "critical";
        const barCls =
          status === "ok" ? "bg-emerald-500"
          : status === "warning" ? "bg-amber-500"
          : status === "critical" ? "bg-red-400"
          : "bg-slate-300";
        const chipCls =
          status === "ok" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-300"
          : status === "warning" ? "bg-amber-100 text-amber-700 dark:bg-amber-400/10 dark:text-amber-300"
          : status === "critical" ? "bg-red-100 text-red-700 dark:bg-red-400/10 dark:text-red-300"
          : "bg-slate-100 text-slate-500";
        const chipLabel =
          status === "ok" ? "✓ ОК"
          : status === "warning" ? "⚠ Догоняем"
          : status === "critical" ? "🔴 Разрыв"
          : "план не задан";
        return (
          <div key={o.ownerId ?? "_none"} className="rounded-xl border border-slate-200 bg-white p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm font-semibold text-slate-900">{o.ownerName}</div>
              <span className={`rounded px-2 py-0.5 text-[11px] ${chipCls}`}>{chipLabel}</span>
            </div>
            <div className="mt-2 space-y-1.5 text-[12px]">
              <PlanFactLine label="Артикулы" fact={o.factModels} plan={o.plannedModels} />
              <PlanFactLine label="Штуки" fact={o.factQuantity} plan={o.plannedQuantity} />
            </div>
            {o.plannedQuantity > 0 && (
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
                <div className={`h-full ${barCls}`} style={{ width: `${qtyPct}%` }} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function PlanFactLine({ label, fact, plan }: { label: string; fact: number; plan: number }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-slate-500">{label}</span>
      <span className="tabular-nums text-slate-800">
        <b>{fact.toLocaleString("ru-RU")}</b>
        <span className="text-slate-400"> / {plan ? plan.toLocaleString("ru-RU") : "—"}</span>
      </span>
    </div>
  );
}

function CategoriesBreakdown({ overview }: { overview: SeasonOverview }) {
  return (
    <div className="flex flex-wrap gap-2">
      {overview.byCategory.map((c) => {
        const pct = c.plannedModels > 0 ? Math.min(100, Math.round((c.factModels / c.plannedModels) * 100)) : 0;
        const status: "ok" | "warning" | "critical" | "no-plan" = c.plannedModels === 0
          ? "no-plan"
          : pct >= 90 ? "ok"
          : pct >= 50 ? "warning"
          : "critical";
        const ringCls =
          status === "ok" ? "border-emerald-300 dark:border-emerald-400/20"
          : status === "warning" ? "border-amber-300 dark:border-amber-400/20"
          : status === "critical" ? "border-red-300 dark:border-red-400/20"
          : "border-slate-200";
        return (
          <div
            key={c.category}
            className={`inline-flex flex-col gap-0.5 rounded-xl border bg-white px-3 py-2 ${ringCls}`}
          >
            <div className="text-sm font-medium text-slate-900">{c.category}</div>
            <div className="text-[11px] tabular-nums text-slate-600">
              <b>{c.factModels}</b>
              <span className="text-slate-400"> / {c.plannedModels || "—"}</span>
              <span className="ml-1 text-slate-400">арт</span>
              {c.factQuantity > 0 && (
                <>
                  <span className="text-slate-300"> · </span>
                  <span className="text-slate-700">{c.factQuantity.toLocaleString("ru-RU")} шт</span>
                </>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Blockers({ overview }: { overview: SeasonOverview }) {
  // §4 UX-аудита: красный месяц (план есть, факт сильно ниже) — это тоже затор.
  // Раньше при 🔴 в heatmap секция говорила «Заторов нет» — врала.
  const redMonths = overview.monthly.filter((m) => m.loadStatus === "overload");
  if (overview.blockers.length === 0 && redMonths.length === 0) {
    return <Empty>Заторов нет — всё движется по плану.</Empty>;
  }
  return (
    <div className="space-y-2">
      {redMonths.length > 0 && (
        <ul className="divide-y divide-red-100 overflow-hidden rounded-2xl border border-red-200 bg-red-50/50 dark:divide-red-400/10 dark:border-red-400/20 dark:bg-red-400/10">
          {redMonths.map((m) => {
            const pct = m.plannedQuantity > 0 ? Math.round((m.factQuantity / m.plannedQuantity) * 100) : 0;
            return (
              <li key={m.yearMonth} className="px-4 py-2.5 text-sm">
                <Link href="/plan-vs-fact" className="block">
                  <div className="flex items-baseline justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate font-medium capitalize text-red-800 dark:text-red-300">🔴 {m.label} — факт сильно ниже плана</div>
                      <div className="truncate text-[11px] text-red-700/80 dark:text-red-300/80">
                        {m.factQuantity.toLocaleString("ru-RU")} из {m.plannedQuantity.toLocaleString("ru-RU")} шт ({pct}%) · открыть План/Факт →
                      </div>
                    </div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      {overview.blockers.length > 0 && (
        <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white">
          {overview.blockers.map((b, i) => (
            <li key={i} className="px-4 py-2.5 text-sm">
              <Link href={`/models/${b.modelId}`} className="block hover:bg-slate-50">
                <div className="flex items-baseline justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate font-medium text-slate-900">{b.modelName}</div>
                    <div className="truncate text-[11px] text-slate-500">{b.text}</div>
                  </div>
                  <div className="shrink-0 text-[11px] text-slate-400">{b.ownerName}</div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-2 flex items-baseline gap-2 px-1">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-700">{title}</h2>
        {hint && <span className="text-xs text-slate-400">{hint}</span>}
      </div>
      {children}
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-6 text-center text-sm text-slate-500">
      {children}
    </div>
  );
}
