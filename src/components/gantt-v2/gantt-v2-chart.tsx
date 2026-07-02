"use client";

import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
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

  const calStart = toISO(range.start);
  const calEnd = toISO(range.end);
  // Запас по краям, чтобы крайние ручки не липли к краю рейла.
  const MARGIN_DAYS = 7;
  let chartStart = calStart;
  let chartEnd = calEnd;
  if (dataRange.min && dayDiff(dataRange.min, chartStart) > 0) {
    chartStart = toISO(addDays(parseISO(dataRange.min), -MARGIN_DAYS));
  }
  if (dataRange.max && dayDiff(chartEnd, dataRange.max) > 0) {
    chartEnd = toISO(addDays(parseISO(dataRange.max), MARGIN_DAYS));
  }
  const totalDays = Math.max(1, dayDiff(chartStart, chartEnd));

  // Ширина левой колонки «Заказ / фасон» — drag-resize, как в Google Sheets.
  // Сохраняется в localStorage, чтобы при перезагрузке не сбрасывалась.
  const LEFT_MIN = 140;
  const LEFT_MAX = 700;
  const [leftColWidth, setLeftColWidth] = useState<number>(300);
  useEffect(() => {
    const stored = Number(window.localStorage.getItem("gantt-v2:leftColWidth"));
    if (stored >= LEFT_MIN && stored <= LEFT_MAX) setLeftColWidth(stored);
  }, []);
  function persistLeftColWidth(w: number) {
    window.localStorage.setItem("gantt-v2:leftColWidth", String(w));
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

  // При заходе на страницу скроллим в начало — Алёна жаловалась, что при
  // авто-скролле к "сегодня" левая колонка с названиями заказов прячется.
  const scrollRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollLeft = 0;
  }, [zoom]);

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
      {/* Десктоп: Гант */}
      <div className="hidden md:block">
        <div ref={scrollRef} className="h-[calc(100vh-200px)] overflow-auto select-none">
          <div style={{ width: `${totalPx}px`, minWidth: "100%" }}>
            {/* Шкала */}
            <div className="sticky top-0 z-20 grid border-b border-slate-200 bg-white" style={{ gridTemplateColumns: gridCols }}>
              <div className="relative px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
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

      {/* Мобильный: список */}
      <div className="md:hidden p-2">
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
          <div className="flex items-center gap-2 px-3 py-1.5 text-xs font-semibold text-slate-700">
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
      <div className="flex items-start gap-2 px-3 py-2" style={{ minHeight: density.rowH }}>
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
  left, width, top, height, barColor, stateClass, tooltip,
  editable, hasStartHandle, startIso, endIso, pxPerDay, barIndex, dispatchDrag, maybeAutoScroll, stopAutoScroll,
}: {
  left: number;
  width: number;
  top: number;
  height: number;
  barColor: string;
  stateClass: string;
  tooltip: string;
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
      className={`group absolute rounded ${barColor} ${stateClass} shadow-sm transition-all duration-300 ${flash ? "ring-2 ring-emerald-400 ring-offset-1 dark:ring-emerald-400/30" : ""}`}
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
          className="absolute left-0 top-1/2 z-20 flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize touch-none items-center justify-center opacity-0 transition-opacity duration-150 group-hover:opacity-100 hover:!opacity-100"
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
          className="absolute right-0 top-1/2 z-20 flex h-11 w-11 translate-x-1/2 -translate-y-1/2 cursor-ew-resize touch-none items-center justify-center opacity-0 transition-opacity duration-150 group-hover:opacity-100 hover:!opacity-100"
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
    </div>
  );
}
