"use client";

import { useEffect, useState, useMemo, useRef, useTransition } from "react";
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
  // Завершённые (приехали на склад и дальше) по умолчанию спрятаны —
  // рабочие заказы не тонут в истории. Кнопкой можно показать.
  hideDone: true,
};

// Строка Ганта считается завершённой: заказ приехал на склад (и дальше),
// заказ упаковки прибыл или отменён.
const DONE_RAW_STATUSES = new Set([
  "WAREHOUSE_MSK", "PACKING", "SHIPPED_WB", "ON_SALE", // Order
  "ARRIVED", "CANCELLED",                              // PackagingOrder
]);

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
  // v2: добавился hideDone (скрыть завершённые), дефолт true — ключ бампнут,
  // чтобы у всех применился новый дефолт.
  const [filters, setFilters] = usePersistedState<GanttFilters>("gantt-v2:filters:v2", initialFilters);
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
    // Поиск по названию фасона и номеру заказа (аудит блок ④). title строки —
    // «Название · #ORD-...», subtitle — цвета/штуки; ищем по обоим, регистр не важен.
    const q = filters.search.trim().toLowerCase();
    return rows.filter((r) => {
      if (filters.hideDone && r.rawStatus && DONE_RAW_STATUSES.has(r.rawStatus)) return false;
      if (filters.ownerId.length && (!r.ownerId || !filters.ownerId.includes(r.ownerId))) return false;
      if (filters.category.length && (!r.category || !filters.category.includes(r.category))) return false;
      if (filters.productionRegion.length && (!r.productionRegion || !filters.productionRegion.includes(r.productionRegion))) return false;
      if (q && !(`${r.title} ${r.subtitle ?? ""}`.toLowerCase().includes(q))) return false;
      return true;
    });
  }, [rows, filters]);

  // ---------- Сортировка: по дедлайну производства (end фазы «Производство»)
  //  от ранней даты к поздней. Если у заказа нет фазы production (упаковка) —
  //  берём end её аналогичной средней фазы. Без даты — в самый конец.
  //
  //  СТАБИЛЬНОСТЬ (жалоба Алёны 05.07 «правлю — уходит вперёд-назад»): порядок
  //  строк фиксируется при заходе/смене фильтров и НЕ пересчитывается после
  //  каждого автосейва — иначе редактируемый заказ прыгает по вертикали.
  //  Свежий порядок по дедлайнам применится при следующем заходе на страницу. ----------
  const sortSigRef = useRef<string>("");
  const rowOrderRef = useRef<Map<string, number>>(new Map());
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

    const sig = JSON.stringify(filters);
    if (sortSigRef.current !== sig) {
      // Новый вид (первый заход или сменили фильтры) — фиксируем порядок.
      sortSigRef.current = sig;
      rowOrderRef.current = new Map(arr.map((r, i) => [`${r.group}:${r.id}`, i]));
      return arr;
    }
    // Тот же вид: держим зафиксированный порядок, новые строки — в конец
    // (по дедлайну между собой, за счёт исходной сортировки arr).
    const order = rowOrderRef.current;
    let next = order.size;
    for (const r of arr) {
      const k = `${r.group}:${r.id}`;
      if (!order.has(k)) order.set(k, next++);
    }
    arr.sort((a, b) => order.get(`${a.group}:${a.id}`)! - order.get(`${b.group}:${b.id}`)!);
    return arr;
  }, [filtered, filters]);

  // ---------- Без группировки ----------
  const groups = useMemo(
    () => [{ key: "all", label: "Все заказы", rows: sorted }],
    [sorted],
  );

  // ---------- Drag → автосейв ----------
  // Каждое изменение попадает в pending, перезапускаем дебаунс-таймер 600мс.
  // Когда таймер дотикает (юзер перестал тащить) — снапшот улетает в API
  // одним батчем (каждый заказ — один PATCH), потом toast «Сохранено» и refresh.
  //
  // ВАЖНО (жалоба Алёны 05.07 «уходит вперёд, потом назад, потом снова вперёд»):
  // pending НЕ сбрасываем при отправке. Иначе между «отправили» и «пришли свежие
  // строки с сервера» плашка на мгновение прыгает на старые даты и обратно.
  // Буфер отпускаем в useEffect ниже — только когда сервер уже отдал строки
  // с сохранёнными датами (визуально ничего не двигается).
  async function flushAutosave() {
    saveTimer.current = null;
    const snapshot = pendingRef.current;
    if (Object.keys(snapshot).length === 0) return;
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
      // pending не трогаем: плашки остаются где их поставили, можно дёрнуть ещё раз.
      toast.error(`Не сохранилось: ${errors.join("; ")}`);
      return;
    }
    toast.success("Сохранено");
    startTransition(() => router.refresh());
  }

  // Свежие строки приехали с сервера (после refresh) — сохранённые даты уже в
  // rows, буфер можно отпустить без визуального скачка. Если юзер в этот момент
  // уже тащит следующую правку (таймер заряжен) — не трогаем, дождёмся её сейва.
  useEffect(() => {
    if (saveTimer.current != null) return;
    if (Object.keys(pendingRef.current).length === 0) return;
    pendingRef.current = {};
    setPending({});
  }, [rows]);

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
          {/* Поиск по названию фасона / номеру заказа (аудит блок ④) */}
          <input
            type="search"
            value={filters.search}
            onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
            placeholder="Поиск: фасон или № заказа…"
            className="h-7 w-48 rounded-md border border-slate-300 bg-white px-2 text-xs placeholder:text-slate-400 focus:border-slate-400 focus:outline-none"
          />
          <span className="text-xs uppercase tracking-wide text-slate-400">Фильтры:</span>
          <FilterDropdown label="Категория" options={filterOptions.categories} value={filters.category}
            onChange={(v) => setFilters((f) => ({ ...f, category: v }))} />
          <FilterDropdown label="Ответственный" options={filterOptions.owners} value={filters.ownerId}
            onChange={(v) => setFilters((f) => ({ ...f, ownerId: v }))} />
          <FilterDropdown label="Производство" options={filterOptions.productionRegions} value={filters.productionRegion}
            onChange={(v) => setFilters((f) => ({ ...f, productionRegion: v }))} />
          <button
            type="button"
            onClick={() => setFilters((f) => ({ ...f, hideDone: !f.hideDone }))}
            title="Завершённые = заказ приехал на склад (и дальше), упаковка прибыла"
            className={`h-7 rounded-md border px-2 text-xs transition ${
              filters.hideDone
                ? "border-slate-900 bg-slate-900 text-white"
                : "border-slate-300 bg-white text-slate-600 hover:border-slate-400"
            }`}
          >
            {filters.hideDone ? "Завершённые скрыты" : "Показаны завершённые"}
          </button>

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
