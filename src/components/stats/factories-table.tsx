"use client";

import type { FactoryRow } from "@/lib/queries/stats-page";
import { fmt } from "./format";

/**
 * Фабрики за месяц — строка на фабрику: название · штуки (заказано/получено) ·
 * кол-во заказов · среднее опоздание. Опоздание 0 → зелёное «без опозданий».
 */

export function FactoriesTable({ factories }: { factories: FactoryRow[] }) {
  if (factories.length === 0) {
    return <p className="text-sm text-slate-500">В этом месяце движений по фабрикам нет.</p>;
  }
  return (
    <div className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200">
      {factories.map((f) => (
        <div key={f.factoryId} className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-4 py-3">
          <div className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-900">
            {f.factoryName}
          </div>

          <div className="text-xs text-slate-500">
            заказано <span className="font-medium text-slate-800 tabular-nums">{fmt(f.orderedUnits)}</span>
            {" · "}
            получено <span className="font-medium text-slate-800 tabular-nums">{fmt(f.receivedUnits)}</span>
          </div>

          <div className="text-xs text-slate-500">
            заказов <span className="font-medium text-slate-800 tabular-nums">{fmt(f.arrivedOrders)}</span>
          </div>

          {f.avgLateDays > 0 ? (
            <div className="text-xs font-medium text-red-500 tabular-nums dark:text-red-400">
              опоздание {f.avgLateDays} дн
            </div>
          ) : (
            <div className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
              без опозданий
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
