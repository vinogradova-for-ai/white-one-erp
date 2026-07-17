"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * ОТК Китай — МЕРОПРИЯТИЕ на заказе (прожарка 17.07): к нему принимаются
 * партии, есть факт начала (дата) и галка «завершён» с датой, стоимость
 * (курс ЦБ фиксируется на дату начала) ложится в себестоимость.
 * Факты уточняют Гант: принята к ОТК → конец «Производства»; завершён →
 * конец полосы «ОТК». Связка мягкая — партия может уехать и без ОТК.
 */

export type ChinaQcItem = {
  id: string;
  date: string;             // YYYY-MM-DD — начало (принята к ОТК)
  finishedAt: string | null; // YYYY-MM-DD — завершение
  amount: string;
  currency: string;
  rubRate: string | null;
  comment: string | null;
  batchIds: string[];
};

export type OrderBatchOption = { id: string; label: string; qty: number };

const inputCls =
  "h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100";

function todayMsk(): string {
  return new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 10);
}

export function ChinaQcSection({
  orderId,
  items,
  batches,
  canManage,
  canDelete,
}: {
  orderId: string;
  items: ChinaQcItem[];
  batches: OrderBatchOption[];
  canManage: boolean;
  canDelete: boolean;
}) {
  const router = useRouter();
  const [form, setForm] = useState({ date: "", amount: "", currency: "CNY", comment: "", qty: "" });
  const [formBatches, setFormBatches] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const totalRub = items.reduce((a, it) => {
    const rate = it.rubRate != null ? Number(it.rubRate) : null;
    return rate != null ? a + Number(it.amount) * rate : a;
  }, 0);

  async function api(method: "POST" | "PATCH" | "DELETE", body: Record<string, unknown>) {
    const res = await fetch(`/api/orders/${orderId}/china-qc`, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      alert((await res.json().catch(() => ({})))?.error?.message ?? "Не получилось сохранить");
      return false;
    }
    router.refresh();
    return true;
  }

  async function add() {
    setBusy(true);
    try {
      const ok = await api("POST", {
        date: form.date,
        amount: form.amount,
        currency: form.currency,
        comment: form.comment || null,
        batchIds: Array.from(formBatches),
        qty: formBatches.size === 0 && form.qty.trim() !== "" ? Number(form.qty) : null,
      });
      if (ok) {
        setForm({ date: "", amount: "", currency: "CNY", comment: "", qty: "" });
        setFormBatches(new Set());
      }
    } finally {
      setBusy(false);
    }
  }

  const sign = (c: string) => (c === "CNY" ? "¥" : c === "USD" ? "$" : "₽");
  const batchLabel = (id: string) => batches.find((b) => b.id === id)?.label ?? "партия";

  return (
    <div className="space-y-3 rounded-2xl bg-white p-4 dark:bg-slate-900">
      {items.length === 0 ? (
        <div className="text-sm text-slate-400">
          Проверок ОТК пока нет.{batches.length > 0 ? " Заведи мероприятие: дата, сумма, какие партии проверяются." : ""}
        </div>
      ) : (
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {items.map((it) => {
            const rate = it.rubRate != null ? Number(it.rubRate) : null;
            const rub = rate != null ? Number(it.amount) * rate : null;
            return (
              <li key={it.id} className="space-y-1.5 py-2.5">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span
                    className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${
                      it.finishedAt
                        ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-300"
                        : "bg-amber-50 text-amber-700 dark:bg-amber-400/10 dark:text-amber-300"
                    }`}
                  >
                    {it.finishedAt ? `ОТК пройден ${it.finishedAt.slice(0, 10)} ✓` : "идёт проверка"}
                  </span>
                  <span className="text-slate-500">начат {it.date.slice(0, 10)}</span>
                  <span className="font-medium text-slate-900 dark:text-slate-100">
                    {Number(it.amount).toLocaleString("ru-RU")} {sign(it.currency)}
                  </span>
                  {rub != null && it.currency !== "RUB" && (
                    <span className="text-xs text-slate-400">≈ {Math.round(rub).toLocaleString("ru-RU")} ₽</span>
                  )}
                  {it.comment && <span className="text-xs text-slate-400">· {it.comment}</span>}
                  {canManage && (
                    <span className="ml-auto flex items-center gap-2">
                      {it.finishedAt ? (
                        <button
                          type="button"
                          onClick={() => void api("PATCH", { qcId: it.id, finishedAt: null })}
                          className="text-xs text-slate-400 underline hover:text-slate-600"
                        >
                          вернуть в работу
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => void api("PATCH", { qcId: it.id, finishedAt: todayMsk() })}
                          className="rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-emerald-500"
                        >
                          ✓ Завершить ОТК
                        </button>
                      )}
                      {canDelete && (
                        <button
                          type="button"
                          onClick={() => {
                            if (confirm("Убрать это мероприятие ОТК?")) void api("DELETE", { qcId: it.id });
                          }}
                          className="text-xs text-slate-400 hover:text-rose-600"
                        >
                          убрать
                        </button>
                      )}
                    </span>
                  )}
                </div>
                {it.batchIds.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {it.batchIds.map((bid) => (
                      <span key={bid} className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                        {batchLabel(bid)}
                      </span>
                    ))}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {totalRub > 0 && (
        <div className="text-sm text-slate-600 dark:text-slate-300">
          Всего ОТК: <span className="font-semibold">{Math.round(totalRub).toLocaleString("ru-RU")} ₽</span>{" "}
          <span className="text-xs text-slate-400">— в себестоимость штуки на листе «Себестоимость»</span>
        </div>
      )}

      {canManage && (
        <div className="space-y-2 border-t border-slate-100 pt-3 dark:border-slate-800">
          <div className="flex flex-wrap items-center gap-2">
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
          <div className="flex flex-wrap items-center gap-1.5">
            <label className="flex h-9 items-center gap-2 rounded-lg border border-slate-300 px-2.5 dark:border-slate-600">
              <span className="whitespace-nowrap text-xs text-slate-500">на проверку, шт</span>
              <input
                value={form.qty}
                onChange={(e) => setForm((p) => ({ ...p, qty: e.target.value }))}
                placeholder="частично"
                inputMode="numeric"
                disabled={formBatches.size > 0}
                className="w-20 bg-transparent text-sm outline-none disabled:opacity-40 dark:text-slate-100"
              />
            </label>
            <span className="text-[11px] text-slate-400">— партия выделится сама, или отметь готовые партии ниже</span>
          </div>
          {batches.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-slate-500">партии на проверку:</span>
              {batches.map((b) => {
                const on = formBatches.has(b.id);
                return (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() =>
                      setFormBatches((p) => {
                        const n = new Set(p);
                        if (on) n.delete(b.id);
                        else n.add(b.id);
                        return n;
                      })
                    }
                    className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                      on
                        ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
                        : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                    }`}
                  >
                    {b.label} · {b.qty.toLocaleString("ru-RU")} шт
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
