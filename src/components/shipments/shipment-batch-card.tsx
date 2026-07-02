"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { ShipmentStatus } from "@prisma/client";
import { aggregateReceipt } from "@/lib/batches/batch-logic";

type BatchItem = {
  id: string;
  variantId: string | null;
  colorName: string;
  size: string;
  plannedQty: number;
  factQty: number | null;
  defectQty: number | null;
  note: string | null;
};

type Batch = {
  id: string;
  index: number;
  totalBatches: number;
  receivedAt: string | null;
  order: { id: string; orderNumber: string; modelName: string };
  items: BatchItem[];
};

// Редактируемая строка (локальное состояние формы приёмки).
type Row = {
  id?: string; // отсутствует у добавленных вручную
  variantId: string | null;
  colorName: string;
  size: string;
  plannedQty: number;
  factQty: string;
  defectQty: string;
  note: string;
};

function toRow(i: BatchItem): Row {
  return {
    id: i.id,
    variantId: i.variantId,
    colorName: i.colorName,
    size: i.size,
    plannedQty: i.plannedQty,
    factQty: i.factQty != null ? String(i.factQty) : "",
    defectQty: i.defectQty != null ? String(i.defectQty) : "",
    note: i.note ?? "",
  };
}

export function ShipmentBatchCard({
  shipmentId,
  shipmentStatus,
  canManage,
  batch,
}: {
  shipmentId: string;
  shipmentStatus: ShipmentStatus;
  canManage: boolean;
  batch: Batch;
}) {
  const router = useRouter();
  const [receiving, setReceiving] = useState(false);
  const [rows, setRows] = useState<Row[]>(batch.items.map(toRow));
  const [deletedIds, setDeletedIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const received = batch.receivedAt != null;
  // Приёмка доступна, когда поставка приехала (или уже принимается/закрыта).
  const canReceive = canManage && !received && (shipmentStatus === "ARRIVED" || shipmentStatus === "RECEIVED");

  const totals = aggregateReceipt(
    rows.map((r) => ({
      plannedQty: r.plannedQty,
      factQty: r.factQty === "" ? null : Number(r.factQty),
      defectQty: r.defectQty === "" ? null : Number(r.defectQty),
    })),
  );

  function updateRow(idx: number, patch: Partial<Row>) {
    setRows((rs) => rs.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }
  function addRow() {
    setRows((rs) => [
      ...rs,
      { variantId: null, colorName: "", size: "", plannedQty: 0, factQty: "", defectQty: "", note: "" },
    ]);
  }
  function removeRow(idx: number) {
    setRows((rs) => {
      const r = rs[idx];
      if (r.id) setDeletedIds((d) => [...d, r.id!]);
      return rs.filter((_, i) => i !== idx);
    });
  }

  async function saveReceipt(complete: boolean) {
    setBusy(true);
    setError(null);
    // Валидация новых строк.
    for (const r of rows) {
      if (!r.colorName.trim() || !r.size.trim()) {
        setError("У каждой строки должны быть цвет и размер");
        setBusy(false);
        return;
      }
    }
    try {
      const res = await fetch(`/api/batches/${batch.id}/receipt`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: rows.map((r) => ({
            id: r.id,
            variantId: r.variantId,
            colorName: r.colorName.trim(),
            size: r.size.trim(),
            plannedQty: r.plannedQty,
            factQty: r.factQty === "" ? null : Number(r.factQty),
            defectQty: r.defectQty === "" ? null : Number(r.defectQty),
            note: r.note.trim() || null,
          })),
          deletedItemIds: deletedIds,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error?.message ?? "Не удалось сохранить приёмку");
        setBusy(false);
        return;
      }
      setDeletedIds([]);
      if (complete) {
        const done = await fetch(`/api/batches/${batch.id}/receipt`, { method: "POST" });
        const doneData = await done.json();
        if (!done.ok) {
          setError(doneData?.error?.message ?? "Не удалось завершить приёмку");
          setBusy(false);
          return;
        }
      }
      setReceiving(false);
      router.refresh();
    } catch {
      setError("Сеть недоступна, попробуйте ещё раз");
    } finally {
      setBusy(false);
    }
  }

  async function removeFromShipment() {
    if (!confirm("Убрать партию из поставки? Она останется у заказа без поставки.")) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/shipments/${shipmentId}/batches`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ batchId: batch.id }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data?.error?.message ?? "Не удалось убрать");
        setBusy(false);
        return;
      }
      router.refresh();
    } catch {
      alert("Сеть недоступна, попробуйте ещё раз");
      setBusy(false);
    }
  }

  const planned = batch.items.reduce((a, i) => a + i.plannedQty, 0);

  return (
    <div className="rounded-2xl bg-white p-4 dark:bg-slate-900">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Link
          href={`/orders/${batch.order.id}`}
          className="text-sm font-semibold text-slate-900 underline decoration-slate-300 hover:decoration-slate-600 dark:text-slate-100"
        >
          {batch.order.orderNumber}
        </Link>
        <span className="text-sm text-slate-600 dark:text-slate-300">{batch.order.modelName}</span>
        <span className="text-xs text-slate-400">
          партия {batch.index}/{batch.totalBatches} · {planned} шт
        </span>
        {received ? (
          <span className="rounded-lg bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
            принята
          </span>
        ) : null}
        {canManage && !received && shipmentStatus === "DRAFT" ? (
          <button
            type="button"
            onClick={removeFromShipment}
            disabled={busy}
            className="ml-auto text-xs text-slate-400 hover:text-rose-600 disabled:opacity-50 dark:hover:text-rose-400"
          >
            убрать
          </button>
        ) : null}
      </div>

      {/* Свёрнутый вид: строки план/факт */}
      {!receiving ? (
        <div className="mt-2 space-y-0.5 text-xs text-slate-600 dark:text-slate-400">
          {batch.items.map((i) => (
            <div key={i.id} className="flex flex-wrap gap-x-2">
              <span className="text-slate-700 dark:text-slate-300">
                {i.colorName} · {i.size}
              </span>
              <span>план {i.plannedQty}</span>
              {i.factQty != null ? <span>· факт {i.factQty}</span> : null}
              {(i.defectQty ?? 0) > 0 ? <span className="text-rose-500 dark:text-rose-400">· брак {i.defectQty}</span> : null}
              {i.factQty != null && i.factQty < i.plannedQty ? (
                <span className="text-amber-600 dark:text-amber-400">· недостача {i.plannedQty - i.factQty}</span>
              ) : null}
            </div>
          ))}
          {canReceive ? (
            <button
              type="button"
              onClick={() => setReceiving(true)}
              className="mt-2 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              Приёмка
            </button>
          ) : null}
        </div>
      ) : (
        // Форма приёмки. На мобиле — карточки строк; на десктопе — таблица.
        <div className="mt-3 space-y-3">
          {/* Мобильные карточки строк */}
          <div className="space-y-3 sm:hidden">
            {rows.map((r, idx) => (
              <div key={r.id ?? `new-${idx}`} className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800/60">
                <div className="mb-2 flex gap-2">
                  <input
                    value={r.colorName}
                    onChange={(e) => updateRow(idx, { colorName: e.target.value })}
                    placeholder="Цвет"
                    className="h-11 flex-1 rounded-lg border border-slate-300 px-2 text-sm dark:border-slate-600 dark:bg-slate-900"
                  />
                  <input
                    value={r.size}
                    onChange={(e) => updateRow(idx, { size: e.target.value })}
                    placeholder="Размер"
                    className="h-11 w-20 rounded-lg border border-slate-300 px-2 text-sm dark:border-slate-600 dark:bg-slate-900"
                  />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <label className="text-xs text-slate-500">
                    План
                    <div className="mt-0.5 flex h-11 items-center rounded-lg bg-white px-2 text-sm dark:bg-slate-900">{r.plannedQty}</div>
                  </label>
                  <label className="text-xs text-slate-500">
                    Факт
                    <input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      value={r.factQty}
                      onChange={(e) => updateRow(idx, { factQty: e.target.value })}
                      className="mt-0.5 h-11 w-full rounded-lg border border-slate-300 px-2 text-sm dark:border-slate-600 dark:bg-slate-900"
                    />
                  </label>
                  <label className="text-xs text-slate-500">
                    Брак
                    <input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      value={r.defectQty}
                      onChange={(e) => updateRow(idx, { defectQty: e.target.value })}
                      className="mt-0.5 h-11 w-full rounded-lg border border-slate-300 px-2 text-sm dark:border-slate-600 dark:bg-slate-900"
                    />
                  </label>
                </div>
                <input
                  value={r.note}
                  onChange={(e) => updateRow(idx, { note: e.target.value })}
                  placeholder="Заметка"
                  className="mt-2 h-11 w-full rounded-lg border border-slate-300 px-2 text-sm dark:border-slate-600 dark:bg-slate-900"
                />
                <button
                  type="button"
                  onClick={() => removeRow(idx)}
                  className="mt-1 text-xs text-slate-400 hover:text-rose-600 dark:hover:text-rose-400"
                >
                  удалить строку
                </button>
              </div>
            ))}
          </div>

          {/* Десктопная таблица */}
          <div className="hidden overflow-x-auto sm:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-slate-400">
                  <th className="py-1 pr-2 font-medium">Цвет</th>
                  <th className="py-1 pr-2 font-medium">Размер</th>
                  <th className="py-1 pr-2 font-medium">План</th>
                  <th className="py-1 pr-2 font-medium">Факт</th>
                  <th className="py-1 pr-2 font-medium">Брак</th>
                  <th className="py-1 pr-2 font-medium">Заметка</th>
                  <th className="py-1"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, idx) => (
                  <tr key={r.id ?? `new-${idx}`} className="border-t border-slate-100 dark:border-slate-800">
                    <td className="py-1.5 pr-2">
                      <input
                        value={r.colorName}
                        onChange={(e) => updateRow(idx, { colorName: e.target.value })}
                        className="h-11 w-full rounded-lg border border-slate-300 px-2 dark:border-slate-600 dark:bg-slate-900"
                      />
                    </td>
                    <td className="py-1.5 pr-2">
                      <input
                        value={r.size}
                        onChange={(e) => updateRow(idx, { size: e.target.value })}
                        className="h-11 w-16 rounded-lg border border-slate-300 px-2 dark:border-slate-600 dark:bg-slate-900"
                      />
                    </td>
                    <td className="py-1.5 pr-2 text-slate-500">{r.plannedQty}</td>
                    <td className="py-1.5 pr-2">
                      <input
                        type="number"
                        inputMode="numeric"
                        min={0}
                        value={r.factQty}
                        onChange={(e) => updateRow(idx, { factQty: e.target.value })}
                        className="h-11 w-20 rounded-lg border border-slate-300 px-2 dark:border-slate-600 dark:bg-slate-900"
                      />
                    </td>
                    <td className="py-1.5 pr-2">
                      <input
                        type="number"
                        inputMode="numeric"
                        min={0}
                        value={r.defectQty}
                        onChange={(e) => updateRow(idx, { defectQty: e.target.value })}
                        className="h-11 w-20 rounded-lg border border-slate-300 px-2 dark:border-slate-600 dark:bg-slate-900"
                      />
                    </td>
                    <td className="py-1.5 pr-2">
                      <input
                        value={r.note}
                        onChange={(e) => updateRow(idx, { note: e.target.value })}
                        className="h-11 w-full rounded-lg border border-slate-300 px-2 dark:border-slate-600 dark:bg-slate-900"
                      />
                    </td>
                    <td className="py-1.5">
                      <button
                        type="button"
                        onClick={() => removeRow(idx)}
                        className="text-xs text-slate-400 hover:text-rose-600 dark:hover:text-rose-400"
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <button
            type="button"
            onClick={addRow}
            className="rounded-lg border border-dashed border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-400 dark:hover:bg-slate-800"
          >
            + Строка (фабрика сшила другой размер)
          </button>

          {/* Итоги */}
          <div className="flex flex-wrap gap-x-4 gap-y-1 rounded-xl bg-slate-50 p-3 text-sm dark:bg-slate-800/60">
            <span className="text-slate-600 dark:text-slate-300">Принято: <b>{totals.good}</b></span>
            <span className="text-rose-600 dark:text-rose-400">Брак: <b>{totals.defect}</b></span>
            <span className="text-amber-600 dark:text-amber-400">Недостача: <b>{totals.shortage}</b></span>
            <span className="text-slate-400">План: {totals.planned}</span>
          </div>

          {error ? <p className="text-xs text-rose-600 dark:text-rose-400">{error}</p> : null}

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => saveReceipt(false)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              {busy ? "…" : "Сохранить"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => saveReceipt(true)}
              className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
            >
              {busy ? "…" : "Завершить приёмку партии"}
            </button>
            <button
              type="button"
              onClick={() => {
                setReceiving(false);
                setRows(batch.items.map(toRow));
                setDeletedIds([]);
                setError(null);
              }}
              className="rounded-lg px-3 py-2 text-sm text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
            >
              Отмена
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
