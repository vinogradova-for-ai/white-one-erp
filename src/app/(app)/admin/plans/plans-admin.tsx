"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

const MONTH_LABELS = [
  "Янв", "Фев", "Мар", "Апр", "Май", "Июн",
  "Июл", "Авг", "Сен", "Окт", "Ноя", "Дек",
];

function formatThousands(n: number): string {
  if (n === 0) return "";
  return n.toLocaleString("ru-RU");
}

export function PlansAdmin({
  year,
  categories,
  initialData,
}: {
  year: number;
  categories: string[];
  initialData: Record<number, Record<string, number>>;
}) {
  const router = useRouter();
  const [data, setData] = useState(initialData);
  const [savingCell, setSavingCell] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  function cellKey(ym: number, cat: string) {
    return `${ym}|${cat}`;
  }
  function getValue(ym: number, cat: string): number {
    return data[ym]?.[cat] ?? 0;
  }

  async function saveCell(ym: number, cat: string, raw: string) {
    // Парсим число, игнорируя пробелы и не-цифры
    const cleaned = raw.replace(/[^\d.,-]/g, "").replace(",", ".");
    const num = cleaned === "" || cleaned === "-" ? 0 : Number(cleaned);
    if (!Number.isFinite(num) || num < 0) {
      setErr("Сумма должна быть неотрицательным числом");
      return;
    }
    const key = cellKey(ym, cat);
    setSavingCell(key);
    setErr(null);
    try {
      const res = await fetch("/api/plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ yearMonth: ym, category: cat, plannedRevenue: num }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setErr(j?.error?.message ?? "Не удалось сохранить");
        return;
      }
      setData({
        ...data,
        [ym]: {
          ...(data[ym] ?? {}),
          [cat]: num,
        },
      });
      router.refresh();
    } finally {
      setSavingCell(null);
    }
  }

  const totalByMonth = (m: number) => {
    const ym = year * 100 + m;
    return categories.reduce((s, c) => s + getValue(ym, c), 0);
  };
  const totalByCategory = (cat: string) => {
    let s = 0;
    for (let m = 1; m <= 12; m++) s += getValue(year * 100 + m, cat);
    return s;
  };
  const grandTotal = categories.reduce((s, c) => s + totalByCategory(c), 0);

  return (
    <div className="space-y-3">
      {/* Переключатель года */}
      <div className="flex items-center gap-2 text-sm">
        <span className="text-slate-500">Год:</span>
        {[year - 1, year, year + 1].map((y) => (
          <Link
            key={y}
            href={`/admin/plans?year=${y}`}
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              y === year ? "bg-slate-900 text-white" : "bg-white text-slate-700 border border-slate-300"
            }`}
          >
            {y}
          </Link>
        ))}
      </div>

      {err && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{err}</div>}

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="sticky left-0 z-10 bg-slate-50 px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500">
                Категория
              </th>
              {MONTH_LABELS.map((m) => (
                <th key={m} className="px-2 py-2 text-right text-xs font-semibold uppercase text-slate-500">
                  {m}
                </th>
              ))}
              <th className="px-3 py-2 text-right text-xs font-semibold uppercase text-slate-700">Σ</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {categories.map((cat) => (
              <tr key={cat}>
                <td className="sticky left-0 z-10 bg-white px-3 py-2 font-medium text-slate-900">
                  {cat}
                </td>
                {MONTH_LABELS.map((_, idx) => {
                  const m = idx + 1;
                  const ym = year * 100 + m;
                  const key = cellKey(ym, cat);
                  const val = getValue(ym, cat);
                  return (
                    <td key={m} className="px-1 py-1">
                      <input
                        type="text"
                        inputMode="decimal"
                        defaultValue={formatThousands(val)}
                        disabled={savingCell === key}
                        onBlur={(e) => {
                          if (e.target.value === formatThousands(val)) return;
                          saveCell(ym, cat, e.target.value);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") e.currentTarget.blur();
                        }}
                        className={`w-24 rounded border bg-white px-2 py-1 text-right text-xs ${
                          savingCell === key
                            ? "border-amber-300 bg-amber-50"
                            : val > 0
                              ? "border-slate-300"
                              : "border-slate-200 text-slate-400"
                        }`}
                        placeholder="—"
                      />
                    </td>
                  );
                })}
                <td className="px-3 py-2 text-right text-xs font-semibold text-slate-700">
                  {totalByCategory(cat) > 0 ? formatThousands(totalByCategory(cat)) : "—"}
                </td>
              </tr>
            ))}
            <tr className="bg-slate-50 font-semibold">
              <td className="sticky left-0 z-10 bg-slate-50 px-3 py-2 text-slate-900">Итого</td>
              {MONTH_LABELS.map((_, idx) => {
                const m = idx + 1;
                const t = totalByMonth(m);
                return (
                  <td key={m} className="px-2 py-2 text-right text-xs text-slate-900">
                    {t > 0 ? formatThousands(t) : "—"}
                  </td>
                );
              })}
              <td className="px-3 py-2 text-right text-xs text-slate-900">
                {grandTotal > 0 ? formatThousands(grandTotal) : "—"}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <p className="text-xs text-slate-500">
        Сохранение — автоматически при выходе из ячейки (Tab / Enter / клик в другое место).
        Введите 0 или пусто, чтобы удалить план для месяца+категории.
      </p>
    </div>
  );
}
