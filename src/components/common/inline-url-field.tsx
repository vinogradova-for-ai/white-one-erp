"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Поле URL с кнопкой «Сохранить». Появляется при клике «Изменить» или при пустом значении.
 */
export function InlineUrlField({
  label,
  value,
  endpoint,
  field,
}: {
  label: string;
  value: string | null | undefined;
  endpoint: string;
  field: string;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(!value);
  const [url, setUrl] = useState(value ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setError(null);
    if (url && !url.match(/^https?:\/\//)) {
      setError("Ссылка должна начинаться с https://");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(endpoint, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: url || null }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j?.error?.message ?? "Не удалось сохранить");
        return;
      }
      setEditing(false);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  if (!editing) {
    return (
      <div className="flex items-center justify-between gap-2 text-sm">
        <span className="text-slate-600">{label}:</span>
        <div className="flex items-center gap-2">
          {value ? (
            <a href={value} target="_blank" rel="noopener" className="text-blue-600 hover:underline">
              открыть
            </a>
          ) : (
            <span className="text-slate-400">—</span>
          )}
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="rounded px-2 py-0.5 text-xs text-slate-500 hover:bg-slate-100 hover:text-slate-700"
          >
            изменить
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <div className="text-sm text-slate-600">{label}:</div>
      <div className="flex gap-2">
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://..."
          className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm"
        />
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
        >
          {saving ? "…" : "Сохранить"}
        </button>
        {value !== null && value !== undefined && (
          <button
            type="button"
            onClick={() => { setUrl(value ?? ""); setEditing(false); setError(null); }}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700"
          >
            Отмена
          </button>
        )}
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
