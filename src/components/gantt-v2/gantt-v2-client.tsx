"use client";

import { useState, useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { GanttV2Chart } from "./gantt-v2-chart";
import type {
  GanttRowV2,
  GanttFilterOptions,
  GanttFilters,
  GanttGrouping,
  GanttSort,
  GanttDensity,
  GanttZoom,
} from "./types";
import { BRAND_LABELS } from "@/lib/constants";

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

function startOfWeek(iso: string): string {
  const d = new Date(iso);
  const day = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - day);
  return d.toISOString().slice(0, 10);
}

function addDays(iso: string, n: number): string {
  const d = new Date(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function daysBetween(a: string, b: string): number {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000);
}

export function GanttV2Client({
  rows,
  filterOptions,
  todayIso,
}: {
  rows: GanttRowV2[];
  filterOptions: GanttFilterOptions;
  todayIso: string;
}) {
  const router = useRouter();
  const [filters, setFilters] = useState<GanttFilters>(initialFilters);
  const [grouping, setGrouping] = useState<GanttGrouping>("none");
  const [sort, setSort] = useState<GanttSort>("urgency");
  const [zoom, setZoom] = useState<GanttZoom>("3m");
  const [density, setDensity] = useState<GanttDensity>("normal");
  const [pending, setPending] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  // ---------- KPI ----------
  const weekStart = startOfWeek(todayIso);
  const weekEnd = addDays(weekStart, 7);

  const kpi = useMemo(() => {
    const inWork = rows.length;
    let burning = 0;
    let overdue = 0;
    let thisWeek = 0;
    let dateIssues = 0;
    const factoryLoad = new Map<string, number>();
    let cycleSum = 0;
    let cycleCount = 0;
    for (const r of rows) {
      if (r.hasOverdue) overdue += 1;
      if (r.hasOverdue || r.hasNearlyDue) burning += 1;
      if (r.hasDateOrderIssue) dateIssues += 1;
      const finishesThisWeek = r.bars.some((b) => b.state !== "done" && b.end >= weekStart && b.end < weekEnd);
      if (finishesThisWeek) thisWeek += 1;
      if (r.factoryId) factoryLoad.set(r.factoryId, (factoryLoad.get(r.factoryId) ?? 0) + 1);
      // Цикл-тайм: разница между первой и последней датой бар
      if (r.bars.length >= 2) {
        const first = r.bars[0].start;
        const last = r.bars[r.bars.length - 1].end;
        const days = daysBetween(first, last);
        if (days > 0 && days < 365) {
          cycleSum += days;
          cycleCount += 1;
        }
      }
    }
    const overloaded = Array.from(factoryLoad.values()).filter((n) => n >= 5).length;
    const factoriesTotal = factoryLoad.size;
    const cycleAvg = cycleCount > 0 ? Math.round(cycleSum / cycleCount) : 0;
    return { inWork, burning, overdue, thisWeek, dateIssues, overloaded, factoriesTotal, cycleAvg };
  }, [rows, weekStart, weekEnd]);

  // ---------- Фильтрация ----------
  const filtered = useMemo(() => {
    const q = filters.search.trim().toLowerCase();
    return rows.filter((r) => {
      if (filters.brand.length && (!r.brand || !filters.brand.includes(r.brand))) return false;
      if (filters.ownerId.length && (!r.ownerId || !filters.ownerId.includes(r.ownerId))) return false;
      if (filters.factoryId.length && (!r.factoryId || !filters.factoryId.includes(r.factoryId))) return false;
      if (filters.launchMonth.length && (!r.launchMonth || !filters.launchMonth.includes(String(r.launchMonth)))) return false;
      if (filters.status.length && (!r.rawStatus || !filters.status.includes(r.rawStatus))) return false;
      if (filters.category.length && (!r.category || !filters.category.includes(r.category))) return false;
      if (filters.phase.length) {
        // Учитываем только активную фазу — это и есть «где сейчас стоит заказ»
        const activeBar = r.bars.find((b) => b.state === "active");
        if (!activeBar || !filters.phase.includes(activeBar.key)) return false;
      }
      if (filters.burning && !r.hasOverdue && !r.hasNearlyDue) return false;
      if (filters.overdue && !r.hasOverdue) return false;
      if (filters.thisWeek) {
        const finishesThisWeek = r.bars.some((b) => b.state !== "done" && b.end >= weekStart && b.end < weekEnd);
        if (!finishesThisWeek) return false;
      }
      if (filters.dateIssue && !r.hasDateOrderIssue) return false;
      if (filters.myOnly && r.ownerId !== filters.myOnly) return false;
      if (q) {
        const hay = `${r.title} ${r.subtitle} ${r.statusLabel} ${r.factoryName ?? ""} ${r.ownerName ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, filters, weekStart, weekEnd]);

  // ---------- Сортировка ----------
  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      if (sort === "title") return a.title.localeCompare(b.title);
      if (sort === "launchMonth") {
        const av = a.launchMonth ?? 999999;
        const bv = b.launchMonth ?? 999999;
        return av - bv;
      }
      const aLastEnd = a.bars[a.bars.length - 1]?.end ?? "";
      const bLastEnd = b.bars[b.bars.length - 1]?.end ?? "";
      if (sort === "deadline") return aLastEnd.localeCompare(bLastEnd);
      // urgency: горящие → просроченные → дедлайн
      const aScore = (a.hasOverdue ? 0 : a.hasNearlyDue ? 1 : 2);
      const bScore = (b.hasOverdue ? 0 : b.hasNearlyDue ? 1 : 2);
      if (aScore !== bScore) return aScore - bScore;
      return aLastEnd.localeCompare(bLastEnd);
    });
    return arr;
  }, [filtered, sort]);

  // ---------- Группировка ----------
  const groups = useMemo(() => {
    if (grouping === "none") return [{ key: "all", label: "Все заказы", rows: sorted }];
    const map = new Map<string, GanttRowV2[]>();
    const keyLabel = new Map<string, string>();
    for (const r of sorted) {
      let key = "—";
      let label = "Без группы";
      switch (grouping) {
        case "brand":
          key = r.brand ?? "_none";
          label = r.brand ? (BRAND_LABELS[r.brand] ?? r.brand) : "Без бренда";
          break;
        case "factory":
          key = r.factoryId ?? "_none";
          label = r.factoryName ?? "Без фабрики";
          break;
        case "owner":
          key = r.ownerId ?? "_none";
          label = r.ownerName ?? "Без ответственного";
          break;
        case "launchMonth":
          key = r.launchMonth ? String(r.launchMonth) : "_none";
          if (r.launchMonth) {
            const MONTH_RU = ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];
            const y = String(r.launchMonth).slice(0, 4);
            const m = Number(String(r.launchMonth).slice(4, 6)) - 1;
            label = `${MONTH_RU[m]} ${y}`;
          } else {
            label = "Без даты запуска";
          }
          break;
        case "phase": {
          const active = r.bars.find((b) => b.state === "active");
          key = active?.key ?? "_done";
          label = active?.title ?? "Все фазы пройдены";
          break;
        }
        case "category":
          key = r.category ?? "_none";
          label = r.category ?? "Без категории";
          break;
        case "type":
          key = r.group;
          label = r.group === "orders" ? "Заказы производства" : r.group === "packaging" ? "Заказы упаковки" : "Разработка фасонов";
          break;
      }
      if (!map.has(key)) {
        map.set(key, []);
        keyLabel.set(key, label);
      }
      map.get(key)!.push(r);
    }
    return Array.from(map.entries()).map(([key, rows]) => ({ key, label: keyLabel.get(key)!, rows }));
  }, [sorted, grouping]);

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
  const hasActiveFilters =
    filters.brand.length || filters.phase.length || filters.ownerId.length ||
    filters.factoryId.length || filters.launchMonth.length || filters.status.length ||
    filters.category.length || filters.search || filters.burning || filters.overdue ||
    filters.thisWeek || filters.dateIssue || filters.myOnly;

  return (
    <div className="space-y-3">
      {/* Шапка */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">График Ганта · Mission Control</h1>
          <div className="text-sm text-slate-500">
            Один экран — весь цикл от разработки до доставки. Видимо: {sorted.length} из {rows.length}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/orders/new"
            className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800"
          >
            + Новый заказ
          </Link>
        </div>
      </div>

      {/* KPI-полоса */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-7">
        <KpiTile
          label="В работе"
          value={kpi.inWork}
          tone={hasActiveFilters ? "muted" : "neutral"}
          active={!hasActiveFilters}
          onClick={() => setFilters(initialFilters)}
        />
        <KpiTile
          label="Горит сейчас"
          value={kpi.burning}
          tone={kpi.burning > 0 ? "burning" : "neutral"}
          active={filters.burning}
          onClick={() => setFilters((f) => ({ ...f, burning: !f.burning, overdue: false, thisWeek: false, dateIssue: false }))}
        />
        <KpiTile
          label="Просрочено"
          value={kpi.overdue}
          tone={kpi.overdue > 0 ? "danger" : "neutral"}
          active={filters.overdue}
          onClick={() => setFilters((f) => ({ ...f, overdue: !f.overdue, burning: false, thisWeek: false, dateIssue: false }))}
        />
        <KpiTile
          label="На этой неделе"
          value={kpi.thisWeek}
          tone="info"
          active={filters.thisWeek}
          onClick={() => setFilters((f) => ({ ...f, thisWeek: !f.thisWeek, burning: false, overdue: false, dateIssue: false }))}
        />
        <KpiTile
          label="Битые даты"
          value={kpi.dateIssues}
          tone={kpi.dateIssues > 0 ? "warn" : "neutral"}
          active={filters.dateIssue}
          onClick={() => setFilters((f) => ({ ...f, dateIssue: !f.dateIssue, burning: false, overdue: false, thisWeek: false }))}
        />
        <KpiTile label="Цикл-тайм средний" value={`${kpi.cycleAvg} дн`} tone="neutral" />
        <KpiTile
          label="Фабрики"
          value={`${kpi.overloaded}/${kpi.factoriesTotal}${kpi.overloaded > 0 ? " 🔥" : ""}`}
          tone={kpi.overloaded > 0 ? "warn" : "neutral"}
        />
      </div>

      {/* Панель фильтров */}
      <div className="rounded-xl border border-slate-200 bg-white p-3">
        <div className="flex flex-wrap items-center gap-2 mb-2">
          <span className="text-xs uppercase tracking-wide text-slate-400">Фильтры:</span>
          <FilterDropdown label="Бренд" options={filterOptions.brands} value={filters.brand}
            onChange={(v) => setFilters((f) => ({ ...f, brand: v }))} />
          <FilterDropdown label="Этап" options={filterOptions.phases} value={filters.phase}
            onChange={(v) => setFilters((f) => ({ ...f, phase: v }))} />
          <FilterDropdown label="Ответственный" options={filterOptions.owners} value={filters.ownerId}
            onChange={(v) => setFilters((f) => ({ ...f, ownerId: v }))} />
          <FilterDropdown label="Фабрика" options={filterOptions.factories} value={filters.factoryId}
            onChange={(v) => setFilters((f) => ({ ...f, factoryId: v }))} />
          <FilterDropdown label="Месяц запуска" options={filterOptions.launchMonths} value={filters.launchMonth}
            onChange={(v) => setFilters((f) => ({ ...f, launchMonth: v }))} />
          <FilterDropdown label="Статус" options={filterOptions.statuses} value={filters.status}
            onChange={(v) => setFilters((f) => ({ ...f, status: v }))} />
          <FilterDropdown label="Категория" options={filterOptions.categories} value={filters.category}
            onChange={(v) => setFilters((f) => ({ ...f, category: v }))} />

          <input
            type="text"
            placeholder="Поиск: фасон, цвет, номер…"
            value={filters.search}
            onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
            className="ml-auto w-56 rounded-lg border border-slate-300 px-3 py-1.5 text-xs focus:border-slate-500 focus:outline-none"
          />

          {hasActiveFilters && (
            <button
              type="button"
              onClick={() => setFilters(initialFilters)}
              className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
            >
              Сбросить ×
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 pt-2">
          <span className="text-xs uppercase tracking-wide text-slate-400">Группировка:</span>
          <RadioGroup
            options={[
              { key: "none", label: "Без" },
              { key: "type", label: "Тип" },
              { key: "brand", label: "Бренд" },
              { key: "factory", label: "Фабрика" },
              { key: "owner", label: "PM" },
              { key: "launchMonth", label: "Месяц" },
              { key: "phase", label: "Этап" },
              { key: "category", label: "Категория" },
            ]}
            value={grouping}
            onChange={(v) => setGrouping(v as GanttGrouping)}
          />

          <span className="ml-3 text-xs uppercase tracking-wide text-slate-400">Сортировка:</span>
          <RadioGroup
            options={[
              { key: "urgency", label: "Срочность" },
              { key: "deadline", label: "Дедлайн" },
              { key: "launchMonth", label: "Запуск" },
              { key: "title", label: "А-Я" },
            ]}
            value={sort}
            onChange={(v) => setSort(v as GanttSort)}
          />

          <span className="ml-3 text-xs uppercase tracking-wide text-slate-400">Зум:</span>
          <RadioGroup
            options={[
              { key: "1w", label: "1 нед" },
              { key: "1m", label: "1 мес" },
              { key: "3m", label: "3 мес" },
              { key: "6m", label: "6 мес" },
              { key: "1y", label: "Год" },
            ]}
            value={zoom}
            onChange={(v) => setZoom(v as GanttZoom)}
          />

          <span className="ml-3 text-xs uppercase tracking-wide text-slate-400">Плотность:</span>
          <RadioGroup
            options={[
              { key: "compact", label: "≡" },
              { key: "normal", label: "≣" },
              { key: "spacious", label: "▤" },
            ]}
            value={density}
            onChange={(v) => setDensity(v as GanttDensity)}
          />
        </div>
      </div>

      {/* График */}
      <GanttV2Chart
        groups={groups}
        zoom={zoom}
        density={density}
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
// KPI-плитка
// ============================================================
function KpiTile({
  label, value, tone, active, onClick,
}: {
  label: string;
  value: number | string;
  tone: "neutral" | "burning" | "danger" | "warn" | "info" | "muted";
  active?: boolean;
  onClick?: () => void;
}) {
  const toneClass: Record<string, string> = {
    neutral: "border-slate-200 bg-white",
    burning: "border-amber-300 bg-amber-50",
    danger: "border-red-300 bg-red-50",
    warn: "border-orange-300 bg-orange-50",
    info: "border-sky-300 bg-sky-50",
    muted: "border-slate-200 bg-slate-50",
  };
  const valueClass: Record<string, string> = {
    neutral: "text-slate-900",
    burning: "text-amber-900",
    danger: "text-red-700",
    warn: "text-orange-800",
    info: "text-sky-800",
    muted: "text-slate-700",
  };
  const Wrap = onClick ? "button" : "div";
  return (
    <Wrap
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={`flex flex-col items-start rounded-xl border px-3 py-2 text-left transition ${toneClass[tone]} ${
        active ? "ring-2 ring-slate-900" : onClick ? "hover:shadow-sm" : ""
      } ${onClick ? "cursor-pointer" : ""}`}
    >
      <span className="text-[11px] uppercase tracking-wide text-slate-500">{label}</span>
      <span className={`mt-0.5 text-2xl font-bold ${valueClass[tone]}`}>{value}</span>
    </Wrap>
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
