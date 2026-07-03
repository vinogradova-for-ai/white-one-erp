"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

// Денежная задача на главной с действиями на месте (П3 UX-аудита):
// «Оплачено» — тот же роут, что кнопка «Оплачен» на /payments;
// «＋7 дней» — перенос plannedDate без ухода со страницы.
export function MoneyTaskRow({
  text,
  href,
  paymentId,
  plannedDate,
  overdue,
  canMarkPaid,
  canPostpone,
  dot,
}: {
  text: string;
  href: string;
  paymentId: string;
  plannedDate: string; // yyyy-mm-dd
  overdue: boolean;
  canMarkPaid: boolean;
  canPostpone: boolean;
  dot: React.ReactNode;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function markPaid() {
    setBusy(true);
    try {
      const res = await fetch(`/api/payments/${paymentId}/mark-paid`, { method: "POST" });
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

  async function postpone() {
    setBusy(true);
    try {
      const base = new Date(`${plannedDate}T00:00:00Z`);
      const next = new Date(base.getTime() + 7 * 86_400_000).toISOString().slice(0, 10);
      const res = await fetch(`/api/payments/${paymentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plannedDate: next }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        alert(j?.error?.message ?? "Не удалось перенести срок");
      } else {
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <li>
      <div className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm hover:bg-slate-50">
        {dot}
        <Link
          href={href}
          className={`min-w-0 flex-1 ${overdue ? "font-medium text-red-700 dark:text-red-300" : "text-slate-800"}`}
        >
          {text}
        </Link>
        {(canMarkPaid || canPostpone) && (
          <span className="flex shrink-0 gap-1.5">
            {canMarkPaid && (
              <button
                onClick={markPaid}
                disabled={busy}
                className="inline-flex min-h-[36px] items-center rounded-lg bg-green-600 px-3 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50"
              >
                Оплачено
              </button>
            )}
            {canPostpone && (
              <button
                onClick={postpone}
                disabled={busy}
                title="Перенести плановую дату на неделю"
                className="inline-flex min-h-[36px] items-center rounded-lg border border-slate-300 bg-white px-3 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-50"
              >
                ＋7 дней
              </button>
            )}
          </span>
        )}
      </div>
    </li>
  );
}
