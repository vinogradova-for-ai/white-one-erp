"use client";

import { useState } from "react";
import Link from "next/link";

export type TileOrder = {
  id: string;
  orderNumber: string;
  modelName: string;
  qty: number;
  arrival: string | null; // дата прибытия (план), уже отформатированная
};

// Плитки статусов на «Складе»: клик по плитке раскрывает, что внутри —
// список заказов этого статуса со ссылками (правка Алёны 07.07).
export function StatusTiles({
  tiles,
}: {
  tiles: Array<{ status: string; label: string; count: number; orders: TileOrder[] }>;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const active = tiles.find((t) => t.status === open);

  return (
    <div className="mt-5">
      <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-4">
        {tiles.map((t) => {
          const isOpen = open === t.status;
          const clickable = t.count > 0;
          return (
            <button
              key={t.status}
              type="button"
              disabled={!clickable}
              onClick={() => setOpen(isOpen ? null : t.status)}
              className={`flex min-h-[44px] items-center justify-between rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                isOpen
                  ? "border-slate-900 bg-slate-900 text-white"
                  : "border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-300"
              } ${clickable ? "cursor-pointer" : "cursor-default"}`}
            >
              <span className={isOpen ? "text-white" : "text-slate-600"}>{t.label}</span>
              <span className={`font-semibold ${isOpen ? "text-white" : "text-slate-900"}`}>
                {t.count}
                {clickable && <span className={`ml-1 text-[10px] ${isOpen ? "opacity-80" : "text-slate-400"}`}>{isOpen ? "▲" : "▼"}</span>}
              </span>
            </button>
          );
        })}
      </div>

      {active && active.orders.length > 0 && (
        <div className="mt-2 rounded-xl border border-slate-200 bg-white">
          <ul className="divide-y divide-slate-100">
            {active.orders.map((o) => (
              <li key={o.id}>
                <Link
                  href={`/orders/${o.id}`}
                  className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-2.5 text-sm hover:bg-slate-50"
                >
                  <span className="min-w-0">
                    <span className="font-mono text-xs text-slate-500">{o.orderNumber}</span>
                    <span className="ml-2 font-medium text-slate-900">{o.modelName}</span>
                  </span>
                  <span className="flex shrink-0 items-baseline gap-3 text-xs text-slate-500">
                    <span className="tabular-nums">{o.qty.toLocaleString("ru-RU")} шт</span>
                    {o.arrival && <span>прибытие {o.arrival}</span>}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
