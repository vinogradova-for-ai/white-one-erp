"use client";

import Link from "next/link";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { GanttRowV2, GanttBarV2, GanttGroup, GanttZoom, GanttDensity, GanttThumbnail } from "./types";
import { colorHexFromName, isLightColor } from "@/lib/color-map";

const ZOOM_OPTIONS: Record<GanttZoom, { pxPerDay: number }> = {
  // pxPerDay задаёт «насколько широко рисуется один день». Полная ширина
  // контента = totalDays × pxPerDay. Если она больше viewport — появляется
  // горизонтальный скролл.
  // Границы шкалы рассчитываются календарно: 1w = пн-вс текущей недели,
  // 1m = весь календарный месяц, 3m = текущий месяц + 2 следующих, и т.д.
  "1w":   { pxPerDay: 120 },
  "1m":   { pxPerDay: 35  },
  "3m":   { pxPerDay: 22  },
  "6m":   { pxPerDay: 14  },
  "1y":   { pxPerDay: 8   },
  "auto": { pxPerDay: 22  },
};

// Возвращает start (старт текущего периода — пн или 1-е число), а end — это
// конец таймлайна с большим запасом вперёд, чтобы скролл вправо никогда
// не «упирался». Зум определяет масштаб (pxPerDay) и стартовую точку,
// но не ограничивает будущее.
function calendarRangeForZoom(zoom: GanttZoom, today: Date): { start: Date; end: Date } {
  const y = today.getUTCFullYear();
  const m = today.getUTCMonth();
  if (zoom === "1w") {
    const dayIdx = (today.getUTCDay() + 6) % 7;
    const start = new Date(Date.UTC(y, m, today.getUTCDate() - dayIdx));
    // Запас на 12 недель вперёд от понедельника
    const end = new Date(Date.UTC(y, m, start.getUTCDate() + 12 * 7));
    return { start, end };
  }
  if (zoom === "1m") {
    return {
      start: new Date(Date.UTC(y, m, 1)),
      // Запас на 6 месяцев вперёд
      end: new Date(Date.UTC(y, m + 6, 1)),
    };
  }
  if (zoom === "3m") {
    return {
      start: new Date(Date.UTC(y, m, 1)),
      // Запас на 9 месяцев вперёд (видно текущие 3 + ещё 6 при скролле)
      end: new Date(Date.UTC(y, m + 9, 1)),
    };
  }
  if (zoom === "6m") {
    return {
      start: new Date(Date.UTC(y, m, 1)),
      // Запас на 18 месяцев
      end: new Date(Date.UTC(y, m + 18, 1)),
    };
  }
  if (zoom === "1y") {
    return {
      start: new Date(Date.UTC(y, 0, 1)),
      // Запас на 2 года
      end: new Date(Date.UTC(y + 2, 0, 1)),
    };
  }
  // auto
  return {
    start: new Date(Date.UTC(y, m, 1)),
    end: new Date(Date.UTC(y, m + 9, 1)),
  };
}

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
// JS getUTCDay: Вс=0, Пн=1, ..., Сб=6.
const DAYS_RU = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];

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
  const { pxPerDay } = ZOOM_OPTIONS[zoom];
  const today = parseISO(todayIso);
  const range = calendarRangeForZoom(zoom, today);
  const chartStart = toISO(range.start);
  // end эксклюзивный (день ПОСЛЕ последнего видимого), но шкала рисует до
  // последнего видимого включительно. dayDiff между ними = количество дней.
  const chartEnd = toISO(range.end);
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

  // Ширина timeline-области в пикселях. Контейнер скроллится по горизонтали,
  // если эта ширина больше viewport.
  const timelinePx = totalDays * pxPerDay;
  const totalPx = leftColWidth + timelinePx;

  const dens = DENSITY[density];

  const totalRows = groups.reduce((a, g) => a + g.rows.length, 0);

  // Опорные линии шкалы — адаптивные (день/неделя/месяц).
  // isStrong = понедельник или 1-е число (видна в шапке + жирная вертикальная линия)
  // isDay    = просто день (только тонкая бледная линия, без подписи; для зум 1м)
  // isWeekend = выходной (Сб/Вс) — фон зеброй
  const marks = useMemo(() => {
    const out: Array<{ iso: string; pct: number; label: string; isMonthStart: boolean; isStrong: boolean; isDay?: boolean; isWeekend?: boolean }> = [];
    const start = parseISO(chartStart);
    if (zoom === "1w") {
      // дни с подписью «Пн 5», «Вт 6» — чтобы понятно какой это день недели.
      const cur = new Date(start);
      while (cur <= parseISO(chartEnd)) {
        const iso = toISO(cur);
        const dow = cur.getUTCDay(); // 0=Вс, 6=Сб
        out.push({
          iso,
          pct: (dayDiff(chartStart, iso) / totalDays) * 100,
          label: `${DAYS_RU[dow]} ${cur.getUTCDate()}`,
          isMonthStart: cur.getUTCDate() === 1,
          isStrong: dow === 1,
          isWeekend: dow === 0 || dow === 6,
        });
        cur.setUTCDate(cur.getUTCDate() + 1);
      }
    } else if (zoom === "1m") {
      // 1m: и дни (тонкие линии, без подписей), и понедельники (жирные с датой).
      // Зебра выходных — отмечаем Сб/Вс через isWeekend.
      const cur = new Date(start);
      while (cur <= parseISO(chartEnd)) {
        const iso = toISO(cur);
        const dow = cur.getUTCDay();
        const isMon = dow === 1;
        out.push({
          iso,
          pct: (dayDiff(chartStart, iso) / totalDays) * 100,
          // Подписываем только понедельники, остальные дни — без надписи.
          // Формат «Пн 04.05» — день недели подтягивается к дате, как в зуме 1w.
          label: isMon ? `${DAYS_RU[dow]} ${formatDM(iso)}` : "",
          isMonthStart: cur.getUTCDate() <= 7 && isMon,
          isStrong: isMon,
          isDay: !isMon,
          isWeekend: dow === 0 || dow === 6,
        });
        cur.setUTCDate(cur.getUTCDate() + 1);
      }
    } else if (zoom === "3m") {
      // 3m: дни рисовать перебор (~6px/день → линии сливаются). Только понедельники.
      const cur = new Date(start);
      const offset = (cur.getUTCDay() + 6) % 7;
      cur.setUTCDate(cur.getUTCDate() - offset);
      while (cur <= parseISO(chartEnd)) {
        const iso = toISO(cur);
        if (iso >= chartStart) {
          const dow = cur.getUTCDay();
          out.push({
            iso,
            pct: (dayDiff(chartStart, iso) / totalDays) * 100,
            label: `${DAYS_RU[dow]} ${formatDM(iso)}`,
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

  // При заходе на страницу скроллим в начало — Алёна жаловалась, что при
  // авто-скролле к "сегодня" левая колонка с названиями заказов прячется
  // и не видно к чему относятся плашки. Лучше показать имена,
  // пользователь сам прокрутит вправо к "сегодня" при необходимости.
  const scrollRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollLeft = 0;
  }, [zoom]);

  // Горизонтальный скролл — через shift+wheel или жест по горизонтали тачпадом.
  // Вертикальный wheel мы НЕ перехватываем: иначе scroll внутри Ганта по вертикали
  // дёргается (конфликт между вертикальным скроллом строк и горизонтальным
  // скроллом таймлайна).

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
        <div ref={scrollRef} className="h-[calc(100vh-200px)] overflow-auto">
          <div style={{ width: `${totalPx}px`, minWidth: "100%" }}>
            {/* Шкала */}
            <div className="sticky top-0 z-20 grid border-b border-slate-200 bg-white" style={{ gridTemplateColumns: gridCols }}>
              <div className="relative px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                Заказ / Фасон
                {/* Drag-handle для ресайза левой колонки. Узкая полоска на правом
                    краю, hit-area через padding ~5px влево-вправо, чтобы было
                    легко попасть курсором. Полоса видна всегда (≈1px), на hover
                    ярче, как в Google Sheets / Notion. */}
                <ResizeHandle
                  current={leftColWidth}
                  min={LEFT_MIN}
                  max={LEFT_MAX}
                  onChange={setLeftColWidth}
                  onCommit={persistLeftColWidth}
                />
              </div>
              <div className="relative h-9">
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
                      style={{ left: `${m.pct}%` }}
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
                totalDays={totalDays}
                todayPct={todayPct}
                posPct={posPct}
                chartStart={chartStart}
                chartEnd={chartEnd}
                density={dens}
                showHeader={groups.length > 1 || groups[0]?.key !== "all"}
                gridCols={gridCols}
                onBarChange={onBarChange}
                pendingChanges={pendingChanges}
                zoom={zoom}
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
  group, marks, totalDays, todayPct, posPct, chartStart, chartEnd, density, showHeader, gridCols, onBarChange, pendingChanges, zoom,
}: {
  group: GanttGroupView;
  marks: Array<{ iso: string; pct: number; isStrong: boolean; isMonthStart?: boolean; isWeekend?: boolean }>;
  totalDays: number;
  todayPct: number;
  posPct: (iso: string) => number;
  chartStart: string;
  chartEnd: string;
  density: typeof DENSITY[GanttDensity];
  showHeader: boolean;
  gridCols: string;
  onBarChange: (orderId: string, endField: string, newDateIso: string, group: GanttGroup) => void;
  pendingChanges: Record<string, string>;
  zoom: GanttZoom;
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
          totalDays={totalDays}
          todayPct={todayPct}
          posPct={posPct}
          chartStart={chartStart}
          chartEnd={chartEnd}
          density={density}
          gridCols={gridCols}
          onBarChange={onBarChange}
          pendingChanges={pendingChanges}
          zoom={zoom}
        />
      ))}
    </div>
  );
}

function RowView({
  row, marks, totalDays, todayPct, posPct, chartStart, chartEnd, density, gridCols, onBarChange, pendingChanges, zoom,
}: {
  row: GanttRowV2;
  marks: Array<{ iso: string; pct: number; isStrong: boolean; isMonthStart?: boolean; isWeekend?: boolean }>;
  totalDays: number;
  todayPct: number;
  posPct: (iso: string) => number;
  chartStart: string;
  chartEnd: string;
  density: typeof DENSITY[GanttDensity];
  gridCols: string;
  onBarChange: (orderId: string, endField: string, newDateIso: string, group: GanttGroup) => void;
  pendingChanges: Record<string, string>;
  zoom: GanttZoom;
}) {
  return (
    <div className="grid border-b border-slate-100 hover:bg-slate-50/50" style={{ gridTemplateColumns: gridCols }}>
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
      </div>

      {/* Правая колонка — таймлайн */}
      <div
        className="relative"
        style={{ height: density.rowH }}
      >
        {/* Сетка:
            — дни (isDay): едва видимые тонкие линии (slate-50)
            — понедельники (isStrong & !isMonthStart): средние (slate-200)
            — 1-е числа месяца (isMonthStart): яркие (slate-400) */}
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
              style={{ left: `${m.pct}%` }}
            />
          );
        })}
        {/* Зебра выходных — только на зуме «1 нед», где видна разница «день недели».
            На месячном и трёхмесячном масштабе зебра превращалась в полосатый
            фон и мешала смотреть плашки (Алёна явно). */}
        {zoom === "1w" && marks.filter((m) => m.isWeekend).map((m) => {
          const widthPct = (1 / totalDays) * 100;
          return (
            <div
              key={"we" + m.iso}
              className="pointer-events-none absolute top-0 h-full bg-slate-100/40"
              style={{ left: `${m.pct}%`, width: `${widthPct}%` }}
            />
          );
        })}
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

  // Полностью вне видимого окна — не рендерим. Иначе клип к chartStart
  // прижимает 1.2%-сливер к левому краю, и фазы, давно закончившиеся в
  // прошлом, стопкой накладываются друг на друга (opacity-50 + opacity-50 +
  // ... = месиво из 4 цветов в одной точке у заказов «На складе Москва»).
  if (effEnd < chartStart) return null;
  if (effStart > chartEnd) return null;

  // Клип к видимому диапазону
  let s = effStart;
  let e = effEnd;
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
  // Обводки на плашках отключены по запросу Алёны — состояния и так читаются
  // по цвету плашки и opacity (done = 50%). Лишние ring'и создавали визуальный
  // шум, особенно у старых заказов с несвежими датами.
  const borderClass = "";

  // ПРОСРОЧЕНО/СКОРО ДЕДЛАЙН в тултипе не дублируем — для этого уже есть
  // цветная обводка плашки и иконка 🔥/⚠️ в шапке строки.
  const tooltip = `${bar.title} · ${formatDM(effStart)} → ${formatDM(effEnd)} · ${days} дн${
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
      borderClass={borderClass}
      done={bar.state === "done"}
      future={bar.state === "future"}
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
        // Safety-net: после сдвига end каждой следующей фазы не должен уехать
        // левее её start (= end предыдущей). Если уехал — подтягиваем end к
        // start, чтобы фаза не перевернулась поверх соседа.
        let prevEndIso = newEndIso;
        for (let j = barIndex + 1; j < allBars.length; j++) {
          const nb = allBars[j];
          if (!nb.orderId || !nb.endField) continue;
          const nbKey = `${rowGroup}:${nb.orderId}:${nb.endField}`;
          const nbCur = pendingChanges[nbKey] ?? nb.end;
          let shifted = toISO(addDays(parseISO(nbCur), deltaDays));
          if (shifted < prevEndIso) shifted = prevEndIso;
          onBarChange(nb.orderId, nb.endField, shifted, rowGroup);
          prevEndIso = shifted;
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
                let prevEndIso2 = newStartIso;
                for (let j = barIndex; j < allBars.length; j++) {
                  const nb = allBars[j];
                  if (!nb.orderId || !nb.endField) continue;
                  const nbKey = `${rowGroup}:${nb.orderId}:${nb.endField}`;
                  const nbCur = pendingChanges[nbKey] ?? nb.end;
                  let shifted = toISO(addDays(parseISO(nbCur), deltaDays));
                  if (shifted < prevEndIso2) shifted = prevEndIso2;
                  onBarChange(nb.orderId, nb.endField, shifted, rowGroup);
                  prevEndIso2 = shifted;
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
  left, width, top, height, barColor, stateClass, borderClass, done, future, tooltip,
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

  return (
    <div
      ref={ref}
      className={`group absolute rounded ${barColor} ${stateClass} ${borderClass} shadow-sm transition-all duration-300 ${flash ? "ring-2 ring-emerald-400 ring-offset-1" : ""}`}
      style={{ left: `${left}%`, width: `${width}%`, top, height }}
    >
      {/* Подсказка-тултип — единственный источник правды (родного title нет,
          чтобы браузер не показывал свой жёлтый тултип поверх кастомного). */}
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
      // На hover превью увеличивается в 4 раза и поднимается над соседями (z-50).
      // transform-origin: left bottom — превью раскрывается вниз-вправо, а не
      // перекрывает остальные thumb'ы стопки.
      <span
        className="group/thumb relative shrink-0 transition-transform duration-150 ease-out hover:z-50 hover:scale-[4]"
        style={{ zIndex: z, transformOrigin: "left bottom" }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={thumb.photoUrl}
          alt={thumb.colorName ?? ""}
          className="rounded-md border-2 border-white object-cover shadow-sm transition-shadow group-hover/thumb:shadow-2xl group-hover/thumb:ring-1 group-hover/thumb:ring-slate-300"
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

function ResizeHandle({
  current, min, max, onChange, onCommit,
}: {
  current: number;
  min: number;
  max: number;
  onChange: (w: number) => void;
  onCommit: (w: number) => void;
}) {
  const startRef = useRef<{ x: number; w: number } | null>(null);
  useEffect(() => {
    function onMove(e: MouseEvent) {
      if (!startRef.current) return;
      const next = Math.min(max, Math.max(min, startRef.current.w + (e.clientX - startRef.current.x)));
      onChange(next);
    }
    function onUp() {
      if (startRef.current) onCommit(current);
      startRef.current = null;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [current, min, max, onChange, onCommit]);

  return (
    <span
      role="separator"
      aria-orientation="vertical"
      title="Перетащите, чтобы изменить ширину колонки"
      onMouseDown={(e) => {
        e.preventDefault();
        startRef.current = { x: e.clientX, w: current };
        document.body.style.cursor = "col-resize";
        document.body.style.userSelect = "none";
      }}
      className="absolute -right-1 top-0 z-30 h-full w-2 cursor-col-resize select-none"
    >
      <span className="absolute right-1 top-0 h-full w-px bg-slate-200 transition-colors hover:bg-slate-500" />
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
// Мобильный список — нативный Гант для телефона
// ============================================================
// Десктопный Гант («чем заказ N занимается с 04.05 по 25.05») на 390px умирает:
// фазы сжимаются до 1-2px, временная ось теряет смысл. Поэтому на мобиле
// меняем смысл — показываем не «когда», а «где сейчас» каждый заказ.
//
// Карточка заказа:
//   1. Шапка: фото 44×44, название, цвета.
//   2. Фазовый бар — собственная шкала заказа (пропорции фаз ВНУТРИ заказа,
//      не глобальной шкалы). Любая фаза всегда видна, даже короткий ОТК.
//   3. Статус-строка: «🔥 ОТК просрочен на 3 дн» / «► Доставка · до 28.05 (1 дн)» /
//      «✓ Готово 25.04» — главный сигнал, читается мгновенно.
//   4. По тапу — <details> с полным списком фаз и кнопкой открыть заказ.
function MobileList({ groups, todayIso }: { groups: GanttGroupView[]; todayIso: string }) {
  const all = groups.flatMap((g) => g.rows);
  if (all.length === 0) {
    return <div className="p-6 text-center text-sm text-slate-400">Под фильтры ничего не подошло</div>;
  }
  return (
    <div className="space-y-2">
      {all.map((r) => (
        <MobilePhaseCard key={`${r.group}-${r.id}`} row={r} todayIso={todayIso} />
      ))}
    </div>
  );
}

function fmtDM(iso: string) {
  const [, m, d] = iso.split("-");
  return `${d}.${m}`;
}

function MobilePhaseCard({ row, todayIso }: { row: GanttRowV2; todayIso: string }) {
  if (row.bars.length === 0) {
    return (
      <Link href={row.href} className="block rounded-xl border border-slate-200 bg-white p-3 active:bg-slate-50">
        <div className="text-sm font-medium text-slate-900">{row.title}</div>
        <div className="text-[11px] text-slate-400">Нет фаз</div>
      </Link>
    );
  }

  const photoUrl = row.thumbnails?.find((t) => t.photoUrl)?.photoUrl ?? null;
  const rowStart = row.bars[0].start;
  const rowEnd = row.bars[row.bars.length - 1].end;

  // Сегменты бара — длительность фазы в днях. Минимум 1, чтобы 0-дневная фаза
  // (старт=конец, бывает у быстрых ОТК) всё равно занимала видимую долю.
  const segments = row.bars.map((b) => ({
    bar: b,
    days: Math.max(1, dayDiff(b.start, b.end)),
  }));
  const totalSegDays = segments.reduce((a, s) => a + s.days, 0);

  // «Сегодня» — позиция внутри окна [rowStart..rowEnd] по реальным дням
  // (не по выровненным сегментам, иначе маркер скачет).
  const totalRealDays = Math.max(1, dayDiff(rowStart, rowEnd));
  const daysFromStart = dayDiff(rowStart, todayIso);
  const todayPctReal = (daysFromStart / totalRealDays) * 100;
  const showToday = todayPctReal >= 0 && todayPctReal <= 100;

  // Активная фаза — приоритет: overdue → active → первая future → последняя done
  const overdueBar = row.bars.find((b) => b.overdue);
  const activeBar = row.bars.find((b) => b.state === "active");
  const firstFuture = row.bars.find((b) => b.state === "future");
  const lastDone = [...row.bars].reverse().find((b) => b.state === "done");
  const allDone = row.bars.every((b) => b.state === "done");

  // Статус-строка: главный сигнал карточки. Один из:
  //   - 🔥 ПРОСРОЧЕНО (красный)
  //   - ► Активная фаза + дней до её конца (амбер если nearly due, иначе обычный)
  //   - Старт следующей фазы (если все done в прошлом, но есть future)
  //   - ✓ Готово (всё done)
  let statusEl: React.ReactNode;
  if (overdueBar) {
    const daysOver = dayDiff(overdueBar.end, todayIso);
    statusEl = (
      <span className="font-semibold text-red-600">
        🔥 {overdueBar.title} просрочено на {daysOver} {pluralDays(daysOver)}
      </span>
    );
  } else if (activeBar) {
    const daysLeft = dayDiff(todayIso, activeBar.end);
    const urgent = activeBar.nearlyDue;
    statusEl = (
      <span className={urgent ? "font-semibold text-amber-600" : "text-slate-700"}>
        <span className="font-semibold">► {activeBar.title}</span>
        <span className="text-slate-500"> · до {fmtDM(activeBar.end)}</span>
        <span className={`ml-1 ${urgent ? "text-amber-600" : "text-slate-500"}`}>
          ({daysLeft >= 0 ? `${daysLeft} ${pluralDays(daysLeft)}` : `опоздание ${-daysLeft} ${pluralDays(-daysLeft)}`})
        </span>
      </span>
    );
  } else if (firstFuture) {
    statusEl = (
      <span className="text-slate-600">
        Старт «{firstFuture.title}» {fmtDM(firstFuture.start)}
      </span>
    );
  } else if (allDone && lastDone) {
    statusEl = (
      <span className="font-medium text-emerald-600">
        ✓ Готово {fmtDM(lastDone.end)}
      </span>
    );
  } else {
    statusEl = <span className="text-slate-500">{row.statusLabel}</span>;
  }

  return (
    <details className="group rounded-xl border border-slate-200 bg-white open:border-slate-300 open:shadow-sm">
      <summary className="list-none p-3 [&::-webkit-details-marker]:hidden">
        <div className="flex items-start gap-2.5">
          {photoUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={photoUrl} alt="" className="h-11 w-11 shrink-0 rounded-md object-cover" />
          ) : (
            <div className="h-11 w-11 shrink-0 rounded-md bg-slate-100" />
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-900">{row.title}</div>
              <svg
                className="mt-0.5 h-4 w-4 shrink-0 text-slate-400 transition-transform group-open:rotate-180"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </div>
            {row.subtitle && (
              <div className="truncate text-[11px] text-slate-500">{row.subtitle}</div>
            )}
          </div>
        </div>

        {/* Фазовый бар — собственная шкала заказа */}
        <div className="relative mt-3">
          <div className="flex h-2.5 overflow-hidden rounded-full bg-slate-100">
            {segments.map(({ bar, days }) => {
              const widthPct = (days / totalSegDays) * 100;
              const cls = bar.overdue ? "bg-red-500" : bar.color;
              const opacity =
                bar.state === "done" ? "opacity-40" : bar.state === "future" ? "opacity-20" : "";
              return (
                <div
                  key={bar.key}
                  className={`${cls} ${opacity}`}
                  style={{ width: `${widthPct}%` }}
                />
              );
            })}
          </div>
          {showToday && (
            <div
              className="absolute -top-0.5 -bottom-0.5 z-10 w-0.5 rounded-full bg-slate-900"
              style={{ left: `${todayPctReal}%` }}
              aria-label="Сегодня"
            />
          )}
        </div>

        {/* Подписи фаз — короткие, под сегментами. Активная фаза жирная.
            У слишком узких сегментов (<10% ширины) подпись прячем, иначе
            соседние сокращения наезжают друг на друга («ПРОИЗ О...»). */}
        <div className="mt-1 flex text-[10px] uppercase tracking-tight text-slate-400">
          {segments.map(({ bar, days }) => {
            const widthPct = (days / totalSegDays) * 100;
            const isActive = bar.state === "active";
            const isOverdue = bar.overdue;
            const showLabel = widthPct >= 10;
            return (
              <div
                key={bar.key}
                className={`truncate text-center ${
                  isOverdue ? "font-semibold text-red-600" : isActive ? "font-semibold text-slate-900" : ""
                }`}
                style={{ width: `${widthPct}%` }}
              >
                {showLabel ? phaseShortLabel(bar.title) : ""}
              </div>
            );
          })}
        </div>

        {/* Статус-строка — главный сигнал */}
        <div className="mt-2 text-[12px] leading-tight">{statusEl}</div>
      </summary>

      {/* Раскрытый блок — детальные фазы */}
      <div className="border-t border-slate-100 px-3 pb-3 pt-2.5">
        <div className="space-y-1.5">
          {row.bars.map((b) => {
            const days = dayDiff(b.start, b.end);
            const isDone = b.state === "done";
            const isActive = b.state === "active";
            const dotCls = b.overdue
              ? "bg-red-500"
              : isDone
                ? `${b.color} opacity-40`
                : isActive
                  ? b.color
                  : `${b.color} opacity-25`;
            return (
              <div key={b.key} className="flex items-center gap-2 text-[12px]">
                <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${dotCls}`} />
                <span
                  className={`flex-1 truncate ${
                    b.overdue
                      ? "font-semibold text-red-600"
                      : isActive
                        ? "font-semibold text-slate-900"
                        : isDone
                          ? "text-slate-500"
                          : "text-slate-700"
                  }`}
                >
                  {b.title}
                </span>
                <span className="shrink-0 tabular-nums text-slate-500">
                  {fmtDM(b.start)} → {fmtDM(b.end)}
                </span>
                <span className="w-9 shrink-0 text-right tabular-nums text-slate-400">{days}д</span>
              </div>
            );
          })}
        </div>
        <Link
          href={row.href}
          className="mt-3 flex w-full items-center justify-center rounded-lg bg-slate-900 px-3 py-2 text-[13px] font-medium text-white active:bg-slate-700"
        >
          Открыть карточку →
        </Link>
      </div>
    </details>
  );
}

function pluralDays(n: number): string {
  const abs = Math.abs(n) % 100;
  const last = abs % 10;
  if (abs >= 11 && abs <= 14) return "дн";
  if (last === 1) return "дн";
  if (last >= 2 && last <= 4) return "дн";
  return "дн";
}

// На мобильном баре подпись каждой фазы должна быть короткой — иначе при
// 4 сегментах на 390px подпись не помещается даже у длинных фаз. 3-4 буквы
// читаются и совпадают с легендой десктопа.
function phaseShortLabel(title: string): string {
  const t = title.toLowerCase();
  if (t.startsWith("разработ")) return "РАЗР";
  if (t.startsWith("производ")) return "ПРОИЗ";
  if (t.startsWith("отк")) return "ОТК";
  if (t.startsWith("достав")) return "ДОСТ";
  if (t.startsWith("упаков")) return "УПАК";
  if (t.startsWith("заказ")) return "ЗАК";
  // фолбэк — первые 4 буквы заглавными
  return title.slice(0, 4).toUpperCase();
}
