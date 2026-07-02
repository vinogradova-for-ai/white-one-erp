"use client";

import type { CompareCard, MonthCompare } from "@/lib/queries/stats-page";
import { fmt } from "./format";

/**
 * Сравнение выбранного месяца с прошлым — 4 карточки: большое число + цветная
 * дельта. Улучшение зелёное, ухудшение красное. Для «цикла» рост = хуже (красный),
 * для остального рост = лучше (зелёный).
 */

type CardDef = {
  key: keyof MonthCompare;
  title: string;
  suffix?: string;
  /** true — рост метрики это ХУЖЕ (цикл дней). По умолчанию рост = лучше. */
  higherIsWorse?: boolean;
};

const CARDS: CardDef[] = [
  { key: "orderedUnits", title: "Заказано", suffix: "шт" },
  { key: "receivedUnits", title: "Получено", suffix: "шт" },
  { key: "onTimePct", title: "Вовремя", suffix: "%" },
  { key: "cycleDays", title: "Цикл", suffix: "дн", higherIsWorse: true },
];

export function MonthCompareCards({ compare }: { compare: MonthCompare }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {CARDS.map((c) => (
        <Card key={c.key} def={c} data={compare[c.key]} />
      ))}
    </div>
  );
}

function Card({ def, data }: { def: CardDef; data: CompareCard }) {
  const diff = data.value - data.prev;
  const hasDelta = data.prev !== 0 || data.value !== 0;

  // Знак «улучшения»: обычно рост хорош; для цикла — наоборот.
  const improved = def.higherIsWorse ? diff < 0 : diff > 0;
  const worsened = def.higherIsWorse ? diff > 0 : diff < 0;

  const deltaCls = improved
    ? "text-emerald-600 dark:text-emerald-400"
    : worsened
      ? "text-red-600 dark:text-red-400"
      : "text-slate-400";

  const arrow = diff > 0 ? "▲" : diff < 0 ? "▼" : "•";

  return (
    <div className="rounded-xl border border-slate-200 bg-white px-3 py-3">
      <div className="text-xs font-medium text-slate-500">{def.title}</div>
      <div className="mt-1 text-2xl font-semibold text-slate-900 tabular-nums">
        {fmt(data.value)}
        {def.suffix && <span className="ml-1 text-sm font-normal text-slate-400">{def.suffix}</span>}
      </div>
      {hasDelta ? (
        <div className={`mt-1 text-xs font-medium tabular-nums ${deltaCls}`}>
          {arrow} {fmt(Math.abs(diff))} к прошлому
        </div>
      ) : (
        <div className="mt-1 text-xs text-slate-400">нет данных</div>
      )}
    </div>
  );
}
