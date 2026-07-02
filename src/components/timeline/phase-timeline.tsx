"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { applyDrag, type TimelinePhase, type FieldChange } from "@/lib/timeline-math";

// ЕДИНЫЙ движок таймлайна фаз. Один и тот же код рисует и двигает плашки
// в форме заказа (4 фазы), форме упаковки (3 фазы) и — механикой — в Ганте.
//
// Принципы (по требованию Алёны, аудит 02.07):
//   • Пиксельная шкала (px/день), а не проценты — плашки одинаковой длительности
//     всегда одинаковой ширины, ничего не «плавает».
//   • Рейл ВСЕГДА покрывает min/max всех фаз + запас — клипа плашек НЕТ в принципе.
//   • Pointer events + setPointerCapture — мышь/палец/стилус работают одинаково.
//   • Вся мутация дат — ТОЛЬКО через applyDrag. Без клампов/подтяжек.

export type PhaseSpec = {
  key: string;
  title: string;
  icon: string;
  color: string;
  endField: string;
  startField?: string; // только у первой фазы
  startIso: string;
  endIso: string;
  done?: boolean; // завершённая фаза → opacity-50
};

export type TimelineZoom = "auto" | "1w" | "1m" | "3m";

function parseISO(iso: string): Date | null {
  if (!iso) return null;
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(Date.UTC(y, m - 1, d));
}

function toISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function formatDM(iso: string): string {
  const d = parseISO(iso);
  if (!d) return "—";
  return `${String(d.getUTCDate()).padStart(2, "0")}.${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function daysBetween(a: string, b: string): number {
  const da = parseISO(a);
  const db = parseISO(b);
  if (!da || !db) return 0;
  return Math.round((db.getTime() - da.getTime()) / 86400000);
}

function addDays(iso: string, days: number): string {
  const d = parseISO(iso);
  if (!d) return iso;
  d.setUTCDate(d.getUTCDate() + days);
  return toISO(d);
}

const MONTH_SHORT = ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];

export function PhaseTimeline({
  phases,
  onChange,
  legend = "Таймлайн",
  extraControls,
}: {
  phases: PhaseSpec[];
  // Отдаёт наружу изменения полей (field → newIso). Батчинг/автосейв — у вызывающего.
  onChange: (changes: FieldChange[]) => void;
  legend?: string;
  extraControls?: React.ReactNode;
}) {
  const railRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [dragInfo, setDragInfo] = useState<{ leftPx: number; label: string } | null>(null);
  const [zoom, setZoom] = useState<TimelineZoom>("auto");
  const [containerW, setContainerW] = useState(0);

  // Следим за шириной контейнера для авто-масштаба.
  useEffect(() => {
    const el = railRef.current;
    if (!el) return;
    const update = () => setContainerW(el.clientWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const todayIso = toISO(new Date());

  // Рейл покрывает ВСЕ края всех фаз + сегодня + запас. Обрезки плашек нет.
  const edges: string[] = [todayIso];
  for (const ph of phases) {
    edges.push(ph.startIso, ph.endIso);
  }
  const earliest = edges.reduce((a, b) => (daysBetween(a, b) < 0 ? b : a));
  const latest = edges.reduce((a, b) => (daysBetween(a, b) > 0 ? b : a));
  // Запас: 2 дня слева, 3 справа — чтобы крайние ручки не липли к краю рейла.
  const chartStart = addDays(earliest, -2);
  const chartEnd = addDays(latest, 3);
  const totalDays = Math.max(7, daysBetween(chartStart, chartEnd));

  // px/день = зум. Авто вписывает весь цикл в ширину контейнера.
  const autoDayWidth = containerW > 0 ? Math.max(4, Math.min(120, containerW / totalDays)) : 8;
  const dayWidth = zoom === "1w" ? 32 : zoom === "1m" ? 16 : zoom === "3m" ? 6 : autoDayWidth;
  const railWidthPx = totalDays * dayWidth;

  const posPx = useCallback(
    (iso: string): number => daysBetween(chartStart, iso) * dayWidth,
    [chartStart, dayWidth],
  );

  // Фазы для математики (стабильно от текущих props).
  const mathPhases: TimelinePhase[] = phases.map((p) => ({
    key: p.key,
    endField: p.endField,
    startField: p.startField,
    startIso: p.startIso,
    endIso: p.endIso,
  }));

  // ── Drag через pointer events + capture ──────────────────────────────────
  const dragRef = useRef<{
    phaseIndex: number;
    edge: "start" | "end";
    startX: number;
    origIso: string;
    pxPerDay: number;
    pointerId: number;
    target: Element;
  } | null>(null);
  const autoScrollRef = useRef<number | null>(null);

  const stopAutoScroll = () => {
    if (autoScrollRef.current != null) {
      cancelAnimationFrame(autoScrollRef.current);
      autoScrollRef.current = null;
    }
  };

  // Автоскролл: если курсор ближе 40px к краю скролл-контейнера — плавно скроллим.
  const maybeAutoScroll = useCallback((clientX: number) => {
    const el = scrollRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const EDGE = 40;
    const MAX_STEP = 12;
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
      if (!cont || !dragRef.current) {
        stopAutoScroll();
        return;
      }
      cont.scrollLeft += dir * MAX_STEP;
      autoScrollRef.current = requestAnimationFrame(tick);
    };
    autoScrollRef.current = requestAnimationFrame(tick);
  }, []);

  const onPointerDown = (e: React.PointerEvent, phaseIndex: number, edge: "start" | "end") => {
    e.preventDefault();
    e.stopPropagation();
    const ph = phases[phaseIndex];
    const origIso = edge === "start" ? ph.startIso : ph.endIso;
    const target = e.currentTarget as Element;
    target.setPointerCapture(e.pointerId);
    dragRef.current = {
      phaseIndex,
      edge,
      startX: e.clientX,
      origIso,
      pxPerDay: dayWidth,
      pointerId: e.pointerId,
      target,
    };
    setDragInfo({ leftPx: posPx(origIso), label: formatDM(origIso) });
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const s = dragRef.current;
    if (!s) return;
    const deltaDays = Math.round((e.clientX - s.startX) / s.pxPerDay);
    const newIso = addDays(s.origIso, deltaDays);
    setDragInfo({ leftPx: posPx(newIso), label: formatDM(newIso) });
    maybeAutoScroll(e.clientX);
    if (deltaDays === 0) return;
    const changes = applyDrag(mathPhases, { phaseIndex: s.phaseIndex, edge: s.edge, newIso });
    if (changes.length) onChange(changes);
  };

  const endDrag = (e: React.PointerEvent) => {
    const s = dragRef.current;
    if (s) {
      try { s.target.releasePointerCapture(s.pointerId); } catch { /* уже отпущен */ }
    }
    dragRef.current = null;
    setDragInfo(null);
    stopAutoScroll();
    e.stopPropagation();
  };

  useEffect(() => () => stopAutoScroll(), []);

  // ── Опорные линии шкалы (недели/месяцы) ──────────────────────────────────
  const ticks = useMemo(() => {
    const weekly: Array<{ iso: string; leftPx: number; label: string }> = [];
    const monthly: Array<{ iso: string; leftPx: number; label: string }> = [];
    const start = parseISO(chartStart);
    const end = parseISO(chartEnd);
    if (!start || !end) return { weekly, monthly };
    const cur = new Date(start);
    while (cur <= end) {
      const iso = toISO(cur);
      const leftPx = daysBetween(chartStart, iso) * dayWidth;
      if (cur.getUTCDay() === 1) weekly.push({ iso, leftPx, label: String(cur.getUTCDate()) });
      if (cur.getUTCDate() === 1) {
        monthly.push({ iso, leftPx, label: `${MONTH_SHORT[cur.getUTCMonth()]} ${String(cur.getUTCFullYear()).slice(2)}` });
      }
      cur.setUTCDate(cur.getUTCDate() + 1);
    }
    return { weekly, monthly };
  }, [chartStart, chartEnd, dayWidth]);

  const todayLeftPx = posPx(todayIso);
  const todayInRange = todayLeftPx >= 0 && todayLeftPx <= railWidthPx;

  return (
    <fieldset className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <legend className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          {legend}
        </legend>
        <div className="flex items-center gap-2">
          {extraControls}
          <ZoomSwitch zoom={zoom} setZoom={setZoom} />
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 select-none">
        <div className="overflow-x-auto" ref={scrollRef}>
          <div style={{ width: railWidthPx, minWidth: "100%" }} ref={railRef}>
            {/* Шапка — месяцы и недели */}
            <div className="relative mb-2 h-10">
              <div className="absolute inset-x-0 top-0 h-4">
                {ticks.monthly.map((m) => (
                  <div key={"m" + m.iso} className="absolute -translate-x-1/2 text-[11px] font-semibold text-slate-700" style={{ left: m.leftPx }}>
                    {m.label}
                  </div>
                ))}
              </div>
              <div className="absolute inset-x-0 top-4 h-4">
                {ticks.weekly.map((w) => (
                  <div key={"w" + w.iso} className="absolute -translate-x-1/2 text-[10px] text-slate-400" style={{ left: w.leftPx }}>
                    {w.label}
                  </div>
                ))}
              </div>
              <div className="absolute inset-x-0 bottom-0 h-px bg-slate-300" />
            </div>

            {/* Полотно с плашками */}
            <div className="relative">
              {dragInfo && (
                <div
                  className="pointer-events-none absolute -top-7 z-30 -translate-x-1/2 whitespace-nowrap rounded-md bg-emerald-600 px-2 py-1 text-xs font-bold text-white shadow-lg"
                  style={{ left: dragInfo.leftPx }}
                >
                  {dragInfo.label}
                </div>
              )}
              {/* Сетка */}
              <div className="pointer-events-none absolute inset-0">
                {ticks.weekly.map((w) => (
                  <div key={"g" + w.iso} className="absolute top-0 bottom-0 border-l border-slate-300/80" style={{ left: w.leftPx }} />
                ))}
                {ticks.monthly.map((m) => (
                  <div key={"gm" + m.iso} className="absolute top-0 bottom-0 border-l border-slate-400/60" style={{ left: m.leftPx }} />
                ))}
              </div>

              {todayInRange && (
                <div className="pointer-events-none absolute top-0 bottom-0 z-10 border-l-2 border-red-400" style={{ left: todayLeftPx }}>
                  <div className="absolute -top-2 left-1 rounded bg-red-500 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-white">
                    сегодня
                  </div>
                </div>
              )}

              <div className="space-y-1">
                {phases.map((ph, idx) => {
                  const leftPx = posPx(ph.startIso);
                  const rawWidthPx = posPx(ph.endIso) - leftPx;
                  const MIN_BAR = 26;
                  const widthPx = Math.max(MIN_BAR, rawWidthPx);
                  const days = daysBetween(ph.startIso, ph.endIso);
                  const isVeryNarrow = widthPx <= 80;
                  const isNarrow = widthPx <= 140;
                  // Левая ручка есть у всех: у первой фазы — startField, у остальных — end предыдущей.
                  const hasStartHandle = idx === 0 ? !!ph.startField : true;
                  return (
                    <div key={ph.key} className="relative h-9">
                      <div
                        className={`group absolute top-2 flex h-6 items-center rounded text-white shadow-sm transition-shadow hover:shadow-md ${ph.done ? "opacity-50" : ""}`}
                        style={{ left: leftPx, width: widthPx, backgroundColor: ph.color }}
                      >
                        <div className="flex h-full w-full items-center justify-center gap-1.5 overflow-hidden px-2 text-[11px] font-medium whitespace-nowrap">
                          <span>{ph.icon}</span>
                          {!isVeryNarrow && <span>{ph.title}</span>}
                          {!isNarrow && <span className="opacity-80">· {days} дн</span>}
                        </div>

                        {/* Тёмный кастомный тултип под плашкой */}
                        <div className="pointer-events-none absolute left-1/2 top-full z-30 mt-1 hidden -translate-x-1/2 whitespace-nowrap rounded-md bg-slate-900 px-2 py-1 text-[11px] text-white shadow-lg group-hover:block">
                          {ph.title} · {formatDM(ph.startIso)} → {formatDM(ph.endIso)} · {days} дн
                        </div>

                        {/* Левая ручка ◀ — hit-area ≥44px (невидимый padding), видимая полоска 3px. */}
                        {hasStartHandle && (
                          <span
                            onPointerDown={(e) => onPointerDown(e, idx, "start")}
                            onPointerMove={onPointerMove}
                            onPointerUp={endDrag}
                            onPointerCancel={endDrag}
                            title={idx === 0
                              ? "Потянуть — сдвинуть старт (хвост стоит)"
                              : "Потянуть — изменить начало фазы"}
                            className="absolute left-0 top-1/2 z-20 flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize touch-none items-center justify-center opacity-0 transition-opacity duration-150 group-hover:opacity-100 hover:!opacity-100"
                          >
                            <span className="pointer-events-none h-[80%] w-[3px] rounded-full bg-white shadow-[0_0_0_1px_rgba(15,23,42,0.35)]" />
                          </span>
                        )}

                        {/* Правая ручка ▶ */}
                        <span
                          onPointerDown={(e) => onPointerDown(e, idx, "end")}
                          onPointerMove={onPointerMove}
                          onPointerUp={endDrag}
                          onPointerCancel={endDrag}
                          title="Потянуть — изменить конец фазы"
                          className="absolute right-0 top-1/2 z-20 flex h-11 w-11 translate-x-1/2 -translate-y-1/2 cursor-ew-resize touch-none items-center justify-center opacity-0 transition-opacity duration-150 group-hover:opacity-100 hover:!opacity-100"
                        >
                          <span className="pointer-events-none h-[80%] w-[3px] rounded-full bg-white shadow-[0_0_0_1px_rgba(15,23,42,0.35)]" />
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>

      <p className="text-xs text-slate-500">
        Наведи на фазу → потяни за левый или правый край. Соседние фазы поедут за ней с теми же длительностями.
        Зум — справа сверху; шкала прокручивается, если цикл длинный.
      </p>
    </fieldset>
  );
}

function ZoomSwitch({
  zoom,
  setZoom,
}: {
  zoom: TimelineZoom;
  setZoom: (z: TimelineZoom) => void;
}) {
  const opts: Array<{ k: TimelineZoom; label: string }> = [
    { k: "1w", label: "1 нед" },
    { k: "1m", label: "1 мес" },
    { k: "3m", label: "3 мес" },
    { k: "auto", label: "Авто" },
  ];
  return (
    <div className="flex gap-0.5 rounded-lg bg-slate-100 p-0.5 text-xs">
      {opts.map((o) => (
        <button
          key={o.k}
          type="button"
          onClick={() => setZoom(o.k)}
          className={`rounded-md px-2 py-1 font-medium ${
            zoom === o.k ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
