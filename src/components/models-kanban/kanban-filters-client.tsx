"use client";

import { useMemo, useState } from "react";
import { BoardClient, type KanbanCard, type KanbanColumn } from "./board-client";
import { FilterDropdown } from "@/components/common/filter-dropdown";

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
}: {
  columns: ReadonlyArray<KanbanColumn>;
  buckets: Record<string, KanbanCard[]>;
  filterOptions: KanbanFilterOptions;
  total: number;
}) {
  const [filters, setFilters] = useState<{
    category: string[];
    ownerId: string[];
    status: string[];
  }>({ category: [], ownerId: [], status: [] });

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
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <div className="flex items-baseline gap-2">
            <h1 className="text-sm font-semibold text-slate-900">Канбан фасонов</h1>
            <span className="text-xs text-slate-500">
              {filteredBuckets.visibleCount}/{total}
            </span>
          </div>
          <span className="mx-1 h-5 w-px bg-slate-200" aria-hidden />
          <span className="text-xs uppercase tracking-wide text-slate-400">Фильтры:</span>
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

      <BoardClient columns={columns} buckets={filteredBuckets.buckets} />
    </div>
  );
}
