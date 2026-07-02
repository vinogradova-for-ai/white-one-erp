"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { SHIPMENT_STATUS_LABELS } from "@/lib/constants";
import type { ShipmentStatus } from "@prisma/client";

// Блок «Партии и доставка» на карточке заказа.
// Показывает партии заказа (в какой поставке, приёмка N/M), позволяет разбить
// партию на партии (сколько штук какой позиции уезжает — остаток в новой партии).

export type BatchItemView = {
  id: string;
  colorName: string;
  size: string;
  plannedQty: number;
  factQty: number | null;
  defectQty: number | null;
};

export type BatchView = {
  id: string;
  index: number;
  receivedAt: string | null;
  shipment: { id: string; number: string; status: ShipmentStatus } | null;
  items: BatchItemView[];
};

export function OrderBatchesSection({
  batches,
  totalBatches,
  canManage,
}: {
  batches: BatchView[];
  totalBatches: number;
  canManage: boolean;
}) {
  const router = useRouter();
  const [splitBatchId, setSplitBatchId] = useState<string | null>(null);
  const [move, setMove] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submitSplit(batchId: string) {
    setBusy(true);
    setError(null);
    const moveNums: Record<string, number> = {};
    for (const [k, v] of Object.entries(move)) {
      const n = Number(v);
      if (n > 0) moveNums[k] = n;
    }
    try {
      const res = await fetch(`/api/batches/${batchId}/split`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ move: moveNums }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error?.message ?? "Не удалось разбить партию");
        return;
      }
      setSplitBatchId(null);
      setMove({});
      router.refresh();
    } catch {
      setError("Сеть недоступна, попробуйте ещё раз");
    } finally {
      setBusy(false);
    }
  }

  if (batches.length === 0) {
    return (
      <div className="rounded-2xl bg-white p-5 text-sm text-slate-500 dark:bg-slate-900 dark:text-slate-400">
        Партий пока нет. Партия создастся автоматически, когда заказ добавят в поставку
        (раздел{" "}
        <Link href="/shipments" className="text-slate-900 underline dark:text-slate-200">
          Поставки
        </Link>
        ).
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {batches.map((b) => {
        const planned = b.items.reduce((a, i) => a + i.plannedQty, 0);
        const fact = b.items.reduce((a, i) => a + (i.factQty ?? 0), 0);
        const received = b.receivedAt != null;
        const hasFact = b.items.some((i) => i.factQty != null);
        return (
          <div
            key={b.id}
            className="rounded-2xl bg-white p-4 dark:bg-slate-900"
          >
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Партия {b.index}/{totalBatches}
              </span>
              <span className="text-sm text-slate-500 dark:text-slate-400">{planned} шт</span>
              {b.shipment ? (
                <Link
                  href={`/shipments/${b.shipment.id}`}
                  className="rounded-lg bg-slate-100 px-2 py-0.5 text-xs text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"
                >
                  в поставке {b.shipment.number} · {SHIPMENT_STATUS_LABELS[b.shipment.status]}
                </Link>
              ) : (
                <span className="rounded-lg bg-amber-50 px-2 py-0.5 text-xs text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                  без поставки
                </span>
              )}
              {received ? (
                <span className="rounded-lg bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
                  принята {fact}/{planned}
                </span>
              ) : null}
            </div>

            {/* Расхождение план/факт после приёмки */}
            {hasFact ? (
              <div className="mt-2 space-y-0.5 text-xs text-slate-600 dark:text-slate-400">
                {b.items
                  .filter((i) => i.factQty != null && (i.factQty !== i.plannedQty || (i.defectQty ?? 0) > 0))
                  .map((i) => (
                    <div key={i.id}>
                      {i.colorName} · {i.size}: план {i.plannedQty}, факт {i.factQty}
                      {(i.defectQty ?? 0) > 0 ? `, брак ${i.defectQty}` : ""}
                      {i.factQty! < i.plannedQty ? (
                        <span className="text-amber-600 dark:text-amber-400"> · недостача {i.plannedQty - i.factQty!}</span>
                      ) : null}
                    </div>
                  ))}
              </div>
            ) : null}

            {/* Разбить на партии — только если не в уехавшей поставке и не принята */}
            {canManage && !received && (!b.shipment || b.shipment.status === "DRAFT") ? (
              splitBatchId === b.id ? (
                <div className="mt-3 rounded-xl bg-slate-50 p-3 dark:bg-slate-800/60">
                  <p className="mb-2 text-xs text-slate-600 dark:text-slate-400">
                    Сколько штук уезжает в НОВУЮ партию (остаток останется в этой):
                  </p>
                  <div className="space-y-1.5">
                    {b.items.map((i) => (
                      <div key={i.id} className="flex items-center gap-2">
                        <span className="flex-1 text-sm text-slate-700 dark:text-slate-300">
                          {i.colorName} · {i.size} <span className="text-slate-400">(из {i.plannedQty})</span>
                        </span>
                        <input
                          type="number"
                          min={0}
                          max={i.plannedQty}
                          inputMode="numeric"
                          value={move[i.id] ?? ""}
                          onChange={(e) => setMove((m) => ({ ...m, [i.id]: e.target.value }))}
                          className="h-11 w-20 rounded-lg border border-slate-300 px-2 text-sm dark:border-slate-600 dark:bg-slate-900"
                          placeholder="0"
                        />
                      </div>
                    ))}
                  </div>
                  {error ? <p className="mt-2 text-xs text-rose-600">{error}</p> : null}
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => submitSplit(b.id)}
                      className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50"
                    >
                      {busy ? "Разбиваю…" : "Разбить"}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSplitBatchId(null);
                        setMove({});
                        setError(null);
                      }}
                      className="rounded-lg px-3 py-2 text-xs text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                    >
                      Отмена
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setSplitBatchId(b.id);
                    setError(null);
                  }}
                  className="mt-3 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  Разбить на партии
                </button>
              )
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
