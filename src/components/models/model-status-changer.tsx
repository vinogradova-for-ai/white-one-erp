"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PRODUCT_MODEL_STATUS_LABELS, PRODUCT_MODEL_STATUS_ORDER } from "@/lib/constants";
import { MODEL_TRANSITIONS } from "@/lib/status-machine/product-statuses";
import { ProductModelStatus } from "@prisma/client";

export function ModelStatusChanger({
  modelId,
  currentStatus,
}: {
  modelId: string;
  currentStatus: ProductModelStatus;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);

  const allowedNext = MODEL_TRANSITIONS[currentStatus];

  async function move(toStatus: ProductModelStatus) {
    setError(null);
    const res = await fetch(`/api/models/${modelId}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ toStatus, comment }),
    });
    if (!res.ok) {
      const j = await res.json();
      setError(j?.error?.message ?? "Ошибка");
      return;
    }
    setOpen(false);
    setComment("");
    startTransition(() => router.refresh());
  }

  if (currentStatus === "IN_PRODUCTION") {
    return <span className="text-xs text-slate-400">Разработка завершена</span>;
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        disabled={isPending}
        className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
      >
        Сменить статус
      </button>
      {open && (
        <div className="absolute right-0 z-10 mt-2 w-72 rounded-xl border border-slate-200 bg-white p-3 shadow-lg">
          <p className="mb-2 text-xs text-slate-500">Выберите следующий статус:</p>
          <div className="mb-3 space-y-1">
            {PRODUCT_MODEL_STATUS_ORDER.filter((s) => s !== currentStatus).map((s) => {
              const isAllowed = allowedNext.includes(s);
              return (
                <button
                  key={s}
                  disabled={!isAllowed}
                  onClick={() => move(s)}
                  className={`block w-full rounded-lg px-3 py-2 text-left text-sm ${
                    isAllowed ? "bg-slate-100 text-slate-900 hover:bg-slate-200" : "text-slate-400"
                  }`}
                >
                  {PRODUCT_MODEL_STATUS_LABELS[s]}
                </button>
              );
            })}
          </div>
          <input
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Комментарий (опционально)"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        </div>
      )}
    </div>
  );
}
