"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Разовое списание упаковки по уже отгруженным заказам (правка Алёны №4).
export function ConsumeShippedButton({ totalQty, rows }: { totalQty: number; rows: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function run() {
    if (
      !confirm(
        `Списать ${totalQty.toLocaleString("ru-RU")} шт упаковки по ${rows} строкам отгруженных заказов?\n\n` +
          "Если вы уже поправили остаток какой-то позиции руками — сначала проверьте его, чтобы не списать дважды. Действие идемпотентно: повторный клик ничего не спишет.",
      )
    )
      return;
    setBusy(true);
    try {
      const res = await fetch("/api/packaging/consume-shipped", { method: "POST" });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        alert(j?.error?.message ?? "Не удалось списать");
      } else {
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      onClick={run}
      disabled={busy}
      className="inline-flex min-h-[36px] items-center rounded-lg bg-amber-600 px-3 text-xs font-medium text-white hover:bg-amber-700 disabled:opacity-50"
    >
      {busy ? "Списываю…" : `Списать ${totalQty.toLocaleString("ru-RU")} шт`}
    </button>
  );
}
