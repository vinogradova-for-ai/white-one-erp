"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

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

  async function save(newVal: string) {
    setSaving(true);
    try {
      const res = await fetch(endpoint, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: newVal || null }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        alert(j?.error?.message ?? "Не удалось сохранить");
        return;
      }
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <label className="flex items-center justify-between gap-3 text-sm">
      <span className="text-slate-600">{label}:</span>
      <div className="flex items-center gap-2">
        <input
          type="date"
          value={date}
          onChange={(e) => {
            setDate(e.target.value);
            save(e.target.value);
          }}
          disabled={saving}
          className="rounded-lg border border-slate-300 bg-white px-3 py-1 text-sm"
        />
        {saving && <span className="text-xs text-slate-400">…</span>}
      </div>
    </label>
  );
}
