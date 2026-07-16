"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * ОТК Китай на заказе (Алёна 16.07): проверка качества на фабрике —
 * дата, сумма, валюта. Курс ЦБ фиксируется на дату ОТК, рубли ложатся
 * в лист «Себестоимость». Работает как «прикрепить доставку».
 */

export type ChinaQcItem = {
  id: string;
  date: string;        // YYYY-MM-DD
  amount: string;      // как строка из Decimal
  currency: string;
  rubRate: string | null;
  comment: string | null;
};

const inputCls =
  "h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100";

export function ChinaQcSection({
  orderId,
  items,
  canManage,
  canDelete,
}: {
  orderId: string;
  items: ChinaQcItem[];
  canManage: boolean;
  canDelete: boolean;
}) {
  const router = useRouter();
  const [form, setForm] = useState({ date: "", amount: "", currency: "CNY", comment: "" });
  const [busy, setBusy] = useState(false);

  const totalRub = items.reduce((a, it) => {
    const rate = it.rubRate != null ? Number(it.rubRate) : null;
    return rate != null ? a + Number(it.amount) * rate : a;
  }, 0);

  async function add() {
    setBusy(true);
    try {
      const res = await fetch(`/api/orders/${orderId}/china-qc`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: form.date,
          amount: form.amount,
          currency: form.currency,
          comment: form.comment || null,
        }),
      });
      if (!res.ok) {
        alert((await res.json())?.error?.message ?? "Не получилось сохранить ОТК");
        return;
      }
      setForm({ date: "", amount: "", currency: "CNY", comment: "" });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function remove(qcId: string) {
    if (!confirm("Убрать эту проверку ОТК?")) return;
    const res = await fetch(`/api/orders/${orderId}/china-qc`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ qcId }),
    });
    if (!res.ok) alert((await res.json())?.error?.message ?? "Не получилось удалить");
    router.refresh();
  }

  const sign = (c: string) => (c === "CNY" ? "¥" : c === "USD" ? "$" : "₽");

  return (
    <div className="space-y-3 rounded-2xl bg-white p-4 dark:bg-slate-900">
      {items.length === 0 ? (
        <div className="text-sm text-slate-400">Проверок ОТК пока нет.</div>
      ) : (
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {items.map((it) => {
            const rate = it.rubRate != null ? Number(it.rubRate) : null;
            const rub = rate != null ? Number(it.amount) * rate : null;
            return (
              <li key={it.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                <span className="text-slate-500">{it.date.slice(0, 10)}</span>
                <span className="font-medium text-slate-900 dark:text-slate-100">
                  {Number(it.amount).toLocaleString("ru-RU")} {sign(it.currency)}
                </span>
                {rub != null && it.currency !== "RUB" && (
                  <span className="text-xs text-slate-400">
                    ≈ {Math.round(rub).toLocaleString("ru-RU")} ₽ (курс {rate})
                  </span>
                )}
                {it.comment && <span className="text-xs text-slate-400">· {it.comment}</span>}
                {canDelete && (
                  <button type="button" onClick={() => void remove(it.id)} className="ml-auto text-xs text-slate-400 hover:text-rose-600">
                    убрать
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {totalRub > 0 && (
        <div className="text-sm text-slate-600 dark:text-slate-300">
          Всего ОТК: <span className="font-semibold">{Math.round(totalRub).toLocaleString("ru-RU")} ₽</span>{" "}
          <span className="text-xs text-slate-400">— уйдёт в себестоимость штуки на листе «Себестоимость»</span>
        </div>
      )}

      {canManage && (
        <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
          <input type="date" value={form.date} onChange={(e) => setForm((p) => ({ ...p, date: e.target.value }))} className={inputCls} />
          <input
            value={form.amount}
            onChange={(e) => setForm((p) => ({ ...p, amount: e.target.value }))}
            placeholder="сумма"
            inputMode="decimal"
            className={`${inputCls} w-28`}
          />
          <select value={form.currency} onChange={(e) => setForm((p) => ({ ...p, currency: e.target.value }))} className={inputCls}>
            <option value="CNY">¥ юани</option>
            <option value="USD">$ доллары</option>
            <option value="RUB">₽ рубли</option>
          </select>
          <input
            value={form.comment}
            onChange={(e) => setForm((p) => ({ ...p, comment: e.target.value }))}
            placeholder="комментарий (необязательно)"
            className={`${inputCls} w-56`}
          />
          <button
            type="button"
            onClick={add}
            disabled={busy || !form.date || !form.amount}
            className="inline-flex h-11 items-center rounded-lg bg-slate-900 px-4 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900"
          >
            {busy ? "Сохраняю…" : "+ ОТК"}
          </button>
        </div>
      )}
    </div>
  );
}
