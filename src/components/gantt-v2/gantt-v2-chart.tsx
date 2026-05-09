"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { GanttRowV2, GanttBarV2, GanttGroup, GanttZoom, GanttDensity, GanttThumbnail } from "./types";
import { colorHexFromName, isLightColor } from "@/lib/color-map";

const ZOOM_OPTIONS: Record<GanttZoom, { daysBack: number; daysForward: number }> = {
  "1w": { daysBack: 2, daysForward: 7 },
  "1m": { daysBack: 7, daysForward: 30 },
  "3m": { daysBack: 14, daysForward: 75 },
  "6m": { daysBack: 30, daysForward: 150 },
  "1y": { daysBack: 60, daysForward: 300 },
  "auto": { daysBack: 14, daysForward: 75 },
};

const DENSITY: Record<GanttDensity, { rowH: number; thumbSize: number; barH: number; barTop: number; showSubtitle: boolean }> = {
  compact:  { rowH: 32, thumbSize: 0,  barH: 16, barTop: 8,  showSubtitle: false },
  normal:   { rowH: 52, thumbSize: 36, barH: 24, barTop: 14, showSubtitle: true },
  spacious: { rowH: 72, thumbSize: 48, barH: 28, barTop: 22, showSubtitle: true },
};

function parseISO(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function toISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 86400000);
}

function formatDM(iso: string): string {
  const d = parseISO(iso);
  return `${String(d.getUTCDate()).padStart(2, "0")}.${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function dayDiff(a: string, b: string): number {
  return Math.round((parseISO(b).getTime() - parseISO(a).getTime()) / 86400000);
}

const MONTH_RU = ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];

export type GanttGroupView = { key: string; label: string; rows: GanttRowV2[] };

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
  const { daysBack, daysForward } = ZOOM_OPTIONS[zoom];
  const today = parseISO(todayIso);
  const chartStart = toISO(addDays(today, -daysBack));
  const chartEnd = toISO(addDays(today, daysForward));
  const totalDays = Math.max(1, dayDiff(chartStart, chartEnd));

  const dens = DENSITY[density];

  const totalRows = groups.reduce((a, g) => a + g.rows.length, 0);

  // Опорные линии шкалы — адаптивные (день/неделя/месяц)
  const marks = useMemo(() => {
    const out: Array<{ iso: string; pct: number; label: string; isMonthStart: boolean; isStrong: boolean }> = [];
    const start = parseISO(chartStart);
    if (zoom === "1w") {
      // дни
      const cur = new Date(start);
      while (cur <= parseISO(chartEnd)) {
        const iso = toISO(cur);
        out.push({
          iso,
          pct: (dayDiff(chartStart, iso) / totalDays) * 100,
          label: `${cur.getUTCDate()}`,
          isMonthStart: cur.getUTCDate() === 1,
          isStrong: cur.getUTCDay() === 1,
        });
        cur.setUTCDate(cur.getUTCDate() + 1);
      }
    } else if (zoom === "1m" || zoom === "3m") {
      // недели по понедельникам
      const cur = new Date(start);
      const offset = (cur.getUTCDay() + 6) % 7;
      cur.setUTCDate(cur.getUTCDate() - offset);
      while (cur <= parseISO(chartEnd)) {
        const iso = toISO(cur);
        if (iso >= chartStart) {
          out.push({
            iso,
            pct: (dayDiff(chartStart, iso) / totalDays) * 100,
            label: formatDM(iso),
            isMonthStart: cur.getUTCDate() <= 7,
            isStrong: cur.getUTCDate() <= 7,
          });
        }
        cur.setUTCDate(cur.getUTCDate() + 7);
      }
    } else {
      // месяцы для 6m/1y/auto
      const cur = new Date(start);
      cur.setUTCDate(1);
      while (cur <= parseISO(chartEnd)) {
        const iso = toISO(cur);
        if (iso >= chartStart) {
          out.push({
            iso,
            pct: (dayDiff(chartStart, iso) / totalDays) * 100,
            label: `${MONTH_RU[cur.getUTCMonth()]}`,
            isMonthStart: true,
            isStrong: true,
          });
        }
        cur.setUTCMonth(cur.getUTCMonth() + 1);
      }
    }
    return out;
  }, [chartStart, chartEnd, totalDays, zoom]);

  function posPct(iso: string): number {
    return (dayDiff(chartStart, iso) / totalDays) * 100;
  }

  const todayPct = posPct(todayIso);

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
        <div className="max-h-[calc(100vh-360px)] overflow-auto">
          <div className="min-w-[1100px]">
            {/* Шкала */}
            <div className="sticky top-0 z-20 grid grid-cols-[300px_1fr] border-b border-slate-200 bg-white">
              <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                Заказ / Фасон
              </div>
              <div className="relative h-9">
                {marks.map((m) => (
                  <div
                    key={m.iso}
                    className="absolute top-0 h-full"
                    style={{ left: `${m.pct}%` }}
                  >
                    <div className={`h-full border-l ${m.isStrong ? "border-slate-300" : "border-slate-100"}`} />
                    <div
                      className={`absolute top-1 -translate-x-1/2 text-[10px] ${
                        m.isStrong ? "font-semibold text-slate-700" : "text-slate-400"
                      }`}
                      style={{ left: 0 }}
                    >
                      {m.label}
                    </div>
                  </div>
                ))}
                {todayPct >= 0 && todayPct <= 100 && (
                  <div
                    className="absolute -top-0.5 z-10 h-full border-l-2 border-red-500"
                    style={{ left: `${todayPct}%` }}
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
                todayPct={todayPct}
                posPct={posPct}
                chartStart={chartStart}
                chartEnd={chartEnd}
                density={dens}
                showHeader={groups.length > 1 || groups[0]?.key !== "all"}
                onBarChange={onBarChange}
                pendingChanges={pendingChanges}
              />
            ))}
          </div>
        </div>

        {/* Легенда */}
        <div className="border-t border-slate-200 p-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-500">
          <LegendItem color="bg-rose-300" label="Разработка" />
          <LegendItem color="bg-blue-500" label="Производство" />
          <LegendItem color="bg-amber-500" label="ОТК" />
          <LegendItem color="bg-fuchsia-500" label="Доставка" />
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
  group, marks, todayPct, posPct, chartStart, chartEnd, density, showHeader, onBarChange, pendingChanges,
}: {
  group: GanttGroupView;
  marks: Array<{ iso: string; pct: number; isStrong: boolean }>;
  todayPct: number;
  posPct: (iso: string) => number;
  chartStart: string;
  chartEnd: string;
  density: typeof DENSITY[GanttDensity];
  showHeader: boolean;
  onBarChange: (orderId: string, endField: string, newDateIso: string, group: GanttGroup) => void;
  pendingChanges: Record<string, string>;
}) {
  const [collapsed, setCollapsed] = useState(false);

  // Mini-statusbar для группы: распределение по состояниям
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
          className="sticky top-9 z-10 grid cursor-pointer grid-cols-[300px_1fr] border-b border-slate-200 bg-slate-50 hover:bg-slate-100"
        >
          <div className="flex items-center gap-2 px-3 py-1.5 text-xs font-semibold text-slate-700">
            <span className="text-[10px]">{collapsed ? "▶" : "▼"}</span>
            <span>{group.label}</span>
            <span className="rounded-full bg-slate-200 px-1.5 py-0.5 text-[10px] text-slate-600">
              {group.rows.length}
            </span>
            {stats.overdue > 0 && (
              <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] text-red-700">
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
          todayPct={todayPct}
          posPct={posPct}
          chartStart={chartStart}
          chartEnd={chartEnd}
          density={density}
          onBarChange={onBarChange}
          pendingChanges={pendingChanges}
        />
      ))}
    </div>
  );
}

function RowView({
  row, marks, todayPct, posPct, chartStart, chartEnd, density, onBarChange, pendingChanges,
}: {
  row: GanttRowV2;
  marks: Array<{ iso: string; pct: number; isStrong: boolean }>;
  todayPct: number;
  posPct: (iso: string) => number;
  chartStart: string;
  chartEnd: string;
  density: typeof DENSITY[GanttDensity];
  onBarChange: (orderId: string, endField: string, newDateIso: string, group: GanttGroup) => void;
  pendingChanges: Record<string, string>;
}) {
  return (
    <div className="grid grid-cols-[300px_1fr] border-b border-slate-100 hover:bg-slate-50/50">
      {/* Левая колонка */}
      <div className="flex items-start gap-2 px-3 py-2" style={{ minHeight: density.rowH }}>
        {density.thumbSize > 0 && row.thumbnails && row.thumbnails.length > 0 && (
          <ThumbnailStack thumbs={row.thumbnails} size={density.thumbSize} />
        )}
        <div className="min-w-0 flex-1">
          <Link href={row.href} className="block truncate text-sm font-medium text-slate-900 hover:text-blue-600" title={row.title}>
            {row.title}
          </Link>
          {density.showSubtitle && (
            <div className="truncate text-[11px] text-slate-500">
              {row.statusLabel}
              {row.subtitle ? ` · ${row.subtitle}` : ""}
              {row.ownerName ? ` · ${row.ownerName}` : ""}
              {row.factoryName ? ` · ${row.factoryName}` : ""}
            </div>
          )}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-0.5">
          {row.hasOverdue && <span title="Просрочено" className="text-sm">🔥</span>}
          {!row.hasOverdue && row.hasNearlyDue && <span title="Скоро дедлайн" className="text-sm">⚠️</span>}
          {row.hasDateOrderIssue && (
            <span
              title={`Нелогичный порядок фаз: ${row.dateOrderIssueText ?? ""}. Перетащите ◀ ▶ чтобы исправить.`}
              className="rounded-full border border-orange-400 bg-orange-100 px-1.5 py-0.5 text-[9px] font-bold text-orange-700"
            >
              ↯ даты
            </span>
          )}
        </div>
      </div>

      {/* Правая колонка — таймлайн */}
      <div
        className="relative"
        style={{ height: density.rowH }}
      >
        {/* Сетка */}
        {marks.map((m) => (
          <div
            key={m.iso}
            className={`absolute top-0 h-full border-l ${m.isStrong ? "border-slate-200" : "border-slate-100"}`}
            style={{ left: `${m.pct}%` }}
          />
        ))}
        {/* Сегодня */}
        {todayPct >= 0 && todayPct <= 100 && (
          <div
            className="absolute top-0 z-10 h-full border-l-2 border-red-400"
            style={{ left: `${todayPct}%` }}
          />
        )}
        {/* Бары */}
        {row.bars.map((b, i) => (
          <BarView
            key={b.key + i}
            bar={b}
            barIndex={i}
            allBars={row.bars}
            rowGroup={row.group}
            marks={marks}
            posPct={posPct}
            chartStart={chartStart}
            chartEnd={chartEnd}
            barH={density.barH}
            barTop={density.barTop}
            onBarChange={onBarChange}
            pendingChanges={pendingChanges}
          />
        ))}
      </div>
    </div>
  );
}

function BarView({
  bar, barIndex, allBars, rowGroup, posPct, chartStart, chartEnd, barH, barTop, onBarChange, pendingChanges,
}: {
  bar: GanttBarV2;
  barIndex: number;
  allBars: GanttBarV2[];
  rowGroup: GanttGroup;
  marks: Array<{ iso: string; pct: number; isStrong: boolean }>;
  posPct: (iso: string) => number;
  chartStart: string;
  chartEnd: string;
  barH: number;
  barTop: number;
  onBarChange: (orderId: string, endField: string, newDateIso: string, group: GanttGroup) => void;
  pendingChanges: Record<string, string>;
}) {
  // Эффективные start/end с учётом pendingChanges
  const pendKey = bar.orderId && bar.endField ? `${rowGroup}:${bar.orderId}:${bar.endField}` : null;
  const effEnd = pendKey && pendingChanges[pendKey] ? pendingChanges[pendKey] : bar.end;

  const prev = barIndex > 0 ? allBars[barIndex - 1] : null;
  const prevPendKey = prev?.orderId && prev?.endField ? `${rowGroup}:${prev.orderId}:${prev.endField}` : null;
  const startPendKey = barIndex === 0 && bar.orderId && bar.startField
    ? `${rowGroup}:${bar.orderId}:${bar.startField}`
    : null;
  const effStart = (prevPendKey && pendingChanges[prevPendKey])
    ? pendingChanges[prevPendKey]
    : (startPendKey && pendingChanges[startPendKey])
      ? pendingChanges[startPendKey]
      : bar.start;

  const dirty = !!(
    (pendKey && pendingChanges[pendKey]) ||
    (prevPendKey && pendingChanges[prevPendKey]) ||
    (startPendKey && pendingChanges[startPendKey])
  );

  // Клип к видимому диапазону
  let s = effStart;
  let e = effEnd;
  if (s > chartEnd) s = chartEnd;
  if (e < chartStart) e = chartStart;
  if (s < chartStart) s = chartStart;
  if (e > chartEnd) e = chartEnd;
  const left = posPct(s);
  const width = Math.max(1.2, posPct(e) - left);
  const days = Math.round((parseISO(effEnd).getTime() - parseISO(effStart).getTime()) / 86400000);

  // Состояние плашки → визуальное оформление
  // - done: opacity 50%, без обводки, галочка ✓
  // - active: full color, без обводки
  // - future: pattern-заливка диагональными линиями + бледно
  // - overdue: красная обводка 2px
  // - nearlyDue: янтарная обводка 2px
  let stateClass = "";
  if (bar.state === "done") stateClass = "opacity-50";
  if (bar.state === "future") stateClass = "opacity-50";
  let borderClass = "";
  if (bar.overdue) borderClass = "ring-2 ring-red-500";
  else if (bar.nearlyDue) borderClass = "ring-2 ring-amber-500";

  const tooltip = `${bar.title} · ${formatDM(effStart)} → ${formatDM(effEnd)} · ${days} дн${
    bar.owner ? ` · ${bar.owner}` : ""
  }${bar.overdue ? " · ПРОСРОЧЕНО" : ""}${bar.nearlyDue && !bar.overdue ? " · СКОРО ДЕДЛАЙН" : ""}${dirty ? " · ИЗМЕНЕНО" : ""}`;

  const editable = !!(bar.orderId && bar.endField);

  return (
    <DraggableBar
      left={left}
      width={width}
      top={barTop}
      height={barH}
      barColor={bar.color}
      stateClass={stateClass}
      borderClass={borderClass}
      done={bar.state === "done"}
      future={bar.state === "future"}
      title={bar.title}
      tooltip={tooltip}
      editable={editable}
      hasStartHandle={
        // Левая ручка ◀ есть, если:
        //   1) это не-первая фаза — она редактирует endField предыдущей фазы (= тот же день в БД)
        //   2) это первая фаза И у неё есть собственный startField (decisionDate)
        !!((prev && prev.orderId && prev.endField) || (barIndex === 0 && bar.startField))
      }
      chartStart={chartStart}
      chartEnd={chartEnd}
      startIso={effStart}
      endIso={effEnd}
      onCommit={(rawNewEndIso) => {
        if (!bar.orderId || !bar.endField) return;
        // ПРАВИЛО: фазы строго последовательны и не пересекаются.
        // ▶ фазы не может уехать левее start этой же фазы (иначе фаза перевернётся).
        // Минимум — start, минимальная длительность фазы 0 дней (фаза «нулевая», точка).
        const minEnd = effStart;
        const newEndIso = rawNewEndIso < minEnd ? minEnd : rawNewEndIso;
        const oldEndIso = pendingChanges[pendKey ?? ""] ?? bar.end;
        const deltaMs = parseISO(newEndIso).getTime() - parseISO(oldEndIso).getTime();
        const deltaDays = Math.round(deltaMs / 86400000);
        if (deltaDays === 0) return;
        // ▶ фазы N: меняем endField фазы N. Хвост едет вправо/влево с сохранением длительностей.
        onBarChange(bar.orderId, bar.endField, newEndIso, rowGroup);
        for (let j = barIndex + 1; j < allBars.length; j++) {
          const nb = allBars[j];
          if (!nb.orderId || !nb.endField) continue;
          const nbKey = `${rowGroup}:${nb.orderId}:${nb.endField}`;
          const nbCur = pendingChanges[nbKey] ?? nb.end;
          const shifted = toISO(addDays(parseISO(nbCur), deltaDays));
          onBarChange(nb.orderId, nb.endField, shifted, rowGroup);
        }
      }}
      onCommitStart={
        ((prev && prev.orderId && prev.endField) || (barIndex === 0 && bar.startField))
          ? (rawNewStartIso) => {
              if (!bar.orderId) return;
              const oldStartIso = effStart;
              if (prev && prev.orderId && prev.endField) {
                // ◀ не-первой фазы = ▶ предыдущей. Меняем длительность предыдущей,
                // текущая и далее едут на дельту с сохранением длительностей.
                // ПРАВИЛО: новый end предыдущей не может уехать левее start предыдущей.
                const prevPrev = barIndex >= 2 ? allBars[barIndex - 2] : null;
                const prevPrevKey = prevPrev?.orderId && prevPrev?.endField
                  ? `${rowGroup}:${prevPrev.orderId}:${prevPrev.endField}`
                  : null;
                let prevStart: string;
                if (prevPrevKey && pendingChanges[prevPrevKey]) prevStart = pendingChanges[prevPrevKey];
                else if (prevPrev) prevStart = prevPrev.end;
                else prevStart = prev.start;
                const newStartIso = rawNewStartIso < prevStart ? prevStart : rawNewStartIso;
                const deltaMs = parseISO(newStartIso).getTime() - parseISO(oldStartIso).getTime();
                const deltaDays = Math.round(deltaMs / 86400000);
                if (deltaDays === 0) return;
                onBarChange(prev.orderId, prev.endField, newStartIso, rowGroup);
                for (let j = barIndex; j < allBars.length; j++) {
                  const nb = allBars[j];
                  if (!nb.orderId || !nb.endField) continue;
                  const nbKey = `${rowGroup}:${nb.orderId}:${nb.endField}`;
                  const nbCur = pendingChanges[nbKey] ?? nb.end;
                  const shifted = toISO(addDays(parseISO(nbCur), deltaDays));
                  onBarChange(nb.orderId, nb.endField, shifted, rowGroup);
                }
              } else if (bar.startField) {
                // ◀ ПЕРВОЙ фазы (Разработка): меняем ТОЛЬКО startField.
                // End разработки (= start следующей фазы) НЕ двигается.
                // Хвост стоит. По факту — фиксируем, что разработка
                // фактически началась раньше/позже, чем планировали.
                // ПРАВИЛО: новый start не может быть позже end этой же фазы
                // (иначе Разработка перевернётся и пересечётся с Производством).
                const maxStart = effEnd;
                const newStartIso = rawNewStartIso > maxStart ? maxStart : rawNewStartIso;
                const deltaMs = parseISO(newStartIso).getTime() - parseISO(oldStartIso).getTime();
                const deltaDays = Math.round(deltaMs / 86400000);
                if (deltaDays === 0) return;
                onBarChange(bar.orderId, bar.startField, newStartIso, rowGroup);
              }
            }
          : undefined
      }
    />
  );
}

function DraggableBar({
  left, width, top, height, barColor, stateClass, borderClass, done, future, title, tooltip,
  editable, hasStartHandle, chartStart, chartEnd, startIso, endIso, onCommit, onCommitStart,
}: {
  left: number;
  width: number;
  top: number;
  height: number;
  barColor: string;
  stateClass: string;
  borderClass: string;
  done?: boolean;
  future?: boolean;
  title: string;
  tooltip: string;
  editable: boolean;
  hasStartHandle: boolean;
  chartStart: string;
  chartEnd: string;
  startIso: string;
  endIso: string;
  onCommit: (newEndIso: string) => void;
  onCommitStart?: (newStartIso: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<"end" | "start" | null>(null);
  const [hoverIso, setHoverIso] = useState<string | null>(null);
  const [flash, setFlash] = useState(false);
  const dragRef = useRef<{ startX: number; pxPerDay: number; origIso: string } | null>(null);

  useEffect(() => {
    if (!dragging) return;
    function onMouseMove(e: MouseEvent) {
      const s = dragRef.current;
      if (!s) return;
      const deltaDays = Math.round((e.clientX - s.startX) / s.pxPerDay);
      setHoverIso(toISO(addDays(parseISO(s.origIso), deltaDays)));
    }
    function onUp() {
      let committed = false;
      if (hoverIso) {
        if (dragging === "end") { onCommit(hoverIso); committed = true; }
        else if (onCommitStart) { onCommitStart(hoverIso); committed = true; }
      }
      setDragging(null);
      setHoverIso(null);
      dragRef.current = null;
      if (committed) {
        setFlash(true);
        setTimeout(() => setFlash(false), 600);
      }
    }
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [dragging, hoverIso, onCommit, onCommitStart]);

  function beginDrag(e: React.MouseEvent, mode: "start" | "end") {
    e.preventDefault();
    e.stopPropagation();
    const track = ref.current?.parentElement;
    if (!track) return;
    const rect = track.getBoundingClientRect();
    const totalDays = Math.max(1, dayDiff(chartStart, chartEnd));
    dragRef.current = {
      startX: e.clientX,
      pxPerDay: rect.width / totalDays,
      origIso: mode === "end" ? endIso : startIso,
    };
    setDragging(mode);
  }

  // Future-полоса делается в виде diagonal-stripes overlay, чтобы было видно,
  // что эта фаза ещё впереди и редактируется, но не «исполняется».
  const futureOverlay = future ? (
    <div
      className="pointer-events-none absolute inset-0 rounded"
      style={{
        background: "repeating-linear-gradient(45deg, transparent 0 4px, rgba(255,255,255,0.4) 4px 8px)",
      }}
    />
  ) : null;

  return (
    <div
      ref={ref}
      className={`group absolute rounded ${barColor} ${stateClass} ${borderClass} shadow-sm transition-all duration-300 ${flash ? "ring-2 ring-emerald-400 ring-offset-1" : ""}`}
      style={{ left: `${left}%`, width: `${width}%`, top, height }}
      title={tooltip}
    >
      {futureOverlay}
      {/* Галочка для done */}
      {done && (
        <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-[12px] font-bold text-white drop-shadow-sm">
          ✓
        </span>
      )}
      {/* Подсказка тултип */}
      <div className="pointer-events-none absolute left-1/2 top-full z-30 mt-1 hidden -translate-x-1/2 whitespace-nowrap rounded-md bg-slate-900 px-2 py-1 text-[11px] text-white shadow-lg group-hover:block">
        {tooltip}
      </div>
      {/*
        Resize-хваты в стиле Figma/Linear: тонкие вертикальные полоски на краях
        плашки. В покое скрыты, появляются на hover плашки. Сама полоска 3px,
        но hit-area через горизонтальный padding ~10px — за счёт этого попасть
        легко даже на узких плашках. При hover на хват — он становится ярче.
      */}
      {editable && hasStartHandle && onCommitStart && (
        <span
          onMouseDown={(e) => beginDrag(e, "start")}
          title="Потянуть — изменить начало фазы"
          className="absolute left-0 top-0 z-20 h-full w-2.5 -translate-x-1/2 cursor-ew-resize opacity-0 transition-opacity duration-150 group-hover:opacity-100 hover:!opacity-100"
        >
          {/* Видимая часть — узкая вертикальная плашка */}
          <span className="pointer-events-none absolute left-1/2 top-1/2 h-[80%] w-[3px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-[0_0_0_1px_rgba(15,23,42,0.35)] transition-all hover:w-[5px] hover:bg-slate-900 hover:shadow-[0_0_0_1px_white]" />
        </span>
      )}
      {editable && (
        <span
          onMouseDown={(e) => beginDrag(e, "end")}
          title="Потянуть — изменить конец фазы"
          className="absolute right-0 top-0 z-20 h-full w-2.5 translate-x-1/2 cursor-ew-resize opacity-0 transition-opacity duration-150 group-hover:opacity-100 hover:!opacity-100"
        >
          <span className="pointer-events-none absolute left-1/2 top-1/2 h-[80%] w-[3px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-[0_0_0_1px_rgba(15,23,42,0.35)] transition-all hover:w-[5px] hover:bg-slate-900 hover:shadow-[0_0_0_1px_white]" />
        </span>
      )}
      {dragging && hoverIso && (
        <div
          className={`pointer-events-none absolute -top-5 z-30 whitespace-nowrap rounded-md bg-slate-900 px-1.5 py-0.5 text-[10px] text-white shadow ${
            dragging === "end" ? "right-0" : "left-0"
          }`}
        >
          {dragging === "end" ? "→" : "←"} {formatDM(hoverIso)}
        </div>
      )}
    </div>
  );
}

// ============================================================
// Превью фасонов / упаковки слева
// ============================================================
function ThumbnailStack({ thumbs, size }: { thumbs: GanttThumbnail[]; size: number }) {
  const visible = thumbs.slice(0, 3);
  const extra = thumbs.length - visible.length;
  return (
    <div className="flex shrink-0 -space-x-2">
      {visible.map((t, i) => (
        <Thumb key={i} thumb={t} z={visible.length - i} size={size} />
      ))}
      {extra > 0 && (
        <span
          className="relative z-0 flex items-center justify-center rounded-md border-2 border-white bg-slate-100 text-[10px] font-medium text-slate-600"
          style={{ width: size, height: size }}
        >
          +{extra}
        </span>
      )}
    </div>
  );
}

function Thumb({ thumb, z, size }: { thumb: GanttThumbnail; z: number; size: number }) {
  const colorHex = thumb.colorName ? colorHexFromName(thumb.colorName) : null;
  const isLight = colorHex ? isLightColor(colorHex) : false;
  if (thumb.photoUrl) {
    return (
      <span className="relative shrink-0" style={{ zIndex: z }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={thumb.photoUrl}
          alt={thumb.colorName ?? ""}
          className="rounded-md border-2 border-white object-cover shadow-sm"
          style={{ width: size, height: size }}
        />
        {colorHex && (
          <span
            className={`absolute -bottom-0.5 -right-0.5 block h-3 w-3 rounded-full border-2 border-white ${isLight ? "ring-1 ring-slate-300" : ""}`}
            style={{ backgroundColor: colorHex }}
            title={thumb.colorName ?? ""}
          />
        )}
      </span>
    );
  }
  if (colorHex) {
    return (
      <span
        className={`relative shrink-0 rounded-md border-2 border-white ${isLight ? "ring-1 ring-slate-300" : ""}`}
        style={{ backgroundColor: colorHex, zIndex: z, width: size, height: size }}
        title={thumb.colorName ?? ""}
      />
    );
  }
  return (
    <span
      className="relative shrink-0 flex items-center justify-center rounded-md border-2 border-white bg-slate-100 text-[10px] text-slate-400"
      style={{ zIndex: z, width: size, height: size }}
    >
      нет
    </span>
  );
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <span>
      <span className={`mr-1 inline-block h-2 w-4 rounded-sm ${color} align-middle`} />
      {label}
    </span>
  );
}

// ============================================================
// Мобильный список
// ============================================================
function MobileList({ groups, todayIso }: { groups: GanttGroupView[]; todayIso: string }) {
  const all = groups.flatMap((g) => g.rows);
  if (all.length === 0) {
    return <div className="p-6 text-center text-sm text-slate-400">Под фильтры ничего не подошло</div>;
  }

  const allEnds = all.flatMap((r) => r.bars.map((b) => b.end));
  const allStarts = all.flatMap((r) => r.bars.map((b) => b.start));
  const maxEndIso = allEnds.reduce((m, x) => (x > m ? x : m), todayIso);
  const minStartIso = allStarts.reduce((m, x) => (x < m ? x : m), todayIso);
  const chartStart = dayDiff(minStartIso, todayIso) > 14 ? toISO(addDays(parseISO(todayIso), -14)) : minStartIso;
  const chartEnd = dayDiff(todayIso, maxEndIso) < 30 ? toISO(addDays(parseISO(todayIso), 30)) : maxEndIso;
  const totalDays = Math.max(1, dayDiff(chartStart, chartEnd));
  const todayPct = (dayDiff(chartStart, todayIso) / totalDays) * 100;

  function pct(iso: string): number {
    return Math.max(0, Math.min(100, (dayDiff(chartStart, iso) / totalDays) * 100));
  }

  function fmt(iso: string) {
    const [, m, d] = iso.split("-");
    return `${d}.${m}`;
  }

  return (
    <div className="space-y-2">
      {all.map((r) => {
        const lastBar = r.bars[r.bars.length - 1];
        const finalEnd = lastBar?.end;
        const photoUrl = r.thumbnails?.find((t) => t.photoUrl)?.photoUrl ?? null;
        return (
          <Link
            key={`${r.group}-${r.id}`}
            href={r.href}
            className="block rounded-xl border border-slate-200 bg-white p-3 active:bg-slate-50"
          >
            <div className="flex items-center gap-2">
              {photoUrl && (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={photoUrl} alt="" className="h-10 w-10 shrink-0 rounded object-cover" />
              )}
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-slate-900">{r.title}</div>
                <div className="truncate text-[11px] text-slate-500">{r.subtitle}</div>
              </div>
              {finalEnd && (
                <div className={`shrink-0 text-right text-[11px] ${r.hasOverdue ? "text-red-600 font-semibold" : "text-slate-600"}`}>
                  {fmt(finalEnd)}
                </div>
              )}
            </div>
            <div className="relative mt-2 h-5 rounded bg-slate-100">
              {todayPct > 0 && todayPct < 100 && (
                <div className="absolute top-0 bottom-0 z-10 w-px bg-red-500" style={{ left: `${todayPct}%` }} />
              )}
              {r.bars.map((b) => {
                const left = pct(b.start);
                const width = Math.max(1.5, pct(b.end) - left);
                const colorClass = b.overdue ? "bg-red-500" : b.color;
                const opacity = b.state === "done" || b.state === "future" ? "opacity-50" : "";
                return (
                  <div
                    key={b.key}
                    className={`absolute top-1 h-3 rounded ${colorClass} ${opacity}`}
                    style={{ left: `${left}%`, width: `${width}%` }}
                    title={`${b.title}: ${fmt(b.start)} → ${fmt(b.end)}`}
                  />
                );
              })}
            </div>
          </Link>
        );
      })}
    </div>
  );
}
