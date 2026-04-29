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
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex items-center justify-between gap-2 text-sm">
      <span className="text-slate-600">{label}:</span>
      <div className="flex items-center gap-2">
        <input
          type="number"
          step={step}
          value={val}
          onChange={(e) => setVal(e.target.value)}
          onBlur={save}
          onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
          placeholder={placeholder}
          disabled={saving}
          className="w-28 rounded border border-slate-300 bg-white px-2 py-1 text-right text-sm"
        />
        {suffix && <span className="text-xs text-slate-500">{suffix}</span>}
        {saving && <span className="text-xs text-slate-400">…</span>}
        {error && <span className="text-xs text-red-600" title={error}>✗</span>}
      </div>
    </div>
  );
}
