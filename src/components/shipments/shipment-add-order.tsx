"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type AddableOrder = { id: string; orderNumber: string; modelName: string; remainingQty: number };

// Выбор заказа для добавления в поставку. Партия создаётся лениво на бэке.
export function ShipmentAddOrder({
  shipmentId,
  orders,
}: {
  shipmentId: string;
  orders: AddableOrder[];
}) {
  const router = useRouter();
  const [orderId, setOrderId] = useState("");
  const [qty, setQty] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const picked = orders.find((o) => o.id === orderId) ?? null;

  async function add() {
    if (!orderId) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/shipments/${shipmentId}/batches`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId,
          qty: qty.trim() === "" ? null : Number(qty),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error?.message ?? "Не удалось добавить заказ");
        return;
      }
      setOrderId("");
      setQty("");
      router.refresh();
    } catch {
      setError("Сеть недоступна, попробуйте ещё раз");
    } finally {
      setBusy(false);
    }
  }

  if (orders.length === 0) {
    return (
      <div className="rounded-2xl bg-white p-4 text-sm text-slate-500 dark:bg-slate-900 dark:text-slate-400">
        Нет заказов, доступных для добавления.
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-white p-4 dark:bg-slate-900">
      <div className="flex flex-col gap-2 sm:flex-row">
        <select
          value={orderId}
          onChange={(e) => { setOrderId(e.target.value); setQty(""); }}
          className="h-11 flex-1 rounded-lg border border-slate-300 px-3 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
        >
          <option value="">Выберите заказ…</option>
          {orders.map((o) => (
            <option key={o.id} value={o.id}>
              {o.orderNumber} · {o.modelName} · не уехало {o.remainingQty.toLocaleString("ru-RU")} шт
            </option>
          ))}
        </select>
        {picked && (
          <label className="flex h-11 items-center gap-2 rounded-lg border border-slate-300 px-3 text-sm dark:border-slate-600">
            <span className="whitespace-nowrap text-xs text-slate-500">едет, шт</span>
            <input
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              placeholder={String(picked.remainingQty)}
              inputMode="numeric"
              className="w-20 bg-transparent text-sm outline-none dark:text-slate-100"
            />
          </label>
        )}
        <button
          type="button"
          disabled={busy || !orderId}
          onClick={add}
          className="h-11 rounded-lg bg-slate-900 px-4 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
        >
          {busy ? "Добавляю…" : "Добавить"}
        </button>
      </div>
      {error ? <p className="mt-2 text-xs text-rose-600">{error}</p> : null}
    </div>
  );
}
