"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

// Упаковка в поставке: заказы упаковки едут тем же карго, что и одежда
// (лист КАРГО: сумки, бирки, плечики, чехлы). Привязка/отвязка + переход в заказ.
export type PkgInShipment = {
  id: string;
  orderNumber: string;
  itemNames: string; // «Сумки для пальто, бирки (+2)»
  statusLabel: string;
  statusCls: string;
};
export type PkgCandidate = { id: string; orderNumber: string; itemNames: string };

export function ShipmentPackagingSection({
  shipmentId,
  attached,
  candidates,
  canManage,
}: {
  shipmentId: string;
  attached: PkgInShipment[];
  candidates: PkgCandidate[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [pick, setPick] = useState("");
  const [busy, setBusy] = useState(false);

  async function call(method: "POST" | "DELETE", packagingOrderId: string) {
    setBusy(true);
    try {
      const res = await fetch(`/api/shipments/${shipmentId}/packaging-orders`, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ packagingOrderId }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        alert(j?.error?.message ?? "Не получилось");
        return;
      }
      setPick("");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  if (attached.length === 0 && (!canManage || candidates.length === 0)) return null;

  return (
    <section className="space-y-2">
      <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
        Упаковка в этой поставке {attached.length > 0 && <span className="text-sm font-normal text-slate-400">📦 {attached.length}</span>}
      </h2>

      {attached.length > 0 && (
        <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl bg-white dark:divide-slate-800 dark:bg-slate-900">
          {attached.map((p) => (
            <li key={p.id} className="flex items-center gap-3 px-4 py-3">
              <Link href={`/packaging-orders/${p.id}`} className="min-w-0 flex-1 hover:underline">
                <span className="font-mono text-xs text-slate-500">{p.orderNumber}</span>
                <span className="ml-2 text-sm text-slate-900 dark:text-slate-100">📦 {p.itemNames}</span>
              </Link>
              <span className={`shrink-0 rounded px-2 py-0.5 text-xs ${p.statusCls}`}>{p.statusLabel}</span>
              {canManage && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => call("DELETE", p.id)}
                  className="shrink-0 rounded-lg border border-slate-300 px-2.5 py-1 text-xs text-slate-500 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600"
                  title="Убрать из поставки"
                >
                  Убрать
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {canManage && candidates.length > 0 && (
        <div className="flex flex-col gap-2 rounded-2xl bg-white p-4 sm:flex-row dark:bg-slate-900">
          <select
            value={pick}
            onChange={(e) => setPick(e.target.value)}
            className="h-11 flex-1 rounded-lg border border-slate-300 px-3 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
          >
            <option value="">Добавить заказ упаковки…</option>
            {candidates.map((c) => (
              <option key={c.id} value={c.id}>
                {c.orderNumber} · {c.itemNames}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={busy || !pick}
            onClick={() => call("POST", pick)}
            className="h-11 rounded-lg bg-slate-900 px-4 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900"
          >
            {busy ? "Добавляю…" : "Добавить"}
          </button>
        </div>
      )}
    </section>
  );
}
