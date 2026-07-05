"use client";

import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { GanttRowV2, GanttBarV2, GanttGroup, GanttZoom, GanttDensity } from "./types";
import {
  ZOOM_OPTIONS,
  DENSITY,
  MONTH_RU,
  DAYS_RU,
  calendarRangeForZoom,
  parseISO,
  toISO,
  addDays,
  formatDM,
  dayDiff,
} from "./chart-utils";
import { MobileList } from "./gantt-mobile";
import { ThumbnailStack, LegendItem, ResizeHandle } from "./gantt-pieces";
import { applyDrag, type TimelinePhase } from "@/lib/timeline-math";
import { usePersistedState } from "@/lib/use-persisted-state";

export type GanttGroupView = { key: string; label: string; rows: GanttRowV2[] };

// Опорная линия шкалы. leftPx — позиция в пикселях от начала рейла.
type Mark = {
  iso: string;
  leftPx: number;
  label: string;
  isMonthStart: boolean;
  isStrong: boolean;
  isDay?: boolean;
  isWeekend?: boolean;
};

export function GanttV2Chart({
  groups,
  zoom,
  density,
  todayIso,
  onBarChange,
  pendingChanges,
}: {
  groups: GanttGroupView[];
  zoom: GanttZoom;
  density: GanttDensity;
  todayIso: string;
  onBarChange: (orderId: string, endField: string, newDateIso: string, group: GanttGroup) => void;
  pendingChanges: Record<string, string>;
}) {
  const { pxPerDay } = ZOOM_OPTIONS[zoom];
  const today = parseISO(todayIso);
  const range = calendarRangeForZoom(zoom, today);

  // Мобильный режим: «График» (настоящий Гант, пальцем) или «Список».
  // Помним выбор между заходами (закон «память состояния UI»).
  const [mobileView, setMobileView] = usePersistedState<"chart" | "list">(
    "gantt-v2:mobileView:v1",
    "chart",
  );

  // ── Границы рейла ─────────────────────────────────────────────────────────
  // Зум задаёт стартовую точку и pxPerDay (масштаб). Но рейл ОБЯЗАН покрывать
  // min/max ВСЕХ фаз ВСЕХ строк + запас — иначе плашка вылезает за окно и её
  // приходится клипать, а клипнутая ручка ≠ реальной дате (главный «рандом»).
  // Поэтому расширяем календарный диапазон под фактические даты баров.
  const dataRange = useMemo(() => {
    let min: string | null = null;
    let max: string | null = null;
    for (const g of groups) {
      for (const r of g.rows) {
        for (const b of r.bars) {
          // Учитываем pending, чтобы во время drag рейл ехал вместе с плашкой.
          const pk = b.orderId && b.endField ? `${r.group}:${b.orderId}:${b.endField}` : null;
          const end = pk && pendingChanges[pk] ? pendingChanges[pk] : b.end;
          if (min === null || b.start < min) min = b.start;
          if (max === null || end > max) max = end;
        }
      }
    }
    return { min, max };
  }, [groups, pendingChanges]);

  // «Рейл не дышит» (жалоба Алёны 05.07 «правлю — уходит вперёд-назад»):
  // границы данных за сессию ТОЛЬКО расширяются. Иначе каждый drag/автосейв
  // пересчитывал min/max, лента меняла ширину и всё съезжало под курсором.
  const boundsRef = useRef<{ min: string | null; max: string | null }>({ min: null, max: null });
  if (dataRange.min && (boundsRef.current.min === null || dataRange.min < boundsRef.current.min)) {
    boundsRef.current.min = dataRange.min;
  }
  if (dataRange.max && (boundsRef.current.max === null || dataRange.max > boundsRef.current.max)) {
    boundsRef.current.max = dataRange.max;
  }
  const bounds = boundsRef.current;

  const calStart = toISO(range.start);
  const calEnd = toISO(range.end);
  // Запас по краям, чтобы крайние ручки не липли к краю рейла.
  const MARGIN_DAYS = 7;
  let chartStart = calStart;
  let chartEnd = calEnd;
  if (bounds.min && dayDiff(bounds.min, chartStart) > 0) {
    chartStart = toISO(addDays(parseISO(bounds.min), -MARGIN_DAYS));
  }
  if (bounds.max && dayDiff(chartEnd, bounds.max) > 0) {
    chartEnd = toISO(addDays(parseISO(bounds.max), MARGIN_DAYS));
  }
  const totalDays = Math.max(1, dayDiff(chartStart, chartEnd));

  // Ширина левой колонки «Заказ / фасон» — drag-resize, как в Google Sheets.
  // Сохраняется в localStorage, чтобы при перезагрузке не сбрасывалась.
  // На телефоне своя (узкая) ширина и свой ключ: 300px съели бы почти весь экран.
  const LEFT_MIN = 90;
  const LEFT_MAX = 700;
  const isMobileViewport = () =>
    typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches;
  const leftColKey = () => (isMobileViewport() ? "gantt-v2:leftColWidth:m" : "gantt-v2:leftColWidth");
  const [leftColWidth, setLeftColWidth] = useState<number>(300);
  useEffect(() => {
    const stored = Number(window.localStorage.getItem(leftColKey()));
    if (stored >= LEFT_MIN && stored <= LEFT_MAX) setLeftColWidth(stored);
    else if (isMobileViewport()) setLeftColWidth(120);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  function persistLeftColWidth(w: number) {
    window.localStorage.setItem(leftColKey(), String(w));
  }
  const gridCols = `${leftColWidth}px 1fr`;

  // Пиксельная шкала: полная ширина таймлайна = totalDays × pxPerDay.
  // Контейнер скроллится по горизонтали, если эта ширина больше viewport.
  const timelinePx = totalDays * pxPerDay;
  const totalPx = leftColWidth + timelinePx;

  const dens = DENSITY[density];

  const totalRows = groups.reduce((a, g) => a + g.rows.length, 0);

  // ── Позиционирование в px (а не в %) ──────────────────────────────────────
  // px/день фиксирован зумом, поэтому плашки одинаковой длительности всегда
  // одинаковой ширины и НИЧЕГО не «плавает» при смене длины рейла.
  const posPx = useCallback(
    (iso: string): number => dayDiff(chartStart, iso) * pxPerDay,
    [chartStart, pxPerDay],
  );

  // Опорные линии шкалы — адаптивные (день/неделя/месяц), позиции в px.
  const marks = useMemo<Mark[]>(() => {
    const out: Mark[] = [];
    const start = parseISO(chartStart);
    const end = parseISO(chartEnd);
    if (zoom === "1w") {
      const cur = new Date(start);
      while (cur <= end) {
        const iso = toISO(cur);
        const dow = cur.getUTCDay(); // 0=Вс, 6=Сб
        out.push({
          iso,
          leftPx: dayDiff(chartStart, iso) * pxPerDay,
          label: `${DAYS_RU[dow]} ${cur.getUTCDate()}`,
          isMonthStart: cur.getUTCDate() === 1,
          isStrong: dow === 1,
          isWeekend: dow === 0 || dow === 6,
        });
        cur.setUTCDate(cur.getUTCDate() + 1);
      }
    } else if (zoom === "1m") {
      const cur = new Date(start);
      while (cur <= end) {
        const iso = toISO(cur);
        const dow = cur.getUTCDay();
        const isMon = dow === 1;
        out.push({
          iso,
          leftPx: dayDiff(chartStart, iso) * pxPerDay,
          label: isMon ? `${DAYS_RU[dow]} ${formatDM(iso)}` : "",
          isMonthStart: cur.getUTCDate() <= 7 && isMon,
          isStrong: isMon,
          isDay: !isMon,
          isWeekend: dow === 0 || dow === 6,
        });
        cur.setUTCDate(cur.getUTCDate() + 1);
      }
    } else if (zoom === "3m") {
      const cur = new Date(start);
      const offset = (cur.getUTCDay() + 6) % 7;
      cur.setUTCDate(cur.getUTCDate() - offset);
      while (cur <= end) {
        const iso = toISO(cur);
        if (iso >= chartStart) {
          const dow = cur.getUTCDay();
          out.push({
            iso,
            leftPx: dayDiff(chartStart, iso) * pxPerDay,
            label: `${DAYS_RU[dow]} ${formatDM(iso)}`,
            isMonthStart: cur.getUTCDate() <= 7,
            isStrong: cur.getUTCDate() <= 7,
          });
        }
        cur.setUTCDate(cur.getUTCDate() + 7);
      }
    } else {
      const cur = new Date(start);
      cur.setUTCDate(1);
      while (cur <= end) {
        const iso = toISO(cur);
        if (iso >= chartStart) {
          out.push({
            iso,
            leftPx: dayDiff(chartStart, iso) * pxPerDay,
            label: `${MONTH_RU[cur.getUTCMonth()]}`,
            isMonthStart: true,
            isStrong: true,
          });
        }
        cur.setUTCMonth(cur.getUTCMonth() + 1);
      }
    }
    return out;
  }, [chartStart, chartEnd, pxPerDay, zoom]);

  const todayLeftPx = posPx(todayIso);
  const todayInRange = todayLeftPx >= 0 && todayLeftPx <= timelinePx;

  // Автоскролл к «сегодня» при открытии и смене зума (топ-6 UX-аудита: гант
  // открывался на марте). Левая колонка теперь sticky, поэтому старая жалоба
  // «названия прячутся» не воспроизводится: колонка остаётся на месте.
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollToToday = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (!(todayLeftPx >= 0 && todayLeftPx <= timelinePx)) {
      el.scrollLeft = 0;
      return;
    }
    // «Сегодня» — примерно на трети видимой области, чтобы видеть и хвост, и будущее.
    const visible = el.clientWidth - leftColWidth;
    el.scrollLeft = Math.max(0, todayLeftPx - Math.max(0, visible) * 0.33);
  }, [todayLeftPx, timelinePx, leftColWidth]);
  useLayoutEffect(() => {
    scrollToToday();
    // Только при открытии и смене зума — не дёргаем скролл на каждый рендер.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom]);

  // Если левая граница рейла всё же уехала влево (потянули самую раннюю дату
  // ещё раньше) — все плашки сдвигаются вправо на дельту. Компенсируем скролл
  // на ту же дельту, чтобы картинка под курсором не двигалась.
  // При смене зума не компенсируем: там масштаб другой и скролл ставит
  // scrollToToday (эффект выше).
  const prevRailRef = useRef({ chartStart, pxPerDay });
  useLayoutEffect(() => {
    const prev = prevRailRef.current;
    prevRailRef.current = { chartStart, pxPerDay };
    if (prev.pxPerDay !== pxPerDay || prev.chartStart === chartStart) return;
    const el = scrollRef.current;
    if (!el) return;
    el.scrollLeft += dayDiff(chartStart, prev.chartStart) * pxPerDay;
  }, [chartStart, pxPerDay]);

  // ── Автоскролл контейнера при drag у края (как в phase-timeline) ──────────
  const autoScrollRef = useRef<number | null>(null);
  const stopAutoScroll = useCallback(() => {
    if (autoScrollRef.current != null) {
      cancelAnimationFrame(autoScrollRef.current);
      autoScrollRef.current = null;
    }
  }, []);
  const maybeAutoScroll = useCallback((clientX: number, active: () => boolean) => {
    const el = scrollRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const EDGE = 48;
    const STEP = 14;
    let dir = 0;
    if (clientX < rect.left + EDGE) dir = -1;
    else if (clientX > rect.right - EDGE) dir = 1;
    if (dir === 0) {
      stopAutoScroll();
      return;
    }
    if (autoScrollRef.current != null) return; // уже крутим
    const tick = () => {
      const cont = scrollRef.current;
      if (!cont || !active()) {
        stopAutoScroll();
        return;
      }
      cont.scrollLeft += dir * STEP;
      autoScrollRef.current = requestAnimationFrame(tick);
    };
    autoScrollRef.current = requestAnimationFrame(tick);
  }, [stopAutoScroll]);
  useEffect(() => () => stopAutoScroll(), [stopAutoScroll]);

  if (totalRows === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-12 text-center">
        <div className="text-3xl mb-2">📭</div>
        <div className="text-sm font-medium text-slate-700">Под фильтры ничего не подошло</div>
        <div className="text-xs text-slate-400 mt-1">Сбросьте фильтры или поменяйте поиск</div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white">
      {/* Мобильный переключатель: настоящий Гант (Алёна 05.07 «чтобы пальцем
          перетаскивать, рассматривать, двигать») или компактный список. */}
      <div className="flex gap-1 border-b border-slate-100 p-2 md:hidden">
        {([["chart", "📊 График"], ["list", "📋 Список"]] as const).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setMobileView(key)}
            className={`min-h-[36px] flex-1 rounded-lg px-2 text-xs font-medium transition ${
              mobileView === key ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Гант: на десктопе всегда, на мобиле — когда выбран «График» */}
      <div className={`relative ${mobileView === "chart" ? "block" : "hidden md:block"}`}>
        {/* Кнопка «Сегодня» — вернуться к текущей дате из любого места таймлайна */}
        <button
          type="button"
          onClick={scrollToToday}
          className="absolute right-3 top-2 z-40 rounded-lg border border-slate-300 bg-white/95 px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm backdrop-blur hover:bg-slate-50"
        >
          Сегодня
        </button>
        <div
          ref={scrollRef}
          className="h-[calc(100dvh-290px)] touch-pan-x touch-pan-y overflow-auto select-none md:h-[calc(100vh-200px)]"
        >
          <div style={{ width: `${totalPx}px`, minWidth: "100%" }}>
            {/* Шкала */}
            <div className="sticky top-0 z-20 grid border-b border-slate-200 bg-white" style={{ gridTemplateColumns: gridCols }}>
              <div className="sticky left-0 z-30 border-r border-slate-100 bg-white px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                Заказ / Фасон
                <ResizeHandle
                  current={leftColWidth}
                  min={LEFT_MIN}
                  max={LEFT_MAX}
                  onChange={setLeftColWidth}
                  onCommit={persistLeftColWidth}
                />
              </div>
              <div className="relative h-9" style={{ width: timelinePx }}>
                {marks.map((m) => {
                  const lineCls = m.isMonthStart
                    ? "border-slate-400"
                    : m.isStrong
                      ? "border-slate-300"
                      : "border-slate-100";
                  return (
                    <div
                      key={m.iso}
                      className="absolute top-0 h-full"
                      style={{ left: m.leftPx }}
                    >
                      <div className={`h-full border-l ${lineCls}`} />
                      {m.label && (
                        <div
                          className={`absolute top-1 -translate-x-1/2 text-[10px] ${
                            m.isMonthStart
                              ? "font-bold text-slate-900"
                              : m.isStrong
                                ? "font-semibold text-slate-700"
                                : "text-slate-400"
                          }`}
                          style={{ left: 0 }}
                        >
                          {m.label}
                        </div>
                      )}
                    </div>
                  );
                })}
                {todayInRange && (
                  <div
                    className="absolute -top-0.5 z-10 h-full border-l-2 border-red-500"
                    style={{ left: todayLeftPx }}
                  >
                    <div className="absolute -top-0.5 -translate-x-1/2 rounded bg-red-500 px-1 py-0.5 text-[9px] font-bold uppercase text-white">
                      сегодня
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Группы */}
            {groups.map((g) => (
              <GroupBlock
                key={g.key}
                group={g}
                marks={marks}
                pxPerDay={pxPerDay}
                timelinePx={timelinePx}
                todayLeftPx={todayLeftPx}
                todayInRange={todayInRange}
                posPx={posPx}
                density={dens}
                showHeader={groups.length > 1 || groups[0]?.key !== "all"}
                gridCols={gridCols}
                onBarChange={onBarChange}
                pendingChanges={pendingChanges}
                zoom={zoom}
                maybeAutoScroll={maybeAutoScroll}
                stopAutoScroll={stopAutoScroll}
              />
            ))}
          </div>
        </div>

        {/* Легенда */}
        <div className="border-t border-slate-200 p-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-500">
          <LegendItem color="bg-slate-400" label="Разработка" />
          <LegendItem color="bg-blue-500" label="Производство" />
          <LegendItem color="bg-amber-500" label="ОТК" />
          <LegendItem color="bg-emerald-500" label="Доставка" />
          <span className="text-slate-300">·</span>
          <span><span className="inline-block h-3 w-3 rounded-sm border-2 border-red-500 align-middle mr-1" />Просрочено</span>
          <span><span className="inline-block h-3 w-3 rounded-sm border-2 border-amber-500 align-middle mr-1" />Скоро дедлайн</span>
          <span><span className="inline-block h-3 w-3 rounded-sm bg-slate-200 align-middle mr-1" />Впереди</span>
          <span><span className="inline-block h-3 w-3 rounded-sm bg-slate-400 opacity-60 align-middle mr-1" />Сделано</span>
        </div>
      </div>

      {/* Мобильный: компактный список (второй режим переключателя) */}
      <div className={`p-2 md:hidden ${mobileView === "list" ? "" : "hidden"}`}>
        <MobileList groups={groups} todayIso={todayIso} />
      </div>
    </div>
  );
}

function GroupBlock({
  group, marks, pxPerDay, timelinePx, todayLeftPx, todayInRange, posPx, density, showHeader, gridCols, onBarChange, pendingChanges, zoom, maybeAutoScroll, stopAutoScroll,
}: {
  group: GanttGroupView;
  marks: Mark[];
  pxPerDay: number;
  timelinePx: number;
  todayLeftPx: number;
  todayInRange: boolean;
  posPx: (iso: string) => number;
  density: typeof DENSITY[GanttDensity];
  showHeader: boolean;
  gridCols: string;
  onBarChange: (orderId: string, endField: string, newDateIso: string, group: GanttGroup) => void;
  pendingChanges: Record<string, string>;
  zoom: GanttZoom;
  maybeAutoScroll: (clientX: number, active: () => boolean) => void;
  stopAutoScroll: () => void;
}) {
  const [collapsed, setCollapsed] = useState(false);

  const stats = useMemo(() => {
    let burning = 0, overdue = 0, ok = 0;
    for (const r of group.rows) {
      if (r.hasOverdue) overdue += 1;
      else if (r.hasNearlyDue) burning += 1;
      else ok += 1;
    }
    return { burning, overdue, ok };
  }, [group.rows]);

  return (
    <div>
      {showHeader && (
        <div
          onClick={() => setCollapsed((c) => !c)}
          className="sticky top-9 z-10 grid cursor-pointer border-b border-slate-200 bg-slate-50 hover:bg-slate-100"
          style={{ gridTemplateColumns: gridCols }}
        >
          <div className="sticky left-0 z-20 flex items-center gap-2 border-r border-slate-100 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700">
            <span className="text-[10px]">{collapsed ? "▶" : "▼"}</span>
            <span>{group.label}</span>
            <span className="rounded-full bg-slate-200 px-1.5 py-0.5 text-[10px] text-slate-600">
              {group.rows.length}
            </span>
            {stats.overdue > 0 && (
              <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] text-red-700 dark:bg-red-400/10 dark:text-red-300">
                🔥 {stats.overdue}
              </span>
            )}
          </div>
          <div />
        </div>
      )}
      {!collapsed && group.rows.map((r) => (
        <RowView
          key={`${r.group}-${r.id}`}
          row={r}
          marks={marks}
          pxPerDay={pxPerDay}
          timelinePx={timelinePx}
          todayLeftPx={todayLeftPx}
          todayInRange={todayInRange}
          posPx={posPx}
          density={density}
          gridCols={gridCols}
          onBarChange={onBarChange}
          pendingChanges={pendingChanges}
          zoom={zoom}
          maybeAutoScroll={maybeAutoScroll}
          stopAutoScroll={stopAutoScroll}
        />
      ))}
    </div>
  );
}

function RowView({
  row, marks, pxPerDay, timelinePx, todayLeftPx, todayInRange, posPx, density, gridCols, onBarChange, pendingChanges, zoom, maybeAutoScroll, stopAutoScroll,
}: {
  row: GanttRowV2;
  marks: Mark[];
  pxPerDay: number;
  timelinePx: number;
  todayLeftPx: number;
  todayInRange: boolean;
  posPx: (iso: string) => number;
  density: typeof DENSITY[GanttDensity];
  gridCols: string;
  onBarChange: (orderId: string, endField: string, newDateIso: string, group: GanttGroup) => void;
  pendingChanges: Record<string, string>;
  zoom: GanttZoom;
  maybeAutoScroll: (clientX: number, active: () => boolean) => void;
  stopAutoScroll: () => void;
}) {
  // Эффективные start/end каждого бара с учётом pendingChanges.
  const effBars = row.bars.map((b) => {
    const pk = b.orderId && b.endField ? `${row.group}:${b.orderId}:${b.endField}` : null;
    const effEnd = pk && pendingChanges[pk] ? pendingChanges[pk] : b.end;
    return { bar: b, effEnd };
  });

  // effStart бара = effEnd предыдущего (или собственный start у первого;
  // у первого — с учётом pending по startField).
  const startPk = row.bars[0]?.orderId && row.bars[0]?.startField
    ? `${row.group}:${row.bars[0].orderId}:${row.bars[0].startField}`
    : null;
  const firstEffStart = (startPk && pendingChanges[startPk]) ? pendingChanges[startPk] : row.bars[0]?.start;

  function effStartOf(idx: number): string {
    if (idx === 0) return firstEffStart ?? row.bars[0]?.start ?? "";
    return effBars[idx - 1].effEnd;
  }

  // ── Фазы для applyDrag ────────────────────────────────────────────────────
  // key = поле в БД (endField). Первый бар несёт startField (если есть).
  const mathPhases: TimelinePhase[] = row.bars.map((b, idx) => ({
    key: b.endField ?? `phase-${idx}`,
    endField: b.endField ?? "",
    startField: idx === 0 ? b.startField : undefined,
    startIso: effStartOf(idx),
    endIso: effBars[idx].effEnd,
  }));

  // field (endField/startField) → orderId, чтобы разложить изменения applyDrag
  // по вызовам onBarChange. Все бары строки — один заказ, но держим карту явно.
  const fieldToOrder = new Map<string, string>();
  for (const b of row.bars) {
    if (b.orderId && b.endField) fieldToOrder.set(b.endField, b.orderId);
    if (b.orderId && b.startField) fieldToOrder.set(b.startField, b.orderId);
  }

  // Применяет жест: index фазы + край + новая дата → батч onBarChange.
  const dispatchDrag = useCallback(
    (phaseIndex: number, edge: "start" | "end", newIso: string) => {
      const changes = applyDrag(mathPhases, { phaseIndex, edge, newIso });
      for (const c of changes) {
        const oid = fieldToOrder.get(c.field);
        if (!oid) continue;
        onBarChange(oid, c.field, c.newIso, row.group);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [row.bars, pendingChanges, onBarChange, row.group],
  );

  return (
    <div className="grid border-b border-slate-100 hover:bg-slate-50/50" style={{ gridTemplateColumns: gridCols }}>
      {/* Левая колонка */}
      <div className="sticky left-0 z-20 flex items-start gap-2 border-r border-slate-100 bg-white px-3 py-2" style={{ minHeight: density.rowH }}>
        {density.thumbSize > 0 && row.thumbnails && row.thumbnails.length > 0 && (
          <ThumbnailStack thumbs={row.thumbnails} size={density.thumbSize} />
        )}
        <div className="min-w-0 flex-1">
          <Link
            href={row.href}
            className="block truncate text-sm font-medium text-slate-900 hover:text-blue-600 dark:hover:text-blue-300"
            title={row.lateDays && row.lateDays > 0 ? `${row.title} · опаздывает ${row.lateDays} дн` : row.title}
          >
            {row.title}
          </Link>
          {density.showSubtitle && (
            <div className="truncate text-[11px] text-slate-500">
              {row.statusLabel}
              {row.lateDays && row.lateDays > 0 ? (
                <span className="font-semibold text-amber-600 dark:text-amber-300"> · опаздывает {row.lateDays} дн</span>
              ) : ""}
              {row.subtitle ? ` · ${row.subtitle}` : ""}
              {row.ownerName ? ` · ${row.ownerName}` : ""}
              {row.factoryName ? ` · ${row.factoryName}` : ""}
            </div>
          )}
        </div>
      </div>

      {/* Правая колонка — таймлайн (ширина в px, плашки НЕ клипуются) */}
      <div
        className="relative"
        style={{ height: density.rowH, width: timelinePx }}
      >
        {/* Сетка */}
        {marks.map((m) => {
          const cls = m.isMonthStart
            ? "border-slate-400"
            : m.isStrong
              ? "border-slate-200"
              : "border-slate-100";
          return (
            <div
              key={m.iso}
              className={`absolute top-0 h-full border-l ${cls}`}
              style={{ left: m.leftPx }}
            />
          );
        })}
        {/* Зебра выходных — только на зуме «1 нед». */}
        {zoom === "1w" && marks.filter((m) => m.isWeekend).map((m) => (
          <div
            key={"we" + m.iso}
            className="pointer-events-none absolute top-0 h-full bg-slate-100/40"
            style={{ left: m.leftPx, width: pxPerDay }}
          />
        ))}
        {/* Сегодня */}
        {todayInRange && (
          <div
            className="absolute top-0 z-10 h-full border-l-2 border-red-400"
            style={{ left: todayLeftPx }}
          />
        )}
        {/* Бары */}
        {row.bars.map((b, i) => (
          <BarView
            key={b.key + i}
            bar={b}
            barIndex={i}
            startIso={effStartOf(i)}
            endIso={effBars[i].effEnd}
            dirty={effBars[i].effEnd !== b.end || (i === 0 && (firstEffStart ?? b.start) !== b.start) || (i > 0 && effBars[i - 1].effEnd !== row.bars[i - 1].end)}
            hasStartHandle={i === 0 ? !!b.startField : !!(row.bars[i - 1]?.orderId && row.bars[i - 1]?.endField)}
            posPx={posPx}
            pxPerDay={pxPerDay}
            barH={density.barH}
            barTop={density.barTop}
            dispatchDrag={dispatchDrag}
            maybeAutoScroll={maybeAutoScroll}
            stopAutoScroll={stopAutoScroll}
          />
        ))}
      </div>
    </div>
  );
}

function BarView({
  bar, barIndex, startIso, endIso, dirty, hasStartHandle, posPx, pxPerDay, barH, barTop, dispatchDrag, maybeAutoScroll, stopAutoScroll,
}: {
  bar: GanttBarV2;
  barIndex: number;
  startIso: string;
  endIso: string;
  dirty: boolean;
  hasStartHandle: boolean;
  posPx: (iso: string) => number;
  pxPerDay: number;
  barH: number;
  barTop: number;
  dispatchDrag: (phaseIndex: number, edge: "start" | "end", newIso: string) => void;
  maybeAutoScroll: (clientX: number, active: () => boolean) => void;
  stopAutoScroll: () => void;
}) {
  const left = posPx(startIso);
  // Минимальная видимая ширина, чтобы нулевая/отрицательная фаза оставалась
  // кликабельной. Позиция ручек считается от РЕАЛЬНЫХ дат, не от этой ширины.
  const MIN_BAR = 6;
  const rawWidth = posPx(endIso) - left;
  const width = Math.max(MIN_BAR, rawWidth);
  const days = dayDiff(startIso, endIso);

  // Состояние плашки → визуальное оформление (done/future = 50%).
  let stateClass = "";
  if (bar.state === "done") stateClass = "opacity-50";
  if (bar.state === "future") stateClass = "opacity-50";

  const tooltip = `${bar.title} · ${formatDM(startIso)} → ${formatDM(endIso)} · ${days} дн${
    bar.owner ? ` · ${bar.owner}` : ""
  }${dirty ? " · ИЗМЕНЕНО" : ""}`;

  const editable = !!(bar.orderId && bar.endField);

  return (
    <DraggableBar
      left={left}
      width={width}
      top={barTop}
      height={barH}
      barColor={bar.color}
      stateClass={stateClass}
      tooltip={tooltip}
      barTitle={bar.title}
      editable={editable}
      hasStartHandle={hasStartHandle}
      startIso={startIso}
      endIso={endIso}
      pxPerDay={pxPerDay}
      barIndex={barIndex}
      dispatchDrag={dispatchDrag}
      maybeAutoScroll={maybeAutoScroll}
      stopAutoScroll={stopAutoScroll}
    />
  );
}

function DraggableBar({
  left, width, top, height, barColor, stateClass, tooltip, barTitle,
  editable, hasStartHandle, startIso, endIso, pxPerDay, barIndex, dispatchDrag, maybeAutoScroll, stopAutoScroll,
}: {
  left: number;
  width: number;
  top: number;
  height: number;
  barColor: string;
  stateClass: string;
  tooltip: string;
  barTitle: string;
  editable: boolean;
  hasStartHandle: boolean;
  startIso: string;
  endIso: string;
  pxPerDay: number;
  barIndex: number;
  dispatchDrag: (phaseIndex: number, edge: "start" | "end", newIso: string) => void;
  maybeAutoScroll: (clientX: number, active: () => boolean) => void;
  stopAutoScroll: () => void;
}) {
  const [hoverIso, setHoverIso] = useState<string | null>(null);
  const [dragEdge, setDragEdge] = useState<"start" | "end" | null>(null);
  const [flash, setFlash] = useState(false);
  // П6: тап по телу плашки на тач-устройстве открывает нижний лист с фазой
  // (название, start→end, два date-инпута). Сохранение пишет ТЕ ЖЕ поля через
  // dispatchDrag — контракт жестов (правка start фазы N = end фазы N-1 внутри
  // applyDrag). На десктопе тап игнорируем — там работает drag за края.
  const [sheetOpen, setSheetOpen] = useState(false);
  const didDragRef = useRef(false);
  function onBodyClick() {
    if (!editable) return;
    if (didDragRef.current) { didDragRef.current = false; return; }
    if (typeof window !== "undefined" && window.matchMedia("(hover: none)").matches) {
      setSheetOpen(true);
    }
  }
  const dragRef = useRef<{
    edge: "start" | "end";
    startX: number;
    origIso: string;
    pointerId: number;
    target: Element;
  } | null>(null);

  // ── Drag через pointer events + setPointerCapture (мышь/палец/стилус) ──────
  function onPointerDown(e: React.PointerEvent, edge: "start" | "end") {
    e.preventDefault();
    e.stopPropagation();
    const origIso = edge === "start" ? startIso : endIso;
    const target = e.currentTarget as Element;
    target.setPointerCapture(e.pointerId);
    dragRef.current = { edge, startX: e.clientX, origIso, pointerId: e.pointerId, target };
    setDragEdge(edge);
    setHoverIso(origIso);
  }

  function onPointerMove(e: React.PointerEvent) {
    const s = dragRef.current;
    if (!s) return;
    const deltaDays = Math.round((e.clientX - s.startX) / pxPerDay);
    const newIso = toISO(addDays(parseISO(s.origIso), deltaDays));
    setHoverIso(newIso);
    maybeAutoScroll(e.clientX, () => dragRef.current != null);
    if (deltaDays === 0) return;
    didDragRef.current = true; // был реальный сдвиг — не открывать лист по трейлинг-клику
    // Вся математика — через applyDrag (без клампов/подтяжек).
    dispatchDrag(barIndex, s.edge, newIso);
  }

  function endDrag(e: React.PointerEvent) {
    const s = dragRef.current;
    if (s) {
      try { s.target.releasePointerCapture(s.pointerId); } catch { /* уже отпущен */ }
    }
    const committed = !!s;
    dragRef.current = null;
    setDragEdge(null);
    setHoverIso(null);
    stopAutoScroll();
    e.stopPropagation();
    if (committed) {
      setFlash(true);
      setTimeout(() => setFlash(false), 600);
    }
  }

  return (
    <div
      onClick={onBodyClick}
      className={`group absolute rounded ${barColor} ${stateClass} shadow-sm transition-all duration-300 ${editable ? "[@media(hover:none)]:cursor-pointer" : ""} ${flash ? "ring-2 ring-emerald-400 ring-offset-1 dark:ring-emerald-400/30" : ""}`}
      style={{ left, width, top, height }}
    >
      {/* Тёмный кастомный тултип под плашкой (родного title нет). */}
      <div className="pointer-events-none absolute left-1/2 top-full z-30 mt-1 hidden -translate-x-1/2 whitespace-nowrap rounded-md bg-slate-900 px-2 py-1 text-[11px] text-white shadow-lg group-hover:block">
        {tooltip}
      </div>

      {/* Левая ручка ◀ — hit-area ≥44px (невидимый квадрат), видимая полоска 3px. */}
      {editable && hasStartHandle && (
        <span
          onPointerDown={(e) => onPointerDown(e, "start")}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          title="Потянуть — изменить начало фазы"
          className="absolute left-0 top-1/2 z-20 flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize touch-none items-center justify-center opacity-0 transition-opacity duration-150 group-hover:opacity-100 hover:!opacity-100 [@media(hover:none)]:opacity-80"
        >
          <span className="pointer-events-none w-[3px] rounded-full bg-white shadow-[0_0_0_1px_rgba(15,23,42,0.35)]" style={{ height: height - 6 }} />
        </span>
      )}

      {/* Правая ручка ▶ */}
      {editable && (
        <span
          onPointerDown={(e) => onPointerDown(e, "end")}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          title="Потянуть — изменить конец фазы"
          className="absolute right-0 top-1/2 z-20 flex h-11 w-11 translate-x-1/2 -translate-y-1/2 cursor-ew-resize touch-none items-center justify-center opacity-0 transition-opacity duration-150 group-hover:opacity-100 hover:!opacity-100 [@media(hover:none)]:opacity-80"
        >
          <span className="pointer-events-none w-[3px] rounded-full bg-white shadow-[0_0_0_1px_rgba(15,23,42,0.35)]" style={{ height: height - 6 }} />
        </span>
      )}

      {dragEdge && hoverIso && (
        <div
          className={`pointer-events-none absolute -top-5 z-30 whitespace-nowrap rounded-md bg-slate-900 px-1.5 py-0.5 text-[10px] text-white shadow ${
            dragEdge === "end" ? "right-0" : "left-0"
          }`}
        >
          {dragEdge === "end" ? "→" : "←"} {formatDM(hoverIso)}
        </div>
      )}

      {sheetOpen && (
        <PhaseSheet
          title={barTitle}
          startIso={startIso}
          endIso={endIso}
          hasStartHandle={hasStartHandle}
          onSaveStart={(iso) => dispatchDrag(barIndex, "start", iso)}
          onSaveEnd={(iso) => dispatchDrag(barIndex, "end", iso)}
          onClose={() => setSheetOpen(false)}
        />
      )}
    </div>
  );
}

// П6: нижний лист правки фазы (только тач). Два date-инпута; сохранение пишет
// те же поля через dispatchDrag — контракт жестов. Свайп вниз/крестик — закрыть.
function PhaseSheet({
  title, startIso, endIso, hasStartHandle, onSaveStart, onSaveEnd, onClose,
}: {
  title: string;
  startIso: string;
  endIso: string;
  hasStartHandle: boolean;
  onSaveStart: (iso: string) => void;
  onSaveEnd: (iso: string) => void;
  onClose: () => void;
}) {
  const [start, setStart] = useState(startIso);
  const [end, setEnd] = useState(endIso);
  const touchStartY = useRef<number | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [onClose]);

  function save() {
    // Правку start дозволяем, только если у фазы есть «левая ручка» (у первого
    // бара — свой startField, у остальных start = end предыдущей фазы).
    if (hasStartHandle && start && start !== startIso) onSaveStart(start);
    if (end && end !== endIso) onSaveEnd(end);
    onClose();
  }

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      onClick={onClose}
      className="fixed inset-0 z-[1000] flex flex-col justify-end bg-black/40"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        onTouchStart={(e) => { touchStartY.current = e.touches[0].clientY; }}
        onTouchEnd={(e) => {
          const dy = touchStartY.current != null ? e.changedTouches[0].clientY - touchStartY.current : 0;
          if (dy > 60) onClose();
          touchStartY.current = null;
        }}
        className="pb-safe-4 max-h-[85vh] overflow-y-auto rounded-t-2xl bg-white px-4 pb-6 pt-2 shadow-xl dark:bg-slate-900"
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-slate-300 dark:bg-slate-600" />
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-base font-semibold text-slate-900 dark:text-slate-100">{title}</div>
            <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              {formatDM(startIso)} → {formatDM(endIso)} · {dayDiff(startIso, endIso)} дн
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-lg text-slate-500 dark:bg-slate-800 dark:text-slate-300"
          >
            ×
          </button>
        </div>

        <div className="space-y-3">
          {hasStartHandle ? (
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">Начало</span>
              <input
                type="date"
                value={start}
                onChange={(e) => setStart(e.target.value)}
                className="h-12 w-full rounded-lg border border-slate-300 bg-white px-3 text-base text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
              />
            </label>
          ) : (
            <div className="text-xs text-slate-400 dark:text-slate-500">
              Начало = конец предыдущей фазы — двигай его в той фазе.
            </div>
          )}
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">Конец</span>
            <input
              type="date"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
              className="h-12 w-full rounded-lg border border-slate-300 bg-white px-3 text-base text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
            />
          </label>
        </div>

        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[48px] flex-1 rounded-lg border border-slate-300 bg-white text-sm font-medium text-slate-600 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300"
          >
            Отмена
          </button>
          <button
            type="button"
            onClick={save}
            className="min-h-[48px] flex-1 rounded-lg bg-slate-900 text-sm font-medium text-white dark:bg-slate-100 dark:text-slate-900"
          >
            Сохранить
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
