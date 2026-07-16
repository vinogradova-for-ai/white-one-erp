"use client";

import { useRef, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { PRODUCT_MODEL_STATUS_LABELS, PRODUCT_MODEL_STATUS_COLORS } from "@/lib/constants";
import type { ProductModelStatus } from "@prisma/client";

// Бейдж этапа фасона в шапке карточки + смена этапа на месте (топ-10 UX-аудита).
// В каталоге бейдж уже был, в карточке — не было. Смена идёт через тот же
// эндпоинт, что drag на канбане (kanban-stage): те же права и защиты.
const STAGES: Array<{ key: string; label: string }> = [
  { key: "idea", label: "Идея" },
  { key: "sample", label: "Образец" },
  { key: "ideal_sample", label: "Утверждён" },
  { key: "sizing_done", label: "Утверждён + сетка готова" },
];

export function ModelStageBadge({
  modelId,
  status,
  sizeChartReady,
  canEdit,
  hasActiveOrder,
}: {
  modelId: string;
  status: ProductModelStatus;
  sizeChartReady: boolean;
  canEdit: boolean;
  hasActiveOrder: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  async function setStage(key: string) {
    setOpen(false);
    setBusy(true);
    try {
      const res = await fetch(`/api/models/${modelId}/kanban-stage`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetStage: key }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        alert(j?.error?.message ?? "Не удалось сменить этап");
      } else {
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  const label =
    status === "APPROVED" && sizeChartReady
      ? "Утверждён · сетка готова"
      : PRODUCT_MODEL_STATUS_LABELS[status];

  // С активным заказом этап живёт в заказе — смену прячем (эндпоинт всё равно откажет).
  const editable = canEdit && !hasActiveOrder;

  return (
    <div ref={wrapRef} className="relative inline-flex">
      <button
        type="button"
        disabled={!editable || busy}
        onClick={() => editable && setOpen((v) => !v)}
        title={
          hasActiveOrder
            ? "У фасона есть заказ — этап производства меняется в заказе"
            : editable
              ? "Сменить этап"
              : undefined
        }
        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${PRODUCT_MODEL_STATUS_COLORS[status]} ${
          editable ? "cursor-pointer hover:brightness-95" : "cursor-default"
        } disabled:opacity-70`}
      >
        {label}
        {editable && <span className="text-[9px] opacity-70">▾</span>}
      </button>
      {open && (
        <div className="absolute left-0 top-full z-30 mt-1 w-56 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
          {STAGES.map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() => setStage(s.key)}
              className="block w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
            >
              {s.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
