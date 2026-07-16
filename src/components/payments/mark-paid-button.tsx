"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Компактная кнопка «Оплачен» для графиков платежей в карточках
// (заказ упаковки и т.п.). Тот же роут, что на /payments.
export function MarkPaidButton({ id }: { id: string }) {
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

  return (
    <button
      onClick={markPaid}
      disabled={busy}
      className="inline-flex min-h-[32px] items-center rounded-lg bg-green-600 px-2.5 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50"
    >
      Оплачен
    </button>
  );
}
