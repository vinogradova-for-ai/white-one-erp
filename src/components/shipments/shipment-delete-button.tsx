"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Мягкое удаление поставки (только OWNER/DIRECTOR — кнопка скрыта у остальных).
export function ShipmentDeleteButton({ shipmentId }: { shipmentId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function remove() {
    if (!confirm("Удалить поставку? Партии останутся у заказов, но выйдут из этой поставки.")) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/shipments/${shipmentId}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) {
        alert(data?.error?.message ?? "Не удалось удалить");
        setBusy(false);
        return;
      }
      router.push("/shipments");
    } catch {
      alert("Сеть недоступна, попробуйте ещё раз");
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={remove}
      disabled={busy}
      className="rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-medium text-rose-600 hover:bg-rose-50 disabled:opacity-50 dark:border-rose-900 dark:text-rose-400 dark:hover:bg-rose-950/40"
    >
      {busy ? "…" : "Удалить"}
    </button>
  );
}
