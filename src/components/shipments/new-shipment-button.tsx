"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// «+ Поставка» — создаёт черновик поставки и ведёт на её карточку.
export function NewShipmentButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function create() {
    setBusy(true);
    try {
      const res = await fetch("/api/shipments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (res.ok && data.shipment?.id) {
        router.push(`/shipments/${data.shipment.id}`);
      } else {
        alert(data?.error?.message ?? "Не удалось создать поставку");
        setBusy(false);
      }
    } catch {
      alert("Сеть недоступна, попробуйте ещё раз");
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={create}
      disabled={busy}
      className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
    >
      {busy ? "Создаю…" : "+ Карго"}
    </button>
  );
}
