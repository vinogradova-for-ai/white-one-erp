"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Форма приёмки — ввод фактического распределения по размерам.
 * Показывается на карточке заказа, секция «Приёмка».
 */
export function OrderReceivingForm({
  orderId,
  sizes,
  plannedDist,
  actualDist,
  quantity,
}: {
  orderId: string;
  sizes: string[];
  plannedDist: Record<string, number> | null;
  actualDist: Record<string, number> | null;
  quantity: number;
}) {
  const router = useRouter();
  const [values, setValues] = useState<Record<string, number>>(() => {
    const initial: Record<string, number> = {};
    for (const s of sizes) initial[s] = actualDist?.[s] ?? plannedDist?.[s] ?? 0;
    return initial;
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const total = Object.values(values).reduce((a, b) => a + b, 0);
  const diff = total - quantity;

  async function save() {
    setError(null);
    setSaving(true);
    try {
      const res = await fetch(`/api/orders/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sizeDistributionActual: values }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j?.error?.message ?? "Не удалось сохранить");
        return;
      }
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  if (sizes.length === 0) {
    return <p className="text-sm text-slate-500">У фасона не указана размерная сетка</p>;
  }

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200">
              <th className="py-2 text-left text-xs font-semibold text-slate-500">Размер</th>
              {sizes.map((s) => (
                <th key={s} className="px-2 py-2 text-center text-xs font-semibold text-slate-500">{s}</th>
              ))}
              <th className="px-2 py-2 text-center text-xs font-semibold text-slate-500">Сумма</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="py-1 text-xs text-slate-500">План</td>
              {sizes.map((s) => (
                <td key={s} className="px-1 py-1 text-center text-xs text-slate-400">{plannedDist?.[s] ?? 0}</td>
              ))}
              <td className="px-1 py-1 text-center text-xs text-slate-400">{quantity}</td>
            </tr>
            <tr>
              <td className="py-1 text-xs font-medium text-slate-700">Факт</td>
              {sizes.map((s) => (
                <td key={s} className="px-1 py-1">
                  <input
                    type="number"
                    min={0}
                    value={values[s] ?? 0}
                    onChange={(e) => setValues((v) => ({ ...v, [s]: Number(e.target.value) || 0 }))}
                    className="w-14 rounded border border-slate-300 bg-white px-1 py-1 text-center text-sm"
                  />
                </td>
              ))}
              <td className={`px-2 py-1 text-center text-sm font-medium ${diff !== 0 ? "text-amber-700" : "text-emerald-700"}`}>
                {total}
                {diff !== 0 && <div className="text-xs font-normal">({diff > 0 ? "+" : ""}{diff})</div>}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-slate-500">
          {diff === 0 ? "Сумма совпадает с плановым количеством" : diff < 0 ? `Не хватает ${-diff} шт` : `Переизбыток ${diff} шт — возможно, брак или пересортица`}
        </p>
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {saving ? "Сохранение…" : "Сохранить приёмку"}
        </button>
      </div>
    </div>
  );
}
