"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Баннер «график не совпадает с условиями оплаты» в карточке заказа.
// Кнопка пересчёта удаляет PENDING-платежи и строит график заново по paymentTerms
// (PAID не трогает — так работает /api/orders/[id]/regenerate-payments).
export function PaymentsTermsWarning({
  orderId,
  expectedLabel,
  actualLabel,
  canRegenerate,
  hasPaid,
}: {
  orderId: string;
  expectedLabel: string;
  actualLabel: string;
  canRegenerate: boolean;
  hasPaid: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function regenerate() {
    const warn = hasPaid
      ? "Пересчитать график по условиям? Неоплаченные платежи будут заменены, оплаченные останутся как есть."
      : "Пересчитать график по условиям? Текущие платежи будут заменены.";
    if (!confirm(warn)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/orders/${orderId}/regenerate-payments`, { method: "POST" });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        alert(j?.error?.message ?? "Не удалось пересчитать график");
      } else {
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-300">
      <span>
        ⚠ График не совпадает с условиями оплаты: в шапке «{expectedLabel}», фактически {actualLabel}.
      </span>
      {canRegenerate && (
        <button
          onClick={regenerate}
          disabled={busy}
          className="inline-flex min-h-[36px] items-center rounded-lg border border-amber-400 bg-white px-3 text-xs font-medium text-amber-800 hover:bg-amber-100 disabled:opacity-50 dark:bg-transparent dark:text-amber-300 dark:hover:bg-amber-400/10"
        >
          {busy ? "Пересчитываю…" : `Пересчитать по «${expectedLabel}»`}
        </button>
      )}
    </div>
  );
}
