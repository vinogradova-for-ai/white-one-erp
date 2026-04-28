"use client";

import { useEffect, useRef, useState } from "react";
import { DELIVERY_DURATION_DAYS } from "@/lib/constants";
import type { DeliveryMethod } from "@prisma/client";

type Props = {
  orderedDate: string; // YYYY-MM-DD
  expectedDate: string; // YYYY-MM-DD or empty
  onChangeExpected: (value: string) => void;
  deliveryMethod?: DeliveryMethod | "" | null;
};

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
  return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
}

function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

/**
 * Таймлайн заказа упаковки: две независимые фазы — Производство и Доставка.
 * Каждую плашку можно тащить целиком; за края — менять старт/конец.
 * При смене способа доставки длительность фазы доставки автоматически
 * подстраивается под DELIVERY_DURATION_DAYS, но потом её можно сдвинуть руками.
 */
// Дефолт для нового заказа упаковки: производство 30 дней + доставка 30 дней.
const DEFAULT_PRODUCTION_DAYS = 30;
const DEFAULT_DELIVERY_DAYS = 30;

export function PackagingOrderTimeline({
  orderedDate,
  expectedDate,
  onChangeExpected,
  deliveryMethod,
}: Props) {
  const start = toDate(orderedDate) ?? new Date();
  const existingEnd = toDate(expectedDate);

  // Длина фазы доставки: либо ровно столько дней, сколько заявлено для способа доставки,
  // либо стандартный дефолт 30. Берётся при первом монтировании и при смене способа,
  // если пользователь ещё не двигал руками.
  const deliveryDays = deliveryMethod ? DELIVERY_DURATION_DAYS[deliveryMethod] : DEFAULT_DELIVERY_DAYS;

  const [productionEnd, setProductionEnd] = useState<Date>(() => {
    if (existingEnd) {
      // Редактирование: восстанавливаем productionEnd как (end - deliveryDays)
      return addDays(existingEnd, -deliveryDays);
    }
    return addDays(start, DEFAULT_PRODUCTION_DAYS);
  });
  const [end, setEnd] = useState<Date>(() => {
    if (existingEnd) return existingEnd;
    return addDays(start, DEFAULT_PRODUCTION_DAYS + deliveryDays);
  });

  // При смене способа доставки пересчитываем границу производства/доставки —
  // оставляем productionEnd на месте, а end сдвигаем по новой длине доставки.
  const userTouched = useRef(false);
  useEffect(() => {
    if (userTouched.current) return;
    setEnd(addDays(productionEnd, deliveryDays));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deliveryMethod]);

  // Сообщаем родителю о смене даты прибытия
  useEffect(() => {
    onChangeExpected(fromDate(end));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [end]);

  const trackRef = useRef<HTMLDivElement>(null);
  type DragMode = "production-end" | "end" | "production-bar" | "delivery-bar";
  const dragRef = useRef<{
    mode: DragMode;
    startX: number;
    origProductionEnd: Date;
    origEnd: Date;
    pxPerDay: number;
  } | null>(null);
  const [dragInfo, setDragInfo] = useState<{ left: number; label: string } | null>(null);

  // Шкала: от старта до прибытия + запас 7 дней
  const chartEnd = addDays(end, 7);
  const totalDays = Math.max(daysBetween(start, chartEnd), 1);

  function pct(d: Date) {
    return Math.max(0, Math.min(100, (daysBetween(start, d) / totalDays) * 100));
  }

  // Drag через window-слушатели — чтобы перехватывать движение даже когда курсор
  // уходит за пределы плашки или над хэндлами (pointer capture мешал бы).
  function onPointerDown(e: React.PointerEvent, mode: DragMode) {
    e.preventDefault();
    e.stopPropagation();
    if (!trackRef.current) return;
    const rect = trackRef.current.getBoundingClientRect();
    dragRef.current = {
      mode,
      startX: e.clientX,
      origProductionEnd: productionEnd,
      origEnd: end,
      pxPerDay: rect.width / totalDays,
    };

    function handleMove(ev: PointerEvent) {
      const s = dragRef.current;
      if (!s) return;
      const dx = ev.clientX - s.startX;
      const dd = Math.round(dx / s.pxPerDay);
      if (dd === 0) return;
      userTouched.current = true;

      if (s.mode === "production-end") {
        const candidate = addDays(s.origProductionEnd, dd);
        if (daysBetween(start, candidate) < 0) return;
        if (daysBetween(candidate, s.origEnd) < 0) return;
        setProductionEnd(candidate);
        setDragInfo({ left: pct(candidate), label: formatRu(candidate) });
      } else if (s.mode === "end") {
        const candidate = addDays(s.origEnd, dd);
        if (daysBetween(s.origProductionEnd, candidate) < 0) return;
        setEnd(candidate);
        setDragInfo({ left: pct(candidate), label: formatRu(candidate) });
      } else if (s.mode === "production-bar") {
        const candidate = addDays(s.origProductionEnd, dd);
        if (daysBetween(start, candidate) < 0) return;
        if (daysBetween(candidate, s.origEnd) < 0) return;
        setProductionEnd(candidate);
        setDragInfo({ left: pct(candidate), label: formatRu(candidate) });
      } else if (s.mode === "delivery-bar") {
        const newProdEnd = addDays(s.origProductionEnd, dd);
        const newEnd = addDays(s.origEnd, dd);
        if (daysBetween(start, newProdEnd) < 0) return;
        setProductionEnd(newProdEnd);
        setEnd(newEnd);
        setDragInfo({ left: pct(newEnd), label: formatRu(newEnd) });
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
  }

  const productionDays = Math.max(0, daysBetween(start, productionEnd));
  const deliveryDaysActual = Math.max(0, daysBetween(productionEnd, end));

  return (
    <div className="space-y-2 select-none">
      <div className="flex items-center justify-between text-xs">
        <span className="text-slate-500">
          Старт: <span className="font-medium text-slate-700">{formatRu(start)}</span>
        </span>
        <span className="text-slate-500">
          Готово: <span className="font-medium text-slate-700">{formatRu(productionEnd)}</span>
        </span>
        <span className="text-slate-500">
          Прибытие: <span className="font-medium text-slate-700">{formatRu(end)}</span>
        </span>
      </div>

      <div
        ref={trackRef}
        className="relative h-10 rounded-lg bg-slate-100"
      >
        {dragInfo && (
          <div
            className="pointer-events-none absolute -top-7 z-10 -translate-x-1/2 whitespace-nowrap rounded bg-emerald-600 px-2 py-1 text-xs font-bold text-white shadow"
            style={{ left: `${dragInfo.left}%` }}
          >
            {dragInfo.label}
          </div>
        )}

        {/* Производство — двигается целиком, правый край — отдельный handle */}
        <div
          onPointerDown={(e) => onPointerDown(e, "production-bar")}
          className="absolute top-0 bottom-0 left-0 flex cursor-grab items-center rounded-l-lg bg-blue-300 pl-2 text-[11px] font-medium text-blue-900 active:cursor-grabbing"
          style={{ width: `${pct(productionEnd)}%` }}
          title={`Производство: ${productionDays} дн`}
        >
          🪡 Производство · {productionDays} дн
          <div
            onPointerDown={(e) => onPointerDown(e, "production-end")}
            className="absolute -right-0.5 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-white/30"
            title="Сдвинуть конец производства"
          />
        </div>

        {/* Доставка */}
        <div
          onPointerDown={(e) => onPointerDown(e, "delivery-bar")}
          className="absolute top-0 bottom-0 flex cursor-grab items-center bg-indigo-300 pl-2 text-[11px] font-medium text-indigo-900 active:cursor-grabbing"
          style={{ left: `${pct(productionEnd)}%`, width: `${pct(end) - pct(productionEnd)}%` }}
          title={`Доставка: ${deliveryDaysActual} дн`}
        >
          ✈ Доставка · {deliveryDaysActual} дн
          <div
            onPointerDown={(e) => onPointerDown(e, "end")}
            className="absolute -right-0.5 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-white/30"
            title="Сдвинуть дату прибытия"
          />
        </div>

        {/* Маркер «сегодня» */}
        {(() => {
          const today = new Date();
          today.setUTCHours(0, 0, 0, 0);
          const ratio = pct(today);
          if (ratio <= 0 || ratio >= 100) return null;
          return (
            <div
              className="pointer-events-none absolute top-0 bottom-0 w-px bg-red-500"
              style={{ left: `${ratio}%` }}
            >
              <div className="absolute -top-2 left-1 rounded bg-red-500 px-1 py-0.5 text-[9px] font-semibold uppercase text-white">
                сегодня
              </div>
            </div>
          );
        })()}
      </div>

      <p className="text-xs text-slate-500">
        Тащите плашку, чтобы сдвинуть фазу, или за края — чтобы поменять её границы.
      </p>
    </div>
  );
}
