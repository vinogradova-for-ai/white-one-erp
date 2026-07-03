"use client";

import { useMemo } from "react";
import { BoardClient, type KanbanCard, type KanbanColumn } from "./board-client";
import { FilterDropdown } from "@/components/common/filter-dropdown";
import { usePersistedState } from "@/lib/use-persisted-state";

export type KanbanFilterOptions = {
  categories: Array<{ value: string; label: string; count: number }>;
  owners: Array<{ value: string; label: string; count: number }>;
  statuses: Array<{ value: string; label: string; count: number }>;
};

/**
 * Шапка фильтров для канбана фасонов — в стиле /orders.
 * Категория · Ответственный · Статус (= колонка канбана) —
 * multi-select dropdowns с клиентской фильтрацией.
 */
export function KanbanFiltersClient({
  columns,
  buckets,
  filterOptions,
  total,
  currentUserId,
  isAdmin,
}: {
  columns: ReadonlyArray<KanbanColumn>;
  buckets: Record<string, KanbanCard[]>;
  filterOptions: KanbanFilterOptions;
  total: number;
  currentUserId?: string;
  isAdmin?: boolean;
}) {
  // Фильтры запоминаются между заходами (localStorage) — см. usePersistedState.
  const [filters, setFilters] = usePersistedState<{
    category: string[];
    ownerId: string[];
    status: string[];
  }>("kanban:filters:v1", { category: [], ownerId: [], status: [] });

  // Активен ли хоть один фильтр — для показа кнопки «Сбросить фильтры».
  const hasActiveFilters =
    filters.category.length > 0 || filters.ownerId.length > 0 || filters.status.length > 0;

  const filteredBuckets = useMemo(() => {
    const out: Record<string, KanbanCard[]> = {};
    let visibleCount = 0;
    for (const col of columns) {
      const cards = (buckets[col.key] ?? []).filter((c) => {
        if (filters.category.length && !filters.category.includes(c.category)) return false;
        if (filters.ownerId.length && (!c.ownerId || !filters.ownerId.includes(c.ownerId))) return false;
        if (filters.status.length && !filters.status.includes(col.key)) return false;
        return true;
      });
      out[col.key] = cards;
      visibleCount += cards.length;
    }
    return { buckets: out, visibleCount };
  }, [columns, buckets, filters]);

  return (
    <div className="space-y-2">
      <div className="rounded-xl border border-slate-200 bg-white p-2">
        <div className="no-scrollbar flex items-center gap-x-3 gap-y-2 overflow-x-auto md:flex-wrap">
          <div className="flex shrink-0 items-center gap-2">
            <h1 className="text-sm font-semibold text-slate-900">Канбан фасонов</h1>
            {/* П5: числа с подписями — «82/67» никто не расшифрует без тултипа */}
            <span
              className="text-xs text-slate-500"
              title={`Показано карточек: ${filteredBuckets.visibleCount} из ${total} (после фильтров)`}
            >
              {hasActiveFilters
                ? `показано ${filteredBuckets.visibleCount} из ${total}`
                : `карточек: ${total}`}
            </span>
            {hasActiveFilters && (
              <button
                type="button"
                onClick={() => setFilters({ category: [], ownerId: [], status: [] })}
                className="inline-flex min-h-[44px] items-center gap-1 rounded-full border border-slate-200 px-3 text-xs font-medium text-slate-600 transition hover:border-slate-300 hover:text-slate-900 md:min-h-0 md:py-1"
              >
                ✕ Сбросить фильтры
              </button>
            )}
          </div>
          <span className="mx-1 hidden h-5 w-px bg-slate-200 md:inline-block" aria-hidden />
          <span className="hidden shrink-0 text-xs uppercase tracking-wide text-slate-400 md:inline">Фильтры:</span>
          <FilterDropdown
            label="Категория"
            options={filterOptions.categories}
            value={filters.category}
            onChange={(v) => setFilters((f) => ({ ...f, category: v }))}
          />
          <FilterDropdown
            label="Ответственный"
            options={filterOptions.owners}
            value={filters.ownerId}
            onChange={(v) => setFilters((f) => ({ ...f, ownerId: v }))}
          />
          <FilterDropdown
            label="Статус"
            options={filterOptions.statuses}
            value={filters.status}
            onChange={(v) => setFilters((f) => ({ ...f, status: v }))}
          />
        </div>
      </div>

      {/* П5: легенда эмодзи-маркеров дедлайнов одной строкой */}
      <p className="px-1 text-[11px] text-slate-400">
        🔥 дедлайн просрочен · ⚠️ ближайшие 7 дней · 📅 дальше недели · 📦 партия прибыла
      </p>

      <BoardClient columns={columns} buckets={filteredBuckets.buckets} currentUserId={currentUserId} isAdmin={isAdmin} />
    </div>
  );
}
