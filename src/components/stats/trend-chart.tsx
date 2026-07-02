"use client";

import { useState } from "react";
import type { TrendMetricKey, TrendMonth } from "@/lib/queries/stats-page";
import { fmtMetricValue } from "./format";

/**
 * Тренд заказано/получено по месяцам — ЧИСТЫЙ CSS (без графических библиотек).
 * Две колонки на месяц: заказано (bg-blue-500), получено (bg-emerald-500).
 * Пунктирная линия цели (для штук/фасонов; для денег цели нет). Значение —
 * по наведению/тапу на колонку. На мобиле — горизонтальный скролл.
 */

// Цели из книги компании: 20 000 шт / 10 фасонов в месяц. Для денег цели нет.
const GOALS: Record<TrendMetricKey, number | null> = {
  units: 20_000,
  models: 10,
  money: null,
};

const CHART_H = 160; // высота области баров, px

function metricOf(m: TrendMonth, metric: TrendMetricKey, kind: "ordered" | "received"): number {
  return m[kind][metric];
}

export function TrendChart({
  months,
  metric,
}: {
  months: TrendMonth[];
  metric: TrendMetricKey;
}) {
  // Что подсвечено (месяц+тип) — общий стейт наведения/тапа.
  const [hover, setHover] = useState<{ ym: number; kind: "ordered" | "received" } | null>(null);

  const hasData = months.some(
    (m) => m.ordered[metric] > 0 || m.received[metric] > 0,
  );
  if (!hasData) {
    return <p className="text-sm text-slate-500">За выбранный период данных нет.</p>;
  }

  const goal = GOALS[metric];
  // Масштаб — по максимуму из значений и цели (чтобы линия цели была в кадре).
  const maxValue = Math.max(
    1,
    ...months.flatMap((m) => [m.ordered[metric], m.received[metric]]),
    goal ?? 0,
  );
  const h = (v: number) => Math.round((v / maxValue) * CHART_H);
  const goalTop = goal ? CHART_H - h(goal) : null;

  return (
    <div>
      {/* Легенда */}
      <div className="mb-3 flex flex-wrap items-center gap-4 text-xs text-slate-500">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-blue-500" aria-hidden />
          Заказано
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-emerald-500" aria-hidden />
          Получено
        </span>
        {goal !== null && (
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-0 w-4 border-t-2 border-dashed border-slate-400" aria-hidden />
            Цель {goal.toLocaleString("ru-RU")}
          </span>
        )}
      </div>

      {/* Область графика — горизонтальный скролл на узких экранах */}
      <div className="overflow-x-auto pb-1">
        <div className="relative flex min-w-max items-end gap-3" style={{ height: CHART_H }}>
          {/* Пунктир цели */}
          {goalTop !== null && (
            <div
              className="pointer-events-none absolute right-0 left-0 border-t-2 border-dashed border-slate-300"
              style={{ top: goalTop }}
              aria-hidden
            />
          )}

          {months.map((m) => {
            const ordered = metricOf(m, metric, "ordered");
            const received = metricOf(m, metric, "received");
            return (
              <div key={m.yearMonth} className="flex h-full flex-col justify-end">
                <div className="flex items-end gap-1" style={{ height: CHART_H }}>
                  <Bar
                    value={ordered}
                    height={h(ordered)}
                    color="bg-blue-500"
                    active={hover?.ym === m.yearMonth && hover.kind === "ordered"}
                    onHover={(on) => setHover(on ? { ym: m.yearMonth, kind: "ordered" } : null)}
                    label={fmtMetricValue(ordered, metric)}
                  />
                  <Bar
                    value={received}
                    height={h(received)}
                    color="bg-emerald-500"
                    active={hover?.ym === m.yearMonth && hover.kind === "received"}
                    onHover={(on) => setHover(on ? { ym: m.yearMonth, kind: "received" } : null)}
                    label={fmtMetricValue(received, metric)}
                  />
                </div>
              </div>
            );
          })}
        </div>

        {/* Подписи месяцев — та же сетка, что и бары */}
        <div className="mt-2 flex min-w-max gap-3">
          {months.map((m) => (
            <div key={m.yearMonth} className="w-[42px] text-center text-[11px] text-slate-400">
              {m.label}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Одна колонка. Наведение/тап показывает значение над колонкой. */
function Bar({
  value,
  height,
  color,
  active,
  onHover,
  label,
}: {
  value: number;
  height: number;
  color: string;
  active: boolean;
  onHover: (on: boolean) => void;
  label: string;
}) {
  return (
    <div className="relative flex w-[19px] items-end">
      {active && (
        <div className="absolute bottom-full left-1/2 z-10 mb-1 -translate-x-1/2 whitespace-nowrap rounded-md bg-slate-900 px-2 py-1 text-[11px] font-medium text-white tabular-nums shadow-lg">
          {label}
        </div>
      )}
      <button
        type="button"
        onMouseEnter={() => onHover(true)}
        onMouseLeave={() => onHover(false)}
        onClick={() => onHover(!active)}
        aria-label={label}
        className={`w-full rounded-t-sm transition-opacity ${color} ${active ? "opacity-100" : "opacity-80 hover:opacity-100"}`}
        // min 2px — чтобы нулевые/крошечные значения всё равно были видимой полоской
        style={{ height: Math.max(value > 0 ? 3 : 0, height) }}
      />
    </div>
  );
}
