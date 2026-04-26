"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  orderedDate: string; // YYYY-MM-DD
  expectedDate: string; // YYYY-MM-DD or empty
  onChangeExpected: (value: string) => void;
};

const PRODUCTION_SHARE = 0.6; // 60% — производство, 40% — доставка

function toDate(s: string): Date | null {
  if (!s) return null;
  const [y, m, d] = s.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(Date.UTC(y, m - 1, d));
}

function fromDate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addDays(d: Date, days: number): Date {
  const out = new Date(d);
  out.setUTCDate(out.getUTCDate() + days);
  return out;
}

function formatRu(d: Date | null): string {
  if (!d) return "—";
  return d.toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function PackagingOrderTimeline({ orderedDate, expectedDate, onChangeExpected }: Props) {
  const start = toDate(orderedDate) ?? new Date();
  // Если дедлайн не задан — берём +30 дней от старта как ориентир.
  const end = toDate(expectedDate) ?? addDays(start, 30);

  const totalMs = Math.max(end.getTime() - start.getTime(), 1);
  const totalDays = Math.max(Math.round(totalMs / 86_400_000), 1);
  const productionEndMs = start.getTime() + totalMs * PRODUCTION_SHARE;
  const productionEnd = new Date(productionEndMs);

  const trackRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const [hoverDate, setHoverDate] = useState<Date | null>(null);

  // Drag-логика: тянем правый край (дедлайн).
  useEffect(() => {
    if (!dragging) return;

    function onMove(e: MouseEvent) {
      const track = trackRef.current;
      if (!track) return;
      const rect = track.getBoundingClientRect();
      const ratio = Math.min(Math.max((e.clientX - rect.left) / rect.width, 0.05), 1);
      // ratio считаем от длины «производство+доставка», т.е. от start.
      // Минимум: 5 дней от старта, максимум — 365.
      const newTotal = Math.round(ratio * Math.max(totalDays, 60));
      const clamped = Math.min(Math.max(newTotal, 5), 365);
      const newEnd = addDays(start, clamped);
      setHoverDate(newEnd);
    }

    function onUp() {
      if (hoverDate) onChangeExpected(fromDate(hoverDate));
      setDragging(false);
      setHoverDate(null);
    }

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [dragging, hoverDate, onChangeExpected, start, totalDays]);

  const productionPct = PRODUCTION_SHARE * 100;
  const deliveryPct = (1 - PRODUCTION_SHARE) * 100;

  const displayedEnd = hoverDate ?? end;
  const displayedProductionEnd = hoverDate
    ? new Date(start.getTime() + (hoverDate.getTime() - start.getTime()) * PRODUCTION_SHARE)
    : productionEnd;
  const displayedDays = Math.max(
    Math.round((displayedEnd.getTime() - start.getTime()) / 86_400_000),
    1,
  );

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs">
        <span className="text-slate-500">
          Старт: <span className="font-medium text-slate-700">{formatRu(start)}</span>
        </span>
        <span className="text-slate-500">
          Готовность: <span className="font-medium text-slate-700">{formatRu(displayedProductionEnd)}</span>
        </span>
        <span className="text-slate-500">
          Прибытие: <span className="font-medium text-slate-700">{formatRu(displayedEnd)}</span>
          <span className="ml-1 text-slate-400">({displayedDays} дн)</span>
        </span>
      </div>

      <div
        ref={trackRef}
        className="relative h-10 select-none rounded-lg bg-slate-100"
      >
        {/* Производство */}
        <div
          className="absolute inset-y-0 left-0 flex items-center rounded-l-lg bg-amber-200/80 pl-2 text-[11px] font-medium text-amber-900"
          style={{ width: `${productionPct}%` }}
          title="Производство"
        >
          🪡 Производство
        </div>
        {/* Доставка */}
        <div
          className="absolute inset-y-0 flex items-center bg-sky-200/80 pl-2 text-[11px] font-medium text-sky-900"
          style={{ left: `${productionPct}%`, width: `${deliveryPct}%` }}
          title="Доставка"
        >
          ✈ Доставка
        </div>
        {/* Маркер «сегодня» */}
        {(() => {
          const today = new Date();
          today.setUTCHours(0, 0, 0, 0);
          const fromStart = today.getTime() - start.getTime();
          const ratio = Math.max(0, Math.min(fromStart / Math.max(displayedEnd.getTime() - start.getTime(), 1), 1));
          if (ratio <= 0 || ratio >= 1) return null;
          return (
            <div
              className="absolute inset-y-0 w-px bg-red-500"
              style={{ left: `${ratio * 100}%` }}
              title="Сегодня"
            />
          );
        })()}
        {/* Ручка drag */}
        <button
          type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          className="absolute right-0 top-0 flex h-full w-3 cursor-ew-resize items-center justify-center rounded-r-lg bg-sky-700 text-[10px] text-white hover:bg-sky-800"
          title="Перетащите дедлайн"
        >
          ⋮
        </button>
      </div>

      {dragging && hoverDate && (
        <div className="text-center text-xs text-sky-700">
          Прибытие: <span className="font-semibold">{formatRu(hoverDate)}</span>
        </div>
      )}
    </div>
  );
}
