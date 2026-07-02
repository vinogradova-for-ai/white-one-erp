"use client";

import type { PersonRow } from "@/lib/queries/stats-page";
import { fmt } from "./format";

/**
 * Люди за месяц — строка на человека: план/факт по фасонам и штукам (выполнен →
 * зелёная галочка, недобор → тёплый красный), % вовремя, цикл со стрелкой к
 * прошлому месяцу (рост цикла = хуже = красный).
 */

export function PeopleTable({ people }: { people: PersonRow[] }) {
  if (people.length === 0) {
    return <p className="text-sm text-slate-500">В этом месяце активности по людям нет.</p>;
  }
  return (
    <div className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200">
      {people.map((p) => (
        <PersonLine key={p.ownerId} person={p} />
      ))}
    </div>
  );
}

function PersonLine({ person: p }: { person: PersonRow }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-4 py-3">
      <div className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-900">
        {p.ownerName}
      </div>

      {/* План/факт: фасоны и штуки */}
      <PlanFact label="фасоны" fact={p.factModels} plan={p.planModels} />
      <PlanFact label="штуки" fact={p.factUnits} plan={p.planUnits} />

      {/* Вовремя % */}
      <div className="text-xs text-slate-500">
        вовремя{" "}
        <span className="font-medium text-slate-800 tabular-nums">
          {p.onTimePct === null ? "—" : `${p.onTimePct}%`}
        </span>
      </div>

      {/* Цикл + стрелка к прошлому месяцу */}
      <Cycle days={p.cycleDays} prev={p.cycleDaysPrev} />
    </div>
  );
}

function PlanFact({ label, fact, plan }: { label: string; fact: number; plan: number | null }) {
  // Плана нет (не PM) — показываем только факт нейтрально.
  if (plan === null || plan === 0) {
    return (
      <div className="text-xs text-slate-500">
        {label} <span className="font-medium text-slate-800 tabular-nums">{fmt(fact)}</span>
      </div>
    );
  }
  const done = fact >= plan;
  return (
    <div className="text-xs text-slate-500">
      {label}{" "}
      <span
        className={`font-medium tabular-nums ${
          done ? "text-emerald-600 dark:text-emerald-400" : "text-red-500 dark:text-red-400"
        }`}
      >
        {fmt(fact)}/{fmt(plan)}
        {done ? " ✓" : ""}
      </span>
    </div>
  );
}

function Cycle({ days, prev }: { days: number | null; prev: number | null }) {
  if (days === null) {
    return <div className="text-xs text-slate-400">цикл —</div>;
  }
  let arrow: React.ReactNode = null;
  if (prev !== null && prev !== days) {
    const up = days > prev; // цикл вырос = хуже
    arrow = (
      <span
        className={`ml-1 tabular-nums ${
          up ? "text-red-500 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400"
        }`}
      >
        {up ? "▲" : "▼"}
        {Math.abs(days - prev)}
      </span>
    );
  }
  return (
    <div className="text-xs text-slate-500">
      цикл <span className="font-medium text-slate-800 tabular-nums">{days} дн</span>
      {arrow}
    </div>
  );
}
