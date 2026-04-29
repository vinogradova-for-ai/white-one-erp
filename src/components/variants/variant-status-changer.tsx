"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { PRODUCT_VARIANT_STATUS_LABELS, PRODUCT_VARIANT_STATUS_COLORS } from "@/lib/constants";
import { ProductVariantStatus } from "@prisma/client";
import { VARIANT_TRANSITIONS } from "@/lib/status-machine/product-statuses";

type Status = ProductVariantStatus;

export function VariantStatusChanger({
  variantId,
  currentStatus,
}: {
  variantId: string;
  currentStatus: Status;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>(currentStatus);
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const allowedNext = VARIANT_TRANSITIONS[status] ?? [];

  async function change(next: Status) {
    if (next === status) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/variants/${variantId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ status: next }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        const msg = j?.error?.message ?? "Не удалось сменить статус";
        setError(msg);
        toast.error(`Статус: ${msg}`);
        return;
      }
      toast.success(`Статус → ${PRODUCT_VARIANT_STATUS_LABELS[next]}`);
      setStatus(next);
      setOpen(false);
      startTransition(() => router.refresh());
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="relative inline-flex items-center gap-2">
      <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${PRODUCT_VARIANT_STATUS_COLORS[status]}`}>
        {PRODUCT_VARIANT_STATUS_LABELS[status]}
      </span>
      {allowedNext.length > 0 && (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          disabled={saving || pending}
          className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs hover:bg-slate-50 disabled:opacity-50"
        >
          Сменить статус
        </button>
      )}
      {open && (
        <div className="absolute left-0 top-full z-10 mt-1 min-w-[200px] rounded-lg border border-slate-200 bg-white p-1 shadow-lg">
          {allowedNext.map((next) => (
            <button
              key={next}
              type="button"
              onClick={() => change(next)}
              disabled={saving}
              className="block w-full rounded px-3 py-1.5 text-left text-sm hover:bg-slate-50 disabled:opacity-50"
            >
              → {PRODUCT_VARIANT_STATUS_LABELS[next]}
            </button>
          ))}
        </div>
      )}
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}
