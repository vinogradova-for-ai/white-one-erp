"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PRODUCT_MODEL_STATUS_LABELS, PRODUCT_MODEL_STATUS_COLORS, PRODUCT_MODEL_STATUS_ORDER } from "@/lib/constants";
import { MODEL_TRANSITIONS } from "@/lib/status-machine/product-statuses";
import { ProductModelStatus } from "@prisma/client";
import { StatusSheet, useSheet } from "@/components/common/status-sheet";

export function ModelStatusChanger({
  modelId,
  currentStatus,
}: {
  modelId: string;
  currentStatus: ProductModelStatus;
}) {
  const router = useRouter();
  const { open, openSheet, closeSheet } = useSheet();
  const [isPending, startTransition] = useTransition();
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [savingStatus, setSavingStatus] = useState<ProductModelStatus | null>(null);

  const allowedNext = MODEL_TRANSITIONS[currentStatus];

  async function move(toStatus: ProductModelStatus) {
    setError(null);
    setSavingStatus(toStatus);
    const res = await fetch(`/api/models/${modelId}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ toStatus, comment }),
    });
    setSavingStatus(null);
    if (!res.ok) {
      const j = await res.json();
      setError(j?.error?.message ?? "Ошибка");
      return;
    }
    closeSheet();
    setComment("");
    startTransition(() => router.refresh());
  }

  if (currentStatus === "IN_PRODUCTION") {
    return <span className="text-xs text-slate-400">Разработка завершена</span>;
  }

  return (
    <>
      <button
        onClick={openSheet}
        disabled={isPending}
        className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
      >
        Сменить статус
      </button>

      <StatusSheet open={open} onClose={closeSheet} title="Сменить статус фасона">
        <div className="space-y-3">
          <div>
            <div className="text-xs text-slate-500">Сейчас:</div>
            <span className={`inline-block rounded px-2 py-0.5 text-sm ${PRODUCT_MODEL_STATUS_COLORS[currentStatus]}`}>
              {PRODUCT_MODEL_STATUS_LABELS[currentStatus]}
            </span>
          </div>

          <div className="space-y-2">
            <div className="text-xs font-medium text-slate-600">Перевести в:</div>
            {PRODUCT_MODEL_STATUS_ORDER.filter((s) => s !== currentStatus).map((s) => {
              const isAllowed = allowedNext.includes(s);
              return (
                <button
                  key={s}
                  disabled={!isAllowed || savingStatus !== null}
                  onClick={() => move(s)}
                  className={`flex w-full items-center justify-between rounded-lg border px-4 py-3 text-left text-sm transition ${
                    isAllowed
                      ? "border-slate-200 bg-white text-slate-900 hover:border-slate-400 active:bg-slate-100"
                      : "border-slate-100 bg-slate-50 text-slate-400"
                  }`}
                >
                  <span>{PRODUCT_MODEL_STATUS_LABELS[s]}</span>
                  {savingStatus === s && <span className="text-xs text-slate-500">сохраняем…</span>}
                  {isAllowed && savingStatus !== s && <span className="text-slate-400">→</span>}
                </button>
              );
            })}
          </div>

          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Комментарий (опционально)"
            rows={2}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />

          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
      </StatusSheet>
    </>
  );
}
