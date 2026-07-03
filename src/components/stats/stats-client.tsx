"use client";

import { useRouter } from "next/navigation";
import { usePersistedState } from "@/lib/use-persisted-state";
import { FilterDropdown } from "@/components/common/filter-dropdown";
import type { StatsPage, TrendMetricKey } from "@/lib/queries/stats-page";
import type { TeamMonthStats } from "@/lib/queries/team-month-stats";
import type { OwnerProjects } from "@/lib/queries/team-projects";
import { TeamMonthSection } from "@/components/dashboard/team-month-section";
import { TrendChart } from "./trend-chart";
import { MonthCompareCards } from "./month-compare";
import { PeopleTable } from "./people-table";
import { FactoriesTable } from "./factories-table";
import { MoneyCards } from "./money-cards";

/**
 * Клиент страницы «Статистика». Держит два переключателя (метрика и период) в
 * localStorage, фильтр «Ответственный» — в URL (перезапрашивает серверный расчёт).
 *
 * Стиль — как team-month-section: тихие карточки, цветные заливки только там, где
 * нужно (бары тренда, дельты), у ВСЕХ цветных элементов есть dark:-варианты.
 */

const METRICS: Array<{ key: TrendMetricKey; label: string }> = [
  { key: "units", label: "Штуки" },
  { key: "models", label: "Фасоны" },
  { key: "money", label: "Деньги" },
];

const PERIODS: Array<{ value: 6 | 12; label: string }> = [
  { value: 6, label: "6 мес" },
  { value: 12, label: "12 мес" },
];

const MONTH_NAMES_RU = [
  "январь", "февраль", "март", "апрель", "май", "июнь",
  "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь",
];

function ymTitle(yearMonth: number): string {
  const month = (yearMonth % 100) - 1;
  const year = Math.floor(yearMonth / 100);
  return `${MONTH_NAMES_RU[month]} ${year}`;
}

export function StatsClient({
  stats,
  teamMonth,
  projects,
  selectedOwnerId,
}: {
  stats: StatsPage;
  teamMonth: TeamMonthStats;
  projects: Record<string, OwnerProjects>;
  selectedOwnerId: string | null;
}) {
  const router = useRouter();
  const [metric, setMetric] = usePersistedState<TrendMetricKey>("stats:metric:v1", "units");
  const [period, setPeriod] = usePersistedState<6 | 12>("stats:period:v1", 6);

  // Тренд приходит на 12 месяцев — режем «хвост» до выбранного периода.
  const trend = stats.trend.slice(-period);

  // Смена фильтра «Ответственный» — через URL (перезапрос серверного расчёта).
  // Выбранный месяц (?month=) сохраняем — раньше сбрасывался (хэндофф 02.07).
  const setOwner = (ids: string[]) => {
    const id = ids[0] ?? null;
    const params = new URLSearchParams(window.location.search);
    if (id) params.set("owner", id);
    else params.delete("owner");
    const qs = params.toString();
    router.push(qs ? `/stats?${qs}` : "/stats");
  };

  const ownerOptions = stats.owners.map((o) => ({ value: o.id, label: o.name }));
  const ownerValue = selectedOwnerId ? [selectedOwnerId] : [];

  return (
    <div className="space-y-6">
      {/* Заголовок + фильтр «Ответственный» */}
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Статистика</h1>
          <p className="text-sm text-slate-600">Операционка отдела продукта · {ymTitle(stats.yearMonth)}</p>
        </div>
        <div className="ml-auto">
          <FilterDropdown
            label="Ответственный"
            options={ownerOptions}
            value={ownerValue}
            onChange={setOwner}
          />
        </div>
      </div>

      {/* Команда в месяце + проекты по людям (переехали с дашборда) */}
      <TeamMonthSection
        stats={teamMonth}
        selectedOwnerId={selectedOwnerId}
        basePath="/stats"
        projects={projects}
      />

      {/* Тренд */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-base font-semibold text-slate-900">Тренд</h2>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Toggle
              options={METRICS.map((m) => ({ value: m.key, label: m.label }))}
              value={metric}
              onChange={(v) => setMetric(v as TrendMetricKey)}
            />
            <Toggle
              options={PERIODS.map((p) => ({ value: String(p.value), label: p.label }))}
              value={String(period)}
              onChange={(v) => setPeriod(Number(v) as 6 | 12)}
            />
          </div>
        </div>
        <div className="mt-4">
          <TrendChart months={trend} metric={metric} />
        </div>
      </section>

      {/* Сравнение месяца с прошлым */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
        <h2 className="text-base font-semibold text-slate-900">Этот месяц против прошлого</h2>
        <div className="mt-4">
          <MonthCompareCards compare={stats.compare} />
        </div>
      </section>

      {/* Люди */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
        <h2 className="text-base font-semibold text-slate-900">Люди</h2>
        <div className="mt-4">
          <PeopleTable people={stats.people} />
        </div>
      </section>

      {/* Фабрики */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
        <h2 className="text-base font-semibold text-slate-900">Фабрики</h2>
        <div className="mt-4">
          <FactoriesTable factories={stats.factories} />
        </div>
      </section>

      {/* Деньги продукта */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
        <h2 className="text-base font-semibold text-slate-900">Деньги продукта</h2>
        <p className="mt-0.5 text-xs text-slate-500">
          Только операционка производства. Выручки и продаж WB здесь нет.
        </p>
        <div className="mt-4">
          <MoneyCards money={stats.money} />
        </div>
      </section>
    </div>
  );
}

/** Сегментированный переключатель (как таб-бар). */
function Toggle({
  options,
  value,
  onChange,
}: {
  options: Array<{ value: string; label: string }>;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
              active
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
