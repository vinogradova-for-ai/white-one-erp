"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

const MONTH_LABELS = [
  "Янв", "Фев", "Мар", "Апр", "Май", "Июн",
  "Июл", "Авг", "Сен", "Окт", "Ноя", "Дек",
];

export type PlanCell = {
  plannedModelCount: number | null;
  plannedQuantity: number | null;
};

function parseInt0(raw: string): number {
  const cleaned = raw.replace(/[^\d]/g, "");
  if (cleaned === "") return 0;
  const n = Number(cleaned);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

export function PlansAdmin({
  year,
  users,
  initialData,
}: {
  year: number;
  users: Array<{ id: string; name: string }>;
  initialData: Record<number, Record<string, PlanCell>>;
}) {
  const router = useRouter();
  const [data, setData] = useState(initialData);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  function cellKey(ym: number, ownerId: string) {
    return `${ym}|${ownerId}`;
  }
  function getCell(ym: number, ownerId: string): PlanCell {
    return data[ym]?.[ownerId] ?? { plannedModelCount: null, plannedQuantity: null };
  }

  async function saveCell(
    ym: number,
    ownerId: string,
    field: "plannedModelCount" | "plannedQuantity",
    raw: string,
  ) {
    const num = parseInt0(raw);
    const current = getCell(ym, ownerId);
    if ((current[field] ?? 0) === num) return; // nothing changed

    const key = cellKey(ym, ownerId);
    setSavingKey(key);
    setErr(null);
    try {
      // отправляем оба значения, чтобы upsert работал корректно
      const next: PlanCell = { ...current, [field]: num === 0 ? null : num };
      const res = await fetch("/api/plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          yearMonth: ym,
          ownerId,
          category: null,
          plannedModelCount: next.plannedModelCount,
          plannedQuantity: next.plannedQuantity,
        }),
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
          [ownerId]: next,
        },
      });
      router.refresh();
    } finally {
      setSavingKey(null);
    }
  }

  // Считаем суммы по месяцу и по ответственному (по выбранным полям)
  function totalByMonth(m: number, field: "plannedModelCount" | "plannedQuantity"): number {
    const ym = year * 100 + m;
    return users.reduce((s, u) => s + (getCell(ym, u.id)[field] ?? 0), 0);
  }
  function totalByOwner(ownerId: string, field: "plannedModelCount" | "plannedQuantity"): number {
    let s = 0;
    for (let m = 1; m <= 12; m++) s += getCell(year * 100 + m, ownerId)[field] ?? 0;
    return s;
  }

  return (
    <div className="space-y-3">
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
                Ответственный
              </th>
              {MONTH_LABELS.map((m) => (
                <th key={m} className="px-2 py-2 text-center text-xs font-semibold uppercase text-slate-500" colSpan={2}>
                  {m}
                </th>
              ))}
              <th className="px-3 py-2 text-center text-xs font-semibold uppercase text-slate-700" colSpan={2}>Σ</th>
            </tr>
            <tr className="bg-slate-50/50">
              <th />
              {MONTH_LABELS.map((m) => (
                <>
                  <th key={`${m}-mc`} className="px-1 py-1 text-right text-[10px] uppercase text-slate-400">фасоны</th>
                  <th key={`${m}-q`} className="px-1 py-1 text-right text-[10px] uppercase text-slate-400">штуки</th>
                </>
              ))}
              <th className="px-1 py-1 text-right text-[10px] uppercase text-slate-500">фасоны</th>
              <th className="px-1 py-1 text-right text-[10px] uppercase text-slate-500">штуки</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {users.map((u) => (
              <tr key={u.id}>
                <td className="sticky left-0 z-10 bg-white px-3 py-2 font-medium text-slate-900">
                  {u.name}
                </td>
                {MONTH_LABELS.map((_, idx) => {
                  const m = idx + 1;
                  const ym = year * 100 + m;
                  const key = cellKey(ym, u.id);
                  const cell = getCell(ym, u.id);
                  return (
                    <>
                      <td key={`${m}-mc`} className="px-1 py-1">
                        <input
                          type="text"
                          inputMode="numeric"
                          defaultValue={cell.plannedModelCount ?? ""}
                          disabled={savingKey === key}
                          onBlur={(e) => saveCell(ym, u.id, "plannedModelCount", e.target.value)}
                          onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
                          className={`w-12 rounded border bg-white px-1.5 py-1 text-right text-xs ${
                            savingKey === key ? "border-amber-300 bg-amber-50" :
                            cell.plannedModelCount ? "border-slate-300" : "border-slate-200 text-slate-400"
                          }`}
                          placeholder="—"
                        />
                      </td>
                      <td key={`${m}-q`} className="px-1 py-1">
                        <input
                          type="text"
                          inputMode="numeric"
                          defaultValue={cell.plannedQuantity ?? ""}
                          disabled={savingKey === key}
                          onBlur={(e) => saveCell(ym, u.id, "plannedQuantity", e.target.value)}
                          onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
                          className={`w-14 rounded border bg-white px-1.5 py-1 text-right text-xs ${
                            savingKey === key ? "border-amber-300 bg-amber-50" :
                            cell.plannedQuantity ? "border-slate-300" : "border-slate-200 text-slate-400"
                          }`}
                          placeholder="—"
                        />
                      </td>
                    </>
                  );
                })}
                <td className="px-1 py-2 text-right text-xs font-semibold text-slate-700">
                  {totalByOwner(u.id, "plannedModelCount") || "—"}
                </td>
                <td className="px-1 py-2 text-right text-xs font-semibold text-slate-700">
                  {totalByOwner(u.id, "plannedQuantity").toLocaleString("ru-RU") || "—"}
                </td>
              </tr>
            ))}
            <tr className="bg-slate-50 font-semibold">
              <td className="sticky left-0 z-10 bg-slate-50 px-3 py-2 text-slate-900">Итого</td>
              {MONTH_LABELS.map((_, idx) => {
                const m = idx + 1;
                const tm = totalByMonth(m, "plannedModelCount");
                const tq = totalByMonth(m, "plannedQuantity");
                return (
                  <>
                    <td key={`tm-${m}`} className="px-1 py-2 text-right text-xs text-slate-900">{tm || "—"}</td>
                    <td key={`tq-${m}`} className="px-1 py-2 text-right text-xs text-slate-900">
                      {tq ? tq.toLocaleString("ru-RU") : "—"}
                    </td>
                  </>
                );
              })}
              <td className="px-1 py-2 text-right text-xs text-slate-900">
                {users.reduce((s, u) => s + totalByOwner(u.id, "plannedModelCount"), 0) || "—"}
              </td>
              <td className="px-1 py-2 text-right text-xs text-slate-900">
                {users.reduce((s, u) => s + totalByOwner(u.id, "plannedQuantity"), 0).toLocaleString("ru-RU") || "—"}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <p className="text-xs text-slate-500">
        Сохранение — автоматически при выходе из ячейки (Tab / Enter / клик в другое место).
        Пустая ячейка или 0 — план не задан.
      </p>
    </div>
  );
}
