"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

/**
 * Числовое поле с инлайн-сохранением — сохраняет на blur/Enter.
 */
export function InlineNumberField({
  label,
  value,
  endpoint,
  field,
  suffix,
  placeholder,
  step = "0.01",
}: {
  label: string;
  value: string;
  endpoint: string;
  field: string;
  suffix?: string;
  placeholder?: string;
  step?: string;
}) {
  const router = useRouter();
  const [val, setVal] = useState(value);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState(false);

  async function save() {
    if (val === value) return;
    setError(null);
    setSaving(true);
    try {
      const num = val === "" ? null : Number(val);
      const res = await fetch(endpoint, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: num }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        const msg = j?.error?.message ?? "Не удалось сохранить";
        setError(msg);
        setVal(value);
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

  // Цвет рамки: ошибка > flash > обычная
  const borderCls = error
    ? "border-red-400 ring-1 ring-red-300"
    : flash
    ? "border-emerald-400 ring-1 ring-emerald-300"
    : "border-slate-300";

  return (
    <div className="flex items-start justify-between gap-2 text-sm">
      <span className="pt-1 text-slate-600">{label}:</span>
      <div className="flex flex-col items-end gap-1">
        <div className="flex items-center gap-2">
          <input
            type="number"
            step={step}
            value={val}
            onChange={(e) => { setVal(e.target.value); if (error) setError(null); }}
            onBlur={save}
            onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
            placeholder={placeholder}
            disabled={saving}
            className={`w-28 rounded border bg-white px-2 py-1 text-right text-sm transition-colors ${borderCls}`}
          />
          {suffix && <span className="text-xs text-slate-500">{suffix}</span>}
          {saving && <span className="text-xs text-slate-400">…</span>}
        </div>
        {error && <div className="max-w-[200px] text-right text-[11px] leading-tight text-red-600">{error}</div>}
      </div>
    </div>
  );
}
