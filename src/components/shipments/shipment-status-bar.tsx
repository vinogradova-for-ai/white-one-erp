"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ShipmentStatus } from "@prisma/client";
import { SHIPMENT_STATUS_LABELS } from "@/lib/constants";

// Кнопки смены статуса поставки. Порядок: DRAFT → IN_TRANSIT → ARRIVED → RECEIVED.
// Выезд (IN_TRANSIT) двигает заказы вперёд по циклу (на бэке).
const NEXT: Partial<Record<ShipmentStatus, ShipmentStatus>> = {
  DRAFT: "IN_TRANSIT",
  IN_TRANSIT: "ARRIVED",
  ARRIVED: "RECEIVED",
};

const ACTION_LABEL: Partial<Record<ShipmentStatus, string>> = {
  IN_TRANSIT: "Отправить в путь",
  ARRIVED: "Отметить прибытие",
  RECEIVED: "Закрыть поставку",
};

export function ShipmentStatusBar({
  shipmentId,
  status,
}: {
  shipmentId: string;
  status: ShipmentStatus;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const next = NEXT[status];

  async function move(to: ShipmentStatus) {
    setBusy(true);
    try {
      const res = await fetch(`/api/shipments/${shipmentId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: to }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data?.error?.message ?? "Не удалось сменить статус");
        return;
      }
      router.refresh();
    } catch {
      alert("Сеть недоступна, попробуйте ещё раз");
    } finally {
      setBusy(false);
    }
  }

  if (!next) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-white p-3 dark:bg-slate-900">
      <span className="text-sm text-slate-500 dark:text-slate-400">
        Статус: {SHIPMENT_STATUS_LABELS[status]}
      </span>
      <button
        type="button"
        disabled={busy}
        onClick={() => move(next)}
        className="ml-auto rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
      >
        {busy ? "…" : ACTION_LABEL[next]}
      </button>
    </div>
  );
}
