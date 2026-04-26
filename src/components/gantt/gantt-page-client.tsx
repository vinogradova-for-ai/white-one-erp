"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { GanttChart, type GanttRow } from "./gantt-chart";

export function GanttPageClient({ rows }: { rows: GanttRow[] }) {
  const router = useRouter();
  // Буфер изменений: ключ `${orderId}:${endField}` → ISO дата
  const [pending, setPending] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const count = Object.keys(pending).length;

  function handleBarEndChange(orderId: string, endField: string, newEnd: string) {
    setPending((p) => ({ ...p, [`${orderId}:${endField}`]: newEnd }));
  }

  function discard() {
    setPending({});
    setError(null);
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      // Группируем по orderId, чтобы один PATCH на заказ
      const byOrder: Record<string, Record<string, string>> = {};
      for (const [k, v] of Object.entries(pending)) {
        const [orderId, field] = k.split(":");
        if (!byOrder[orderId]) byOrder[orderId] = {};
        byOrder[orderId][field] = v;
      }
      const errors: string[] = [];
      for (const [orderId, fields] of Object.entries(byOrder)) {
        const res = await fetch(`/api/orders/${orderId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(fields),
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          errors.push(`${orderId}: ${j?.error?.message ?? res.status}`);
        }
      }
      if (errors.length > 0) {
        setError(`Ошибки при сохранении: ${errors.join("; ")}`);
        return;
      }
      setPending({});
      startTransition(() => router.refresh());
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3">
      <GanttChart rows={rows} onBarEndChange={handleBarEndChange} pendingChanges={pending} />

      {/* Sticky-панель снизу — появляется если есть изменения в буфере */}
      {count > 0 && (
        <div className="sticky bottom-3 z-30 flex flex-wrap items-center gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-3 shadow-lg">
          <div className="flex-1 text-sm">
            <span className="font-semibold text-amber-900">Несохранённых изменений: {count}</span>
            <div className="text-xs text-amber-800">
              Перетащите ещё или сохраните разом — каждый заказ получит один запрос на обновление.
            </div>
            {error && <div className="mt-1 text-xs text-red-600">{error}</div>}
          </div>
          <button
            type="button"
            onClick={discard}
            disabled={saving}
            className="rounded-lg border border-amber-400 bg-white px-3 py-1.5 text-sm text-amber-900 hover:bg-amber-100 disabled:opacity-50"
          >
            Отменить
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="rounded-lg bg-amber-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
          >
            {saving ? "Сохранение…" : `Сохранить (${count})`}
          </button>
        </div>
      )}
    </div>
  );
}
