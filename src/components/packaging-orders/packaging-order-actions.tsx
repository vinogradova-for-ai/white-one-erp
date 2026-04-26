"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PackagingOrderStatus } from "@prisma/client";
import { PACKAGING_ORDER_STATUS_LABELS } from "@/lib/packaging-orders";

const NEXT_STATUS: Record<PackagingOrderStatus, PackagingOrderStatus | null> = {
  ORDERED: "IN_PRODUCTION",
  IN_PRODUCTION: "IN_TRANSIT",
  IN_TRANSIT: "ARRIVED",
  ARRIVED: null,
  CANCELLED: null,
};

export function PackagingOrderActions({ id, status }: { id: string; status: PackagingOrderStatus }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function changeStatus(to: PackagingOrderStatus) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/packaging-orders/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: to, ...(to === "ARRIVED" ? { arrivedDate: new Date().toISOString() } : {}) }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j?.error?.message ?? "Не удалось обновить");
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!confirm("Удалить заказ упаковки? Платёж и «в производстве» откатятся.")) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/packaging-orders/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        alert(j?.error?.message ?? "Не удалось удалить");
        return;
      }
      router.push("/packaging-orders");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const next = NEXT_STATUS[status];

  return (
    <div className="space-y-2 rounded-2xl border border-slate-200 bg-white p-4">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Действия</h2>
      <div className="flex flex-wrap gap-2">
        {next && (
          <button
            onClick={() => changeStatus(next)}
            disabled={busy}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
          >
            → {PACKAGING_ORDER_STATUS_LABELS[next]}
          </button>
        )}
        {status !== "CANCELLED" && status !== "ARRIVED" && (
          <button
            onClick={() => changeStatus("CANCELLED")}
            disabled={busy}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
          >
            Отменить
          </button>
        )}
        <button
          onClick={remove}
          disabled={busy}
          className="ml-auto rounded-lg border border-red-200 bg-white px-3 py-2 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
        >
          Удалить заказ
        </button>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
