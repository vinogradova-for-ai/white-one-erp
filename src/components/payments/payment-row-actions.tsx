"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export function PaymentRowActions({ id, status }: { id: string; status: "PENDING" | "PAID" }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function markPaid() {
    setBusy(true);
    try {
      const res = await fetch(`/api/payments/${id}/mark-paid`, { method: "POST" });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        alert(j?.error?.message ?? "Не удалось отметить оплаченным");
      } else {
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  async function unmarkPaid() {
    if (!confirm("Откатить платёж в статус «Ждёт»?")) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/payments/${id}/mark-paid`, { method: "DELETE" });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        alert(j?.error?.message ?? "Не удалось откатить");
      } else {
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!confirm("Удалить платёж? Действие необратимо.")) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/payments/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        alert(j?.error?.message ?? "Не удалось удалить");
      } else {
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex justify-end gap-1">
      {status === "PENDING" ? (
        <button
          onClick={markPaid}
          disabled={busy}
          className="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50"
        >
          Оплачен
        </button>
      ) : (
        <button
          onClick={unmarkPaid}
          disabled={busy}
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-50"
        >
          Откатить
        </button>
      )}
      <Link
        href={`/payments/${id}/edit`}
        className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50"
      >
        Править
      </Link>
      <button
        onClick={remove}
        disabled={busy}
        className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50"
      >
        ×
      </button>
    </div>
  );
}
