"use client";

import { useState, useMemo, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { GanttV2Chart } from "./gantt-v2-chart";
import { FilterDropdown } from "@/components/common/filter-dropdown";
import { usePersistedState } from "@/lib/use-persisted-state";
import type {
  GanttRowV2,
  GanttFilterOptions,
  GanttFilters,
  GanttZoom,
} from "./types";

const initialFilters: GanttFilters = {
  brand: [],
  phase: [],
  ownerId: [],
  factoryId: [],
  productionRegion: [],
  launchMonth: [],
  status: [],
  category: [],
  search: "",
  burning: false,
  overdue: false,
  thisWeek: false,
  dateIssue: false,
  myOnly: null,
};

export function GanttV2Client({
  rows,
  filterOptions,
  todayIso,
}: {
  rows: GanttRowV2[];
  filterOptions: GanttFilterOptions;
  todayIso: string;
  isOwner: boolean;
}) {
  const router = useRouter();
  // Фильтры и зум запоминаются между заходами на страницу (localStorage),
  // чтобы «выбрала фильтр → провалилась в заказ → назад» не сбрасывало вид.
  const [filters, setFilters] = usePersistedState<GanttFilters>("gantt-v2:filters:v1", initialFilters);
  const [zoom, setZoom] = usePersistedState<GanttZoom>("gantt-v2:zoom:v1", "3m");
  // pending — буфер изменений: drag → попадает сюда, через 600мс улетает в API.
  // Хранится и в state (для подсветки на барах), и в ref (для дебаунс-таймера —
  // он читает актуальный снэпшот без stale closure).
  const [pending, setPending] = useState<Record<string, string>>({});
  const pendingRef = useRef<Record<string, string>>({});
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [, startTransition] = useTransition();

  // ---------- Фильтрация: Категория, Ответственный, Производство (RU/CN/Тяк) ----------
  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filters.ownerId.length && (!r.ownerId || !filters.ownerId.includes(r.ownerId))) return false;
      if (filters.category.length && (!r.category || !filters.category.includes(r.category))) return false;
      if (filters.productionRegion.length && (!r.productionRegion || !filters.productionRegion.includes(r.productionRegion))) return false;
      return true;
    });
  }, [rows, filters]);

  // ---------- Сортировка: по дедлайну производства (end фазы «Производство»)
  //  от ранней даты к поздней. Если у заказа нет фазы production (упаковка) —
  //  берём end её аналогичной средней фазы. Без даты — в самый конец. ----------
  const sorted = useMemo(() => {
    function productionDeadline(row: typeof filtered[number]): string {
      const prod = row.bars.find((b) => b.key === "production");
      if (prod?.end) return prod.end;
      // У упаковки фаза называется тоже "production" (см. /gantt-v2/page.tsx),
      // но если вдруг нет — fallback на последнюю фазу.
      return row.bars[row.bars.length - 1]?.end ?? "9999-99-99";
    }
    const arr = [...filtered];
    arr.sort((a, b) => productionDeadline(a).localeCompare(productionDeadline(b)));
    return arr;
  }, [filtered]);

  // ---------- Без группировки ----------
  const groups = useMemo(
    () => [{ key: "all", label: "Все заказы", rows: sorted }],
    [sorted],
  );

  // ---------- Drag → автосейв ----------
  // Каждое изменение попадает в pending, перезапускаем дебаунс-таймер 600мс.
  // Когда таймер дотикает (юзер перестал тащить) — снапшот улетает в API
  // одним батчем (каждый заказ — один PATCH), потом toast «Сохранено» и refresh.
  async function flushAutosave() {
    const snapshot = pendingRef.current;
    if (Object.keys(snapshot).length === 0) return;
    pendingRef.current = {};
    setPending({});
    const byOrder: Record<string, { group: string; orderId: string; fields: Record<string, string> }> = {};
    for (const [k, v] of Object.entries(snapshot)) {
      const [g, id, field] = k.split(":");
      const key = `${g}:${id}`;
      if (!byOrder[key]) byOrder[key] = { group: g, orderId: id, fields: {} };
      byOrder[key].fields[field] = v;
    }
    const errors: string[] = [];
    for (const { group, orderId, fields } of Object.values(byOrder)) {
      const base = group === "packaging" ? "/api/packaging-orders" : group === "development" ? "/api/models" : "/api/orders";
      try {
        const res = await fetch(`${base}/${orderId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(fields),
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          errors.push(`${orderId}: ${j?.error?.message ?? res.status}`);
        }
      } catch (e) {
        errors.push(`${orderId}: ${(e as Error).message}`);
      }
    }
    if (errors.length > 0) {
      toast.error(`Не сохранилось: ${errors.join("; ")}`);
      return;
    }
    toast.success("Сохранено");
    startTransition(() => router.refresh());
  }

  function handleBarChange(orderId: string, endField: string, newDateIso: string, group: string) {
    const key = `${group}:${orderId}:${endField}`;
    pendingRef.current = { ...pendingRef.current, [key]: newDateIso };
    setPending(pendingRef.current);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(flushAutosave, 600);
  }

  return (
    <div className="space-y-2">
      {/* Компактная шапка: заголовок + count + кнопка + фильтры/зум в одной полосе */}
      <div className="rounded-xl border border-slate-200 bg-white p-2">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <div className="flex items-baseline gap-2">
            <h1 className="text-sm font-semibold text-slate-900">График Ганта</h1>
            <span className="text-xs text-slate-500">{sorted.length}/{rows.length}</span>
          </div>
          <Link
            href="/orders/new"
            className="rounded-md bg-slate-900 px-2.5 py-1 text-xs font-medium text-white hover:bg-slate-800"
          >
            + Заказ
          </Link>
          <span className="w-px h-5 bg-slate-200 mx-1" aria-hidden />
          <span className="text-xs uppercase tracking-wide text-slate-400">Фильтры:</span>
          <FilterDropdown label="Категория" options={filterOptions.categories} value={filters.category}
            onChange={(v) => setFilters((f) => ({ ...f, category: v }))} />
          <FilterDropdown label="Ответственный" options={filterOptions.owners} value={filters.ownerId}
            onChange={(v) => setFilters((f) => ({ ...f, ownerId: v }))} />
          <FilterDropdown label="Производство" options={filterOptions.productionRegions} value={filters.productionRegion}
            onChange={(v) => setFilters((f) => ({ ...f, productionRegion: v }))} />

          <span className="ml-3 text-xs uppercase tracking-wide text-slate-400">Зум:</span>
          <RadioGroup
            options={[
              { key: "1w", label: "1 нед" },
              { key: "1m", label: "1 мес" },
              { key: "3m", label: "3 мес" },
            ]}
            value={zoom}
            onChange={(v) => setZoom(v as GanttZoom)}
          />

        </div>
      </div>

      {/* График */}
      <GanttV2Chart
        groups={groups}
        zoom={zoom}
        density="normal"
        todayIso={todayIso}
        onBarChange={handleBarChange}
        pendingChanges={pending}
      />

    </div>
  );
}

// ============================================================
// Радио-группа кнопок
// ============================================================
function RadioGroup({
  options, value, onChange,
}: {
  options: Array<{ key: string; label: string }>;
  value: string;
  onChange: (k: string) => void;
}) {
  return (
    <div className="flex gap-1">
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          onClick={() => onChange(o.key)}
          className={`rounded-lg px-2.5 py-1 text-xs font-medium transition ${
            value === o.key ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
