"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Инвентаризация упаковки: довести остаток Китай/Москва до факта (движение
// «инвентаризация» в журнале). Мини-товарный учёт, Алёна 17.07.
export function PackagingStockInventory({
  packagingItemId,
  cn,
  msk,
}: {
  packagingItemId: string;
  cn: number;
  msk: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [warehouse, setWarehouse] = useState<"CN" | "MSK">("CN");
  const [qty, setQty] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      const res = await fetch(`/api/packaging/${packagingItemId}/adjust`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ warehouse, actualQty: Number(qty), note: note || null }),
      });
      if (!res.ok) {
        alert((await res.json().catch(() => ({})))?.error?.message ?? "Не получилось сохранить");
        return;
      }
      setOpen(false);
      setQty("");
      setNote("");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
      >
        Инвентаризация
      </button>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 p-2 dark:border-slate-700">
      <select
        value={warehouse}
        onChange={(e) => setWarehouse(e.target.value as "CN" | "MSK")}
        className="h-9 rounded-lg border border-slate-300 px-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
      >
        <option value="CN">Китай (сейчас {cn.toLocaleString("ru-RU")})</option>
        <option value="MSK">Москва (сейчас {msk.toLocaleString("ru-RU")})</option>
      </select>
      <input
        value={qty}
        onChange={(e) => setQty(e.target.value)}
        placeholder="по факту, шт"
        inputMode="numeric"
        className="h-9 w-28 rounded-lg border border-slate-300 px-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
      />
      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="комментарий"
        className="h-9 w-44 rounded-lg border border-slate-300 px-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
      />
      <button
        type="button"
        disabled={busy || qty.trim() === ""}
        onClick={save}
        className="h-9 rounded-lg bg-slate-900 px-3 text-sm font-medium text-white disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900"
      >
        {busy ? "…" : "Сохранить"}
      </button>
      <button type="button" onClick={() => setOpen(false)} className="text-xs text-slate-400 underline">
        отмена
      </button>
    </div>
  );
}
