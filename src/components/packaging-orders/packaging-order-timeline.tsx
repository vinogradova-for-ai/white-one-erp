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

const PHASES: Phase[] = [
  { key: "production", title: "Производство", icon: "🪡", color: "#3b82f6" },
  { key: "delivery",   title: "Доставка",     icon: "✈",  color: "#6366f1" },
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
  const [dragInfo, setDragInfo] = useState<{ left: number; label: string } | null>(null);

  // If no dates saved yet, initialize from defaults
  const value: Timeline = hasSavedDates
    ? initial
    : calcDefaults(deliveryMethod);

  const chartStart = productionStart;
  const chartEnd = value.expectedDate || addDays(chartStart, 60);
  const totalDays = Math.max(1, daysBetween(chartStart, chartEnd));

  function posPct(iso: string): number {
    const d = daysBetween(chartStart, iso);
    return Math.max(0, Math.min(100, (d / totalDays) * 100));
  }

  function getStartIso(ph: Phase): string {
    if (ph.key === "production") return productionStart;
    return value.productionEndDate || productionStart;
  }

  function getEndIso(ph: Phase): string {
    if (ph.key === "production") return value.productionEndDate || productionStart;
    return value.expectedDate || productionStart;
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
    if (!railRef.current) return;
    e.preventDefault();
    const rect = railRef.current.getBoundingClientRect();
    dragRef.current = {
      phase,
      mode,
      startX: e.clientX,
      origStart: getStartIso(phase),
      origEnd: getEndIso(phase),
      origProductionStart: productionStart,
      origProductionEnd: value.productionEndDate,
      origExpectedDate: value.expectedDate,
      pxPerDay: rect.width / totalDays,
    };

    function handleMove(ev: PointerEvent) {
      const s = dragRef.current;
      if (!s) return;
      const deltaDays = Math.round((ev.clientX - s.startX) / s.pxPerDay);
      if (deltaDays === 0) return;

      if (s.phase.key === "production") {
        if (s.mode === "resize-left") {
          const newStart = addDays(s.origProductionStart, deltaDays);
          if (daysBetween(newStart, s.origEnd) < 1) return;
          setProductionStart(newStart);
          setDragInfo({ left: posPct(newStart), label: formatDM(newStart) });
          return;
        }
        if (s.mode === "resize-right") {
          const newEnd = addDays(s.origEnd, deltaDays);
          if (daysBetween(s.origStart, newEnd) < 1) return;
          if (daysBetween(newEnd, s.origExpectedDate) < 0) return;
          commitChange({ productionEndDate: newEnd, expectedDate: s.origExpectedDate });
          setDragInfo({ left: posPct(newEnd), label: formatDM(newEnd) });
          return;
        }
        // move — shift both production start and production end
        const newStart = addDays(s.origProductionStart, deltaDays);
        const newEnd = addDays(s.origEnd, deltaDays);
        if (daysBetween(newEnd, s.origExpectedDate) < 0) return;
        setProductionStart(newStart);
        commitChange({ productionEndDate: newEnd, expectedDate: s.origExpectedDate });
        setDragInfo({ left: posPct(newEnd), label: `${formatDM(newStart)} → ${formatDM(newEnd)}` });
      } else {
        // delivery phase
        if (s.mode === "resize-left") {
          const newProdEnd = addDays(s.origProductionEnd, deltaDays);
          if (daysBetween(s.origProductionStart, newProdEnd) < 1) return;
          if (daysBetween(newProdEnd, s.origExpectedDate) < 0) return;
          commitChange({ productionEndDate: newProdEnd, expectedDate: s.origExpectedDate });
          setDragInfo({ left: posPct(newProdEnd), label: formatDM(newProdEnd) });
          return;
        }
        if (s.mode === "resize-right") {
          const newExpected = addDays(s.origExpectedDate, deltaDays);
          if (daysBetween(s.origProductionEnd, newExpected) < 0) return;
          commitChange({ productionEndDate: s.origProductionEnd, expectedDate: newExpected });
          setDragInfo({ left: posPct(newExpected), label: formatDM(newExpected) });
          return;
        }
        // move delivery — shift both ends
        const newProdEnd = addDays(s.origProductionEnd, deltaDays);
        const newExpected = addDays(s.origExpectedDate, deltaDays);
        if (daysBetween(s.origProductionStart, newProdEnd) < 1) return;
        commitChange({ productionEndDate: newProdEnd, expectedDate: newExpected });
        setDragInfo({ left: posPct(newExpected), label: `${formatDM(newProdEnd)} → ${formatDM(newExpected)}` });
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
    const weekly: Array<{ iso: string; pct: number; label: string }> = [];
    const monthly: Array<{ iso: string; pct: number; label: string }> = [];
    const start = parseISO(chartStart);
    if (!start) return { weekly, monthly };
    const cur = new Date(start);
    const end = parseISO(chartEnd) ?? cur;
    while (cur <= end) {
      const iso = toISO(cur);
      const pct = posPct(iso);
      if (cur.getUTCDay() === 1) {
        weekly.push({ iso, pct, label: String(cur.getUTCDate()) });
      }
      if (cur.getUTCDate() === 1) {
        monthly.push({ iso, pct, label: `${MONTH_SHORT[cur.getUTCMonth()]} ${String(cur.getUTCFullYear()).slice(2)}` });
      }
      cur.setUTCDate(cur.getUTCDate() + 1);
    }
    return { weekly, monthly };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chartStart, chartEnd, totalDays]);

  const todayIso = toISO(new Date());
  const todayPct = posPct(todayIso);

  return (
    <fieldset className="space-y-3">
      <legend className="text-sm font-semibold uppercase tracking-wide text-slate-500">
        Таймлайн заказа упаковки
      </legend>

      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 select-none">
        {/* Scale header */}
        <div className="relative mb-2 h-10" ref={railRef}>
          <div className="absolute inset-x-0 top-0 h-4">
            {ticks.monthly.map((m) => (
              <div
                key={"m" + m.iso}
                className="absolute -translate-x-1/2 text-[11px] font-semibold text-slate-700"
                style={{ left: `${m.pct}%` }}
              >
                {m.label}
              </div>
            ))}
          </div>
          <div className="absolute inset-x-0 top-4 h-4">
            {ticks.weekly.map((w) => (
              <div
                key={"w" + w.iso}
                className="absolute -translate-x-1/2 text-[10px] text-slate-400"
                style={{ left: `${w.pct}%` }}
              >
                {w.label}
              </div>
            ))}
          </div>
          <div className="absolute inset-x-0 bottom-0 h-px bg-slate-300" />
        </div>

        {/* Bars area */}
        <div className="relative">
          {dragInfo && (
            <div
              className="pointer-events-none absolute -top-7 z-30 -translate-x-1/2 whitespace-nowrap rounded-md bg-emerald-600 px-2 py-1 text-xs font-bold text-white shadow-lg"
              style={{ left: `${dragInfo.left}%` }}
            >
              {dragInfo.label}
            </div>
          )}

          {/* Grid overlay */}
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              backgroundImage: `linear-gradient(to right, rgba(148, 163, 184, 0.18) 1px, transparent 1px)`,
              backgroundSize: `${100 / totalDays}% 100%`,
            }}
          >
            {ticks.weekly.map((w) => (
              <div key={"g" + w.iso} className="absolute top-0 bottom-0 border-l border-slate-300/80" style={{ left: `${w.pct}%` }} />
            ))}
            {ticks.monthly.map((m) => (
              <div key={"gm" + m.iso} className="absolute top-0 bottom-0 border-l border-slate-400/60" style={{ left: `${m.pct}%` }} />
            ))}
          </div>

          {/* Today marker */}
          {todayPct > 0 && todayPct < 100 && (
            <div
              className="pointer-events-none absolute top-0 bottom-0 z-10 border-l-2 border-red-400"
              style={{ left: `${todayPct}%` }}
            >
              <div className="absolute -top-2 left-1 rounded bg-red-500 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-white">
                сегодня
              </div>
            </div>
          )}

          {/* Phase bars */}
          <div className="space-y-1">
            {PHASES.map((ph) => {
              const startIso = getStartIso(ph);
              const endIso = getEndIso(ph);
              const left = posPct(startIso);
              const width = Math.max(0.5, posPct(endIso) - left);
              const days = daysBetween(startIso, endIso);
              return (
                <div key={ph.key} className="relative h-9">
                  <div
                    onPointerDown={(e) => onPointerDown(e, ph, "move")}
                    className="absolute top-1 flex h-7 cursor-grab items-center rounded-md text-white shadow-sm active:cursor-grabbing"
                    style={{ left: `${left}%`, width: `${width}%`, backgroundColor: ph.color }}
                    title={`${ph.title}: ${formatDM(startIso)} → ${formatDM(endIso)} (${days} дн). Тащите, чтобы сдвинуть.`}
                  >
                    <div
                      onPointerDown={(e) => { e.stopPropagation(); onPointerDown(e, ph, "resize-left"); }}
                      className="absolute -left-0.5 top-0 bottom-0 w-2 cursor-ew-resize rounded-l-md hover:bg-white/30"
                    />

                    <div className="flex h-full w-full items-center gap-1.5 overflow-hidden px-2 text-[11px] font-medium whitespace-nowrap">
                      <span>{ph.icon}</span>
                      <span>{ph.title}</span>
                      <span className="opacity-80">· {days} дн</span>
                    </div>

                    <div className="pointer-events-none absolute -top-5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-slate-900/90 px-1.5 py-0.5 text-[10px] font-semibold text-white shadow-sm">
                      {formatDM(startIso)} → {formatDM(endIso)} · {days} дн
                    </div>

                    <div
                      onPointerDown={(e) => { e.stopPropagation(); onPointerDown(e, ph, "resize-right"); }}
                      className="absolute -right-0.5 top-0 bottom-0 w-2 cursor-ew-resize rounded-r-md hover:bg-white/30"
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <p className="text-xs text-slate-500">
        Тащите полосу, чтобы сдвинуть фазу, или за края — чтобы поменять старт/дедлайн.
      </p>
    </fieldset>
  );
}
