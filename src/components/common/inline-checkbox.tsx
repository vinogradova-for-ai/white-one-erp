"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

/**
 * Чекбокс, который сразу сохраняет изменение на сервер.
 * Показывает loader рядом с лейблом на время запроса.
 */
export function InlineCheckbox({
  label,
  checked,
  endpoint,
  field,
  disabled,
}: {
  label: string;
  checked: boolean;
  endpoint: string;       // e.g. /api/orders/abc123
  field: string;          // e.g. "packagingOrdered"
  disabled?: boolean;
}) {
  const router = useRouter();
  const [value, setValue] = useState(checked);
  const [saving, setSaving] = useState(false);
  const [, startTransition] = useTransition();

  async function toggle() {
    if (saving || disabled) return;
    const newValue = !value;
    setValue(newValue);
    setSaving(true);
    try {
      const res = await fetch(endpoint, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: newValue }),
      });
      if (!res.ok) {
        setValue(!newValue); // откат
        const j = await res.json().catch(() => ({}));
        alert(j?.error?.message ?? "Не удалось сохранить");
        return;
      }
      startTransition(() => router.refresh());
    } finally {
      setSaving(false);
    }
  }

  return (
    <label className={`flex cursor-pointer items-center gap-2 text-sm ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}>
      <input
        type="checkbox"
        checked={value}
        onChange={toggle}
        disabled={disabled || saving}
        className="h-4 w-4 rounded border-slate-300"
      />
      <span className="text-slate-700">{label}</span>
      {saving && <span className="text-xs text-slate-400">сохраняем…</span>}
    </label>
  );
}
