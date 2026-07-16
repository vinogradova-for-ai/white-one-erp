"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatNumber } from "@/lib/format";

// Раскидка стоимости карго по весу (Алёна, прожарка 15-16.07.2026).
// Сервер посчитал — здесь показ + правка веса строки (поправка руками).
export type AllocationRow = {
  key: string;              // "batch:<id>" | "pkg:<id>"
  kind: "batch" | "packaging";
  label: string;
  href: string;
  qty: number;
  autoWeightKg: number | null;
  overrideWeightKg: number | null;
  effectiveWeightKg: number | null;
  amountRub: number | null;
  perUnitRub: number | null;
};

export type AllocationSummary = {
  totalUsd: number;
  rate: number;
  rateIsFixed: boolean;
  totalRub: number;
  sumLinesWeightKg: number;
  waybillWeightKg: number | null;
  weightMismatchKg: number | null;
  hasLinesWithoutWeight: boolean;
};

export type MissingWeightHint = { label: string; href: string };

const cellCls = "px-3 py-2 text-sm";

export function ShipmentCostAllocation({
  rows,
  summary,
  missingWeights,
  canManage,
}: {
  rows: AllocationRow[];
  summary: AllocationSummary;
  missingWeights: MissingWeightHint[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busyKey, setBusyKey] = useState<string | null>(null);

  async function saveOverride(row: AllocationRow) {
    const raw = drafts[row.key];
    if (raw === undefined) return;
    const val = raw.trim() === "" ? null : Number(raw.replace(",", "."));
    if (val !== null && !Number.isFinite(val)) return;
    setBusyKey(row.key);
    try {
      const id = row.key.split(":")[1];
      const url = row.kind === "batch" ? `/api/batches/${id}` : `/api/packaging-orders/${id}`;
      const res = await fetch(url, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weightKgOverride: val }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        alert(j?.error?.message ?? "Не удалось сохранить вес");
        return;
      }
      setDrafts((d) => {
        const { [row.key]: _drop, ...rest } = d;
        return rest;
      });
      router.refresh();
    } finally {
      setBusyKey(null);
    }
  }

  const mismatchNotable =
    summary.weightMismatchKg != null &&
    summary.waybillWeightKg != null &&
    summary.waybillWeightKg > 0 &&
    summary.weightMismatchKg / summary.waybillWeightKg > 0.03; // >3% — подсвечиваем

  return (
    <div className="space-y-3 rounded-2xl bg-white p-4 dark:bg-slate-900">
      {/* Шапка: сумма, курс, вес */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-600 dark:text-slate-300">
        <span>
          Итог накладной: <b>{formatNumber(summary.totalUsd)} $</b> ×{" "}
          {summary.rate > 0 ? `${summary.rate} ₽/$` : "курс недоступен"} ={" "}
          <b>{summary.rate > 0 ? `${formatNumber(summary.totalRub)} ₽` : "—"}</b>
        </span>
        <span
          className={`rounded px-2 py-0.5 text-xs ${
            summary.rateIsFixed
              ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-300"
              : "bg-amber-50 text-amber-700 dark:bg-amber-400/10 dark:text-amber-300"
          }`}
        >
          {summary.rateIsFixed ? "курс зафиксирован оплатой" : "предварительно, курс на сегодня"}
        </span>
      </div>

      {/* Предупреждения */}
      {summary.hasLinesWithoutWeight && (
        <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-400/10 dark:text-red-300">
          Раскидка неполная: у части строк нет веса. Заполните вес штуки:{" "}
          {missingWeights.map((m, i) => (
            <span key={m.href}>
              {i > 0 && ", "}
              <Link href={m.href} className="underline">
                {m.label}
              </Link>
            </span>
          ))}
        </div>
      )}
      {mismatchNotable && (
        <div className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700 dark:bg-amber-400/10 dark:text-amber-300">
          Вес строк ({formatNumber(summary.sumLinesWeightKg)} кг) расходится с брутто накладной (
          {formatNumber(summary.waybillWeightKg ?? 0)} кг) на {formatNumber(summary.weightMismatchKg ?? 0)} кг — проверьте веса
          или поправьте строку руками.
        </div>
      )}

      {/* Таблица строк */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px]">
          <thead>
            <tr className="border-b border-slate-100 text-left text-[11px] uppercase tracking-wider text-slate-400 dark:border-slate-800">
              <th className={cellCls}>Что едет</th>
              <th className={`${cellCls} text-right`}>Штук</th>
              <th className={`${cellCls} text-right`}>Вес, кг</th>
              <th className={`${cellCls} text-right`}>Доля ₽</th>
              <th className={`${cellCls} text-right`}>₽/шт</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
            {rows.map((r) => {
              const draft = drafts[r.key];
              const shown =
                draft !== undefined
                  ? draft
                  : r.overrideWeightKg != null
                    ? String(r.overrideWeightKg)
                    : "";
              return (
                <tr key={r.key}>
                  <td className={cellCls}>
                    <Link href={r.href} className="text-slate-800 hover:underline dark:text-slate-100">
                      {r.kind === "packaging" ? "📦 " : ""}
                      {r.label}
                    </Link>
                  </td>
                  <td className={`${cellCls} text-right tabular-nums`}>{formatNumber(r.qty)}</td>
                  <td className={`${cellCls} text-right`}>
                    {canManage ? (
                      <span className="inline-flex items-center gap-1">
                        <input
                          value={shown}
                          placeholder={r.autoWeightKg != null ? String(r.autoWeightKg) : "—"}
                          onChange={(e) => setDrafts((d) => ({ ...d, [r.key]: e.target.value }))}
                          onBlur={() => saveOverride(r)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                          }}
                          disabled={busyKey === r.key}
                          inputMode="decimal"
                          className="h-9 w-24 rounded-lg border border-slate-200 bg-white px-2 text-right text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                          title={
                            r.autoWeightKg != null
                              ? `Авто: ${r.autoWeightKg} кг (штуки × вес штуки). Введите своё значение или очистите для авто.`
                              : "Вес штуки не заполнен — введите вес строки руками или заполните справочник."
                          }
                        />
                        {r.overrideWeightKg != null && draft === undefined && (
                          <span className="text-[10px] text-slate-400" title="Поправка руками (авто игнорируется)">
                            ✎
                          </span>
                        )}
                      </span>
                    ) : r.effectiveWeightKg != null ? (
                      formatNumber(r.effectiveWeightKg)
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className={`${cellCls} text-right tabular-nums`}>
                    {r.amountRub != null ? formatNumber(r.amountRub) : "—"}
                  </td>
                  <td className={`${cellCls} text-right tabular-nums font-medium`}>
                    {r.perUnitRub != null ? formatNumber(r.perUnitRub) : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t border-slate-100 text-sm font-medium dark:border-slate-800">
              <td className={cellCls}>Итого</td>
              <td className={`${cellCls} text-right tabular-nums`}>
                {formatNumber(rows.reduce((a, r) => a + r.qty, 0))}
              </td>
              <td className={`${cellCls} text-right tabular-nums`}>{formatNumber(summary.sumLinesWeightKg)}</td>
              <td className={`${cellCls} text-right tabular-nums`}>
                {summary.rate > 0 ? formatNumber(summary.totalRub) : "—"}
              </td>
              <td className={cellCls}></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
