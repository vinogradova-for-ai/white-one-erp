"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

export function InlineDateField({
  label,
  value,
  endpoint,
  field,
}: {
  label: string;
  value: Date | string | null | undefined;
  endpoint: string;
  field: string;
}) {
  const router = useRouter();
  const initial = value ? new Date(value).toISOString().slice(0, 10) : "";
  const [date, setDate] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState(false);

  async function save(newVal: string) {
    setError(null);
    setSaving(true);
    try {
      const res = await fetch(endpoint, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: newVal || null }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        const msg = j?.error?.message ?? "Не удалось сохранить";
        setError(msg);
        toast.error(`${label}: ${msg}`);
        return;
      }
      toast.success(`${label} сохранено`);
      setFlash(true);
      setTimeout(() => setFlash(false), 700);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  const borderCls = error
    ? "border-red-400 ring-1 ring-red-300"
    : flash
    ? "border-emerald-400 ring-1 ring-emerald-300"
    : "border-slate-300";

  return (
    <label className="flex items-start justify-between gap-3 text-sm">
      <span className="pt-1 text-slate-600">{label}:</span>
      <div className="flex flex-col items-end gap-1">
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={date}
            onChange={(e) => {
              setDate(e.target.value);
              save(e.target.value);
            }}
            disabled={saving}
            className={`rounded-lg border bg-white px-3 py-1 text-sm transition-colors ${borderCls}`}
          />
          {saving && <span className="text-xs text-slate-400">…</span>}
        </div>
        {error && <div className="max-w-[200px] text-right text-[11px] leading-tight text-red-600">{error}</div>}
      </div>
    </label>
  );
}
