"use client";

import { useState } from "react";

// Мини-калькулятор «платим в юанях»: сумма ¥ × курс + комиссия % → ₽.
// План платежей в ERP остаётся в рублях (деньги считаются в .fin3 по факту),
// а тут просто честно закладываем курс перевода и комиссию (Оля/Alipay)
// в плановую сумму, чтобы стоимость товара не занижалась.
export function CnyHelper({
  defaultRate,
  onApply,
}: {
  defaultRate?: number | null;
  onApply: (amountRub: number, note: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [cny, setCny] = useState("");
  const [rate, setRate] = useState(defaultRate ? String(defaultRate) : "");
  const [feePct, setFeePct] = useState("");

  const n = (s: string) => {
    const v = Number(s.trim().replace(",", "."));
    return Number.isFinite(v) && v >= 0 ? v : null;
  };
  const cnyN = n(cny);
  const rateN = n(rate);
  const feeN = n(feePct) ?? 0;
  const rub = cnyN != null && rateN != null ? cnyN * rateN * (1 + feeN / 100) : null;

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Посчитать из юаней (курс + комиссия)"
        className="flex h-11 w-11 items-center justify-center rounded border border-slate-300 bg-white text-sm text-slate-600 hover:bg-slate-50"
      >
        ¥
      </button>
    );
  }

  return (
    <div className="flex w-full flex-wrap items-center gap-2 rounded-lg border border-amber-200 bg-amber-50/60 p-2 dark:border-amber-400/20 dark:bg-amber-400/5">
      <input
        inputMode="decimal"
        value={cny}
        onChange={(e) => setCny(e.target.value)}
        placeholder="Сумма ¥"
        className="h-10 w-24 rounded border border-slate-300 bg-white px-2 text-right text-sm"
        autoFocus
      />
      <span className="text-xs text-slate-500">×</span>
      <input
        inputMode="decimal"
        value={rate}
        onChange={(e) => setRate(e.target.value)}
        placeholder="курс"
        className="h-10 w-20 rounded border border-slate-300 bg-white px-2 text-right text-sm"
      />
      <span className="text-xs text-slate-500">+</span>
      <input
        inputMode="decimal"
        value={feePct}
        onChange={(e) => setFeePct(e.target.value)}
        placeholder="комиссия"
        className="h-10 w-24 rounded border border-slate-300 bg-white px-2 text-right text-sm"
      />
      <span className="text-xs text-slate-500">%</span>
      {rub != null && (
        <span className="text-sm font-semibold tabular-nums text-slate-900">= {Math.round(rub).toLocaleString("ru-RU")} ₽</span>
      )}
      <button
        type="button"
        disabled={rub == null}
        onClick={() => {
          if (rub == null) return;
          const note = `${cnyN!.toLocaleString("ru-RU")} ¥ по ${rateN}${feeN > 0 ? ` +${feeN}%` : ""}`;
          onApply(Math.round(rub), note);
          setOpen(false);
        }}
        className="inline-flex h-10 items-center rounded bg-slate-900 px-3 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-40"
      >
        Подставить
      </button>
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="inline-flex h-10 items-center px-1.5 text-xs text-slate-500 hover:text-slate-700"
      >
        Отмена
      </button>
    </div>
  );
}
