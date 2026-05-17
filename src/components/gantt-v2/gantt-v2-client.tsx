"use client";

import { useState, useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { GanttV2Chart } from "./gantt-v2-chart";
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
  const [filters, setFilters] = useState<GanttFilters>(initialFilters);
  const [zoom, setZoom] = useState<GanttZoom>("3m");
  const [pending, setPending] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  // ---------- Фильтрация: только Категория и Ответственный ----------
  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filters.ownerId.length && (!r.ownerId || !filters.ownerId.includes(r.ownerId))) return false;
      if (filters.category.length && (!r.category || !filters.category.includes(r.category))) return false;
      return true;
    });
  }, [rows, filters]);

  // ---------- Сортировка: от старого к новому по месяцу запуска ----------
  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      const av = a.launchMonth ?? 999999;
      const bv = b.launchMonth ?? 999999;
      if (av !== bv) return av - bv;
      // Тай-брейкер: по дате старта первой фазы
      const aStart = a.bars[0]?.start ?? "";
      const bStart = b.bars[0]?.start ?? "";
      return aStart.localeCompare(bStart);
    });
    return arr;
  }, [filtered]);

  // ---------- Без группировки ----------
  const groups = useMemo(
    () => [{ key: "all", label: "Все заказы", rows: sorted }],
    [sorted],
  );

  // ---------- Drag-сохранение ----------
  function handleBarChange(orderId: string, endField: string, newDateIso: string, group: string) {
    setPending((p) => ({ ...p, [`${group}:${orderId}:${endField}`]: newDateIso }));
  }

  function discard() {
    setPending({});
    setSaveError(null);
  }

  async function save() {
    setSaving(true);
    setSaveError(null);
    try {
      const byOrder: Record<string, { group: string; orderId: string; fields: Record<string, string> }> = {};
      for (const [k, v] of Object.entries(pending)) {
        const [g, id, field] = k.split(":");
        const key = `${g}:${id}`;
        if (!byOrder[key]) byOrder[key] = { group: g, orderId: id, fields: {} };
        byOrder[key].fields[field] = v;
      }
      const errors: string[] = [];
      for (const { group, orderId, fields } of Object.values(byOrder)) {
        const base = group === "packaging" ? "/api/packaging-orders" : group === "development" ? "/api/models" : "/api/orders";
        const res = await fetch(`${base}/${orderId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(fields),
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          errors.push(`${orderId}: ${j?.error?.message ?? res.status}`);
        }
      }
      if (errors.length > 0) {
        setSaveError(`Ошибки: ${errors.join("; ")}`);
        return;
      }
      setPending({});
      startTransition(() => router.refresh());
    } finally {
      setSaving(false);
    }
  }

  const pendingCount = Object.keys(pending).length;

  return (
    <div className="space-y-3">
      {/* Шапка */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">График Ганта</h1>
          <div className="text-sm text-slate-500">
            Видимо: {sorted.length} из {rows.length}
          </div>
        </div>
        <Link
          href="/orders/new"
          className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800"
        >
          + Новый заказ
        </Link>
      </div>

      {/* Панель: фильтры + зум */}
      <div className="rounded-xl border border-slate-200 bg-white p-3">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs uppercase tracking-wide text-slate-400">Фильтры:</span>
          <FilterDropdown label="Категория" options={filterOptions.categories} value={filters.category}
            onChange={(v) => setFilters((f) => ({ ...f, category: v }))} />
          <FilterDropdown label="Ответственный" options={filterOptions.owners} value={filters.ownerId}
            onChange={(v) => setFilters((f) => ({ ...f, ownerId: v }))} />

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

      {/* Sticky save-bar */}
      {pendingCount > 0 && (
        <div className="sticky bottom-3 z-30 flex flex-wrap items-center gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-3 shadow-lg">
          <div className="flex-1 text-sm">
            <span className="font-semibold text-amber-900">Несохранённых изменений: {pendingCount}</span>
            <div className="text-xs text-amber-800">
              Перетащите ещё или сохраните разом. Каждый заказ — один запрос.
            </div>
            {saveError && <div className="mt-1 text-xs text-red-600">{saveError}</div>}
          </div>
          <button
            type="button"
            onClick={discard}
            disabled={saving}
            className="rounded-lg border border-amber-400 bg-white px-3 py-1.5 text-sm text-amber-900 hover:bg-amber-100 disabled:opacity-50"
          >
            Отменить
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="rounded-lg bg-amber-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
          >
            {saving ? "Сохранение…" : `Сохранить (${pendingCount})`}
          </button>
        </div>
      )}
    </div>
  );
}

// ============================================================
// Мульти-выбор фильтра — кастомный dropdown с чекбоксами
// ============================================================
function FilterDropdown({
  label, options, value, onChange,
}: {
  label: string;
  options: Array<{ value: string; label: string; count?: number; color?: string }>;
  value: string[];
  onChange: (v: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const active = value.length > 0;
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
          active
            ? "border-slate-900 bg-slate-900 text-white"
            : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
        }`}
      >
        {label}
        {active && <span className="rounded-full bg-white/20 px-1.5 text-[10px]">{value.length}</span>}
        <span className="text-[10px]">▾</span>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full z-40 mt-1 max-h-64 w-56 overflow-auto rounded-lg border border-slate-200 bg-white p-1 shadow-lg">
            {options.length === 0 && (
              <div className="px-3 py-2 text-xs text-slate-400">Нет вариантов</div>
            )}
            {options.map((o) => {
              const checked = value.includes(o.value);
              return (
                <label
                  key={o.value}
                  className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-xs text-slate-700 hover:bg-slate-100"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => {
                      onChange(checked ? value.filter((v) => v !== o.value) : [...value, o.value]);
                    }}
                  />
                  {o.color && <span className={`inline-block h-2 w-2 rounded-full ${o.color}`} />}
                  <span className="flex-1">{o.label}</span>
                  {typeof o.count === "number" && (
                    <span className="text-[10px] text-slate-400">{o.count}</span>
                  )}
                </label>
              );
            })}
            {value.length > 0 && (
              <button
                type="button"
                onClick={() => onChange([])}
                className="mt-1 w-full rounded px-2 py-1 text-left text-[11px] text-slate-500 hover:bg-slate-100"
              >
                Сбросить
              </button>
            )}
          </div>
        </>
      )}
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
