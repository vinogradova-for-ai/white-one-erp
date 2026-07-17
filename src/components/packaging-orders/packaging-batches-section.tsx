"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { SHIPMENT_STATUS_LABELS } from "@/lib/constants";
import type { ShipmentStatus } from "@prisma/client";

// Блок «Партии и доставка» на карточке заказа упаковки (Алёна 17.07):
// упаковка едет частями разными карго. Показывает партии (в каком карго),
// позволяет разбить партию — указанные штуки уезжают в новую партию.
// Зеркало OrderBatchesSection у одежды, без поштучной приёмки.

export type PkgBatchItemView = {
  id: string;
  name: string;
  plannedQty: number;
};

export type PkgBatchView = {
  id: string;
  index: number;
  shipment: { id: string; number: string; status: ShipmentStatus } | null;
  items: PkgBatchItemView[];
};

export function PackagingBatchesSection({
  batches,
  totalBatches,
  canManage,
}: {
  batches: PkgBatchView[];
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
      const res = await fetch(`/api/packaging-batches/${batchId}/split`, {
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
      <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-500">
        Партий пока нет. Партия создастся автоматически, когда заказ добавят в карго
        (раздел{" "}
        <Link href="/shipments" className="text-slate-900 underline">
          Карго
        </Link>
        ).
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {batches.map((b) => {
        const planned = b.items.reduce((a, i) => a + i.plannedQty, 0);
        return (
          <div key={b.id} className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="text-sm font-semibold text-slate-900">
                Партия {b.index}/{totalBatches}
              </span>
              <span className="text-sm text-slate-500">{planned} шт</span>
              {b.shipment ? (
                <Link
                  href={`/shipments/${b.shipment.id}`}
                  className="rounded-lg bg-slate-100 px-2 py-0.5 text-xs text-slate-700 hover:bg-slate-200"
                >
                  в карго {b.shipment.number} · {SHIPMENT_STATUS_LABELS[b.shipment.status]}
                </Link>
              ) : (
                <span className="rounded-lg bg-amber-50 px-2 py-0.5 text-xs text-amber-700">
                  без карго
                </span>
              )}
            </div>

            <div className="mt-2 space-y-0.5 text-xs text-slate-600">
              {b.items.map((i) => (
                <div key={i.id}>
                  {i.name}: {i.plannedQty} шт
                </div>
              ))}
            </div>

            {/* Разбить — только если партия не в уехавшем карго */}
            {canManage && (!b.shipment || b.shipment.status === "DRAFT") ? (
              splitBatchId === b.id ? (
                <div className="mt-3 rounded-xl bg-slate-50 p-3">
                  <p className="mb-2 text-xs text-slate-600">
                    Сколько штук уезжает в НОВУЮ партию (остаток останется в этой):
                  </p>
                  <div className="space-y-1.5">
                    {b.items.map((i) => (
                      <div key={i.id} className="flex items-center gap-2">
                        <span className="flex-1 text-sm text-slate-700">
                          {i.name} <span className="text-slate-400">(из {i.plannedQty})</span>
                        </span>
                        <input
                          type="number"
                          min={0}
                          max={i.plannedQty}
                          inputMode="numeric"
                          value={move[i.id] ?? ""}
                          onChange={(e) => setMove((m) => ({ ...m, [i.id]: e.target.value }))}
                          className="h-11 w-20 rounded-lg border border-slate-300 px-2 text-sm"
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
                      className="rounded-lg px-3 py-2 text-xs text-slate-600 hover:bg-slate-100"
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
                  className="mt-3 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
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
