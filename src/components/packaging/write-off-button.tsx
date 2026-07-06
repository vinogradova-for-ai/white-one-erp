"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Ручное списание со склада упаковки: переупаковка, брак, потеря.
// Причина обязательна — видна потом в «Движениях склада».
export function WriteOffButton({ itemId, stock }: { itemId: string; stock: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [qty, setQty] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    const n = parseInt(qty, 10);
    if (!Number.isFinite(n) || n < 1) {
      setError("Сколько штук списать?");
      return;
    }
    if (!reason.trim()) {
      setError("На что списываем? Например: переупаковка брюки Мокка");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/packaging/${itemId}/write-off`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ qty: n, reason: reason.trim() }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j?.error?.message ?? "Не удалось списать");
      } else {
        setOpen(false);
        setQty("");
        setReason("");
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="inline-flex min-h-[36px] items-center rounded-lg border border-slate-300 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-50"
      >
        − Списать вручную
      </button>
    );
  }

  return (
    <div className="w-full rounded-xl border border-slate-300 bg-white p-3">
      <div className="text-xs font-semibold text-slate-700">Списание со склада (переупаковка, брак…)</div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <input
          type="number"
          min={1}
          max={stock}
          value={qty}
          onChange={(e) => setQty(e.target.value)}
          placeholder="шт"
          className="h-10 w-24 rounded-lg border border-slate-300 px-2 text-sm"
          autoFocus
        />
        <input
          type="text"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="На что списываем — например: переупаковка Мокка"
          className="h-10 min-w-0 flex-1 rounded-lg border border-slate-300 px-2 text-sm"
        />
        <button
          onClick={submit}
          disabled={busy}
          className="inline-flex h-10 items-center rounded-lg bg-slate-900 px-3 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {busy ? "Списываю…" : "Списать"}
        </button>
        <button
          onClick={() => {
            setOpen(false);
            setError(null);
          }}
          className="inline-flex h-10 items-center rounded-lg px-2 text-xs text-slate-500 hover:text-slate-700"
        >
          Отмена
        </button>
      </div>
      {error && <div className="mt-1.5 text-xs text-red-600">{error}</div>}
    </div>
  );
}
