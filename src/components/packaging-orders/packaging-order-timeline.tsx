"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { DELIVERY_DURATION_DAYS } from "@/lib/constants";
import type { DeliveryMethod } from "@prisma/client";

type Timeline = {
  productionEndDate: string;
  expectedDate: string;
};

type PhaseKey = "production" | "delivery";

type Phase = {
  key: PhaseKey;
  title: string;
  icon: string;
  color: string;
};

// Цвета синхронизированы с /gantt-v2: Производство — blue-500, Доставка — emerald-500.
const PHASES: Phase[] = [
  { key: "production", title: "Производство", icon: "🪡", color: "#3b82f6" },
  { key: "delivery",   title: "Доставка",     icon: "✈",  color: "#10b981" },
];

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

function calcDefaults(deliveryMethod?: DeliveryMethod | null): Timeline {
  const today = toISO(new Date());
  const deliveryDays = deliveryMethod ? DELIVERY_DURATION_DAYS[deliveryMethod] : 30;
  const productionEndDate = addDays(today, 30);
  const expectedDate = addDays(productionEndDate, deliveryDays);
  return { productionEndDate, expectedDate };
}

export function PackagingOrderTimeline({
  initial,
  onChange,
  deliveryMethod,
}: {
  initial: Timeline;
  onChange: (t: Timeline) => void;
  deliveryMethod?: DeliveryMethod | null;
}) {
  const hasSavedDates = !!(initial.productionEndDate || initial.expectedDate);
  const [productionStart, setProductionStart] = useState(() => toISO(new Date()));
  const railRef = useRef<HTMLDivElement>(null);
  const [dragInfo, setDragInfo] = useState<{ leftPx: number; label: string } | null>(null);
  const [zoom, setZoom] = useState<"auto" | "1w" | "1m" | "3m">("auto");

  // If no dates saved yet, initialize from defaults
  const value: Timeline = hasSavedDates
    ? initial
    : calcDefaults(deliveryMethod);

  function getStartIso(ph: Phase): string {
    if (ph.key === "production") return productionStart;
    return value.productionEndDate || productionStart;
  }

  function getEndIso(ph: Phase): string {
    if (ph.key === "production") return value.productionEndDate || productionStart;
    return value.expectedDate || productionStart;
  }

  // Шкала охватывает ВСЕ start/end фаз + сегодня. Иначе фаза, чей конец
  // выходит за value.expectedDate, обрежется posPct'ом — и две фазы
  // одинаковой длительности отрисуются с разной шириной.
  const todayIsoForChart = toISO(new Date());
  const phaseEdges: string[] = [productionStart];
  for (const ph of PHASES) {
    phaseEdges.push(getStartIso(ph));
    phaseEdges.push(getEndIso(ph));
  }
  // daysBetween(a, b) = b − a: <0 ⇔ b раньше a, >0 ⇔ b позже a.
  // Берём min для earliest, max для latest.
  const earliestPhase = phaseEdges.reduce((a, b) => (daysBetween(a, b) < 0 ? b : a));
  const latestPhase = phaseEdges.reduce((a, b) => (daysBetween(a, b) > 0 ? b : a));

  const chartStartRaw = daysBetween(earliestPhase, todayIsoForChart) < 0
    ? todayIsoForChart
    : earliestPhase;
  const latestWithToday = daysBetween(latestPhase, todayIsoForChart) > 0
    ? todayIsoForChart
    : latestPhase;
  const chartEnd = addDays(latestWithToday || addDays(chartStartRaw, 60), 3);
  const chartStart = chartStartRaw;
  const totalDays = Math.max(7, daysBetween(chartStart, chartEnd));

  // Pixel-scale (см. order-timeline): зум = px/день, шкала прокручивается.
  const dayWidth = zoom === "1w" ? 32 : zoom === "1m" ? 16 : zoom === "3m" ? 6 : 8;
  const railWidthPx = totalDays * dayWidth;
  function posPx(iso: string): number {
    return daysBetween(chartStart, iso) * dayWidth;
  }

  type DragState = {
    phase: Phase;
    mode: "move" | "resize-left" | "resize-right";
    startX: number;
    origStart: string;
    origEnd: string;
    origProductionStart: string;
    origProductionEnd: string;
    origExpectedDate: string;
    pxPerDay: number;
  };
  const dragRef = useRef<DragState | null>(null);

  const commitChange = useCallback((next: Timeline) => {
    onChange(next);
  }, [onChange]);

  const onPointerDown = (e: React.PointerEvent, phase: Phase, mode: DragState["mode"]) => {
    e.preventDefault();
    dragRef.current = {
      phase,
      mode,
      startX: e.clientX,
      origStart: getStartIso(phase),
      origEnd: getEndIso(phase),
      origProductionStart: productionStart,
      origProductionEnd: value.productionEndDate,
      origExpectedDate: value.expectedDate,
      pxPerDay: dayWidth,
    };

    function handleMove(ev: PointerEvent) {
      const s = dragRef.current;
      if (!s) return;
      const deltaDays = Math.round((ev.clientX - s.startX) / s.pxPerDay);
      if (deltaDays === 0) return;

      // Никаких clamp'ов — Алёна должна тащить даты куда угодно, в т.ч. в прошлое.
      // Длительность Доставки = expectedDate - productionEndDate (для каскада).
      const deliveryDuration = daysBetween(s.origProductionEnd, s.origExpectedDate);

      if (s.phase.key === "production") {
        if (s.mode === "resize-left") {
          // Drag ◀ Производства (первая плашка) = меняем стартовую дату.
          // Все фазы сдвигаются на ту же дельту — длительности сохраняются.
          const newStart = addDays(s.origProductionStart, deltaDays);
          const newProdEnd = addDays(s.origProductionEnd, deltaDays);
          const newExpected = addDays(s.origExpectedDate, deltaDays);
          setProductionStart(newStart);
          commitChange({ productionEndDate: newProdEnd, expectedDate: newExpected });
          setDragInfo({ leftPx: posPx(newStart), label: formatDM(newStart) });
          return;
        }
        if (s.mode === "resize-right") {
          // Drag ▶ Производства = меняем длительность Производства.
          // Доставка сдвигается на ту же дельту, её длительность сохраняется.
          const newEnd = addDays(s.origEnd, deltaDays);
          const newExpected = addDays(s.origExpectedDate, deltaDays);
          commitChange({ productionEndDate: newEnd, expectedDate: newExpected });
          setDragInfo({ leftPx: posPx(newEnd), label: formatDM(newEnd) });
          return;
        }
        // move (drag за середину) — оставлен dead, не вызывается из UI.
        return;
      } else {
        // delivery phase
        if (s.mode === "resize-left") {
          // Drag ◀ Доставки = drag ▶ Производства: меняем длительность
          // Производства. Доставка едет на дельту, её длительность сохраняется.
          const newProdEnd = addDays(s.origProductionEnd, deltaDays);
          const newExpected = addDays(newProdEnd, deliveryDuration);
          commitChange({ productionEndDate: newProdEnd, expectedDate: newExpected });
          setDragInfo({ leftPx: posPx(newProdEnd), label: formatDM(newProdEnd) });
          return;
        }
        if (s.mode === "resize-right") {
          // Drag ▶ Доставки = меняем длительность Доставки. Никого после неё.
          const newExpected = addDays(s.origExpectedDate, deltaDays);
          commitChange({ productionEndDate: s.origProductionEnd, expectedDate: newExpected });
          setDragInfo({ leftPx: posPx(newExpected), label: formatDM(newExpected) });
          return;
        }
        return;
      }
    }

    function handleUp() {
      dragRef.current = null;
      setDragInfo(null);
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      window.removeEventListener("pointercancel", handleUp);
    }

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    window.addEventListener("pointercancel", handleUp);
  };

  const ticks = useMemo(() => {
    const weekly: Array<{ iso: string; leftPx: number; label: string }> = [];
    const monthly: Array<{ iso: string; leftPx: number; label: string }> = [];
    const start = parseISO(chartStart);
    if (!start) return { weekly, monthly };
    const cur = new Date(start);
    const end = parseISO(chartEnd) ?? cur;
    while (cur <= end) {
      const iso = toISO(cur);
      const leftPx = posPx(iso);
      if (cur.getUTCDay() === 1) {
        weekly.push({ iso, leftPx, label: String(cur.getUTCDate()) });
      }
      if (cur.getUTCDate() === 1) {
        monthly.push({ iso, leftPx, label: `${MONTH_SHORT[cur.getUTCMonth()]} ${String(cur.getUTCFullYear()).slice(2)}` });
      }
      cur.setUTCDate(cur.getUTCDate() + 1);
    }
    return { weekly, monthly };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chartStart, chartEnd, dayWidth]);

  const todayIso = toISO(new Date());
  const todayLeftPx = posPx(todayIso);
  const todayInRange = todayLeftPx >= 0 && todayLeftPx <= railWidthPx;

  return (
    <fieldset className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <legend className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Таймлайн заказа упаковки
        </legend>
        <ZoomSwitch zoom={zoom} setZoom={setZoom} />
      </div>

      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 select-none">
        <div className="overflow-x-auto" ref={railRef}>
          <div style={{ width: railWidthPx, minWidth: "100%" }}>
            {/* Шапка шкалы */}
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

            <div className="relative">
              {dragInfo && (
                <div className="pointer-events-none absolute -top-7 z-30 -translate-x-1/2 whitespace-nowrap rounded-md bg-emerald-600 px-2 py-1 text-xs font-bold text-white shadow-lg" style={{ left: dragInfo.leftPx }}>
                  {dragInfo.label}
                </div>
              )}
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
                {PHASES.map((ph) => {
                  const startIso = getStartIso(ph);
                  const endIso = getEndIso(ph);
                  const leftPx = posPx(startIso);
                  const widthPx = Math.max(64, posPx(endIso) - leftPx) - 4;
                  const days = daysBetween(startIso, endIso);
                  return (
                    <div key={ph.key} className="relative h-9">
                      <div className="group absolute top-2 flex h-6 items-center rounded text-white shadow-sm transition-shadow hover:shadow-md" style={{ left: leftPx, width: widthPx, backgroundColor: ph.color }}>
                        <div className="flex h-full w-full items-center gap-1.5 overflow-hidden px-3 text-[11px] font-medium whitespace-nowrap">
                          <span>{ph.icon}</span>
                          <span>{ph.title}</span>
                          <span className="opacity-80">· {days} дн</span>
                        </div>
                        <div className="pointer-events-none absolute left-1/2 top-full z-30 mt-1 hidden -translate-x-1/2 whitespace-nowrap rounded-md bg-slate-900 px-2 py-1 text-[11px] text-white shadow-lg group-hover:block">
                          {ph.title} · {formatDM(startIso)} → {formatDM(endIso)} · {days} дн
                        </div>
                        <span
                          onPointerDown={(e) => { e.stopPropagation(); onPointerDown(e, ph, "resize-left"); }}
                          title="Потянуть — изменить начало фазы"
                          className="absolute left-0 top-0 z-20 h-full w-2.5 -translate-x-1/2 cursor-ew-resize opacity-0 transition-opacity duration-150 group-hover:opacity-100 hover:!opacity-100"
                        >
                          <span className="pointer-events-none absolute left-1/2 top-1/2 h-[80%] w-[3px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-[0_0_0_1px_rgba(15,23,42,0.35)] transition-all hover:w-[5px] hover:bg-slate-900 hover:shadow-[0_0_0_1px_white]" />
                        </span>
                        <span
                          onPointerDown={(e) => { e.stopPropagation(); onPointerDown(e, ph, "resize-right"); }}
                          title="Потянуть — изменить конец фазы"
                          className="absolute right-0 top-0 z-20 h-full w-2.5 translate-x-1/2 cursor-ew-resize opacity-0 transition-opacity duration-150 group-hover:opacity-100 hover:!opacity-100"
                        >
                          <span className="pointer-events-none absolute left-1/2 top-1/2 h-[80%] w-[3px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-[0_0_0_1px_rgba(15,23,42,0.35)] transition-all hover:w-[5px] hover:bg-slate-900 hover:shadow-[0_0_0_1px_white]" />
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
        Наведи на фазу → потяни за левый или правый край. Шкала прокручивается, если цикл длинный.
      </p>
    </fieldset>
  );
}

function ZoomSwitch({
  zoom,
  setZoom,
}: {
  zoom: "auto" | "1w" | "1m" | "3m";
  setZoom: (z: "auto" | "1w" | "1m" | "3m") => void;
}) {
  const opts: Array<{ k: "auto" | "1w" | "1m" | "3m"; label: string }> = [
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
