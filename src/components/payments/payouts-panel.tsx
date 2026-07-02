"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PayoutForm } from "@/components/payments/payout-form";

// Вкладка «Оплаты»: список фактических переводов фабрикам + форма создания.
// Строка раскрывается и показывает разнесение по плановым платежам.

type FactoryOption = { id: string; name: string };

export type PayoutListItem = {
  id: string;
  date: string; // ISO
  factoryName: string;
  amount: string; // рубли-строка
  currencyNote: string | null;
  comment: string | null;
  createdByName: string;
  allocatedTotal: string; // рубли-строка
  leftover: string; // рубли-строка (нераспределённый остаток)
  allocations: {
    id: string;
    paymentLabel: string; // «ORD-41 · Пальто»
    amount: string;
  }[];
};

function fmt(rub: string): string {
  return new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB", maximumFractionDigits: 0 }).format(Number(rub));
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getUTCDate()).padStart(2, "0")}.${String(d.getUTCMonth() + 1).padStart(2, "0")}.${d.getUTCFullYear()}`;
}

export function PayoutsPanel({
  payouts,
  factories,
  canDelete,
  canCreate,
}: {
  payouts: PayoutListItem[];
  factories: FactoryOption[];
  canDelete: boolean;
  canCreate: boolean;
}) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [busyId, setBusyId] = useState<string | null>(null);

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function remove(id: string) {
    if (!confirm("Удалить оплату? Разнесения снимутся, плановые платежи снова станут открытыми. (мягкое удаление)")) return;
    setBusyId(id);
    try {
      const res = await fetch(`/api/payouts/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        alert(j?.error?.message ?? "Не удалось удалить");
      } else {
        router.refresh();
      }
    } finally {
      setBusyId(null);
    }
  }

  const total = payouts.reduce((a, p) => a + Number(p.amount), 0);

  return (
    <div className="space-y-3">
      {canCreate && !showForm && (
        <div className="flex justify-end">
          <button
            onClick={() => setShowForm(true)}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            + Оплата
          </button>
        </div>
      )}

      {showForm && (
        <PayoutForm factories={factories} onDone={() => setShowForm(false)} onCancel={() => setShowForm(false)} />
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <Summary title="Оплачено всего" value={fmt(String(total))} />
        <Summary title="Переводов" value={String(payouts.length)} muted />
      </div>

      {payouts.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center text-sm text-slate-500">
          Оплат пока нет. Нажмите «+ Оплата», чтобы завести фактический перевод фабрике.
        </div>
      ) : (
        <div className="space-y-2">
          {payouts.map((p) => {
            const isOpen = expanded.has(p.id);
            const hasLeftover = Number(p.leftover) > 0.005;
            return (
              <div key={p.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                <button
                  onClick={() => toggle(p.id)}
                  className="flex w-full flex-wrap items-center gap-3 px-4 py-3 text-left hover:bg-slate-50"
                >
                  <div className="min-w-[88px]">
                    <div className="text-sm font-semibold text-slate-900">{fmtDate(p.date)}</div>
                    <div className="text-xs text-slate-500">{p.factoryName}</div>
                  </div>
                  <div className="min-w-[130px]">
                    <div className="text-lg font-bold text-slate-900">{fmt(p.amount)}</div>
                    {p.currencyNote && <div className="text-xs text-slate-400">{p.currencyNote}</div>}
                  </div>
                  <div className="min-w-0 flex-1 text-xs text-slate-500">
                    {p.allocations.length > 0 ? (
                      <span>
                        разнесено:{" "}
                        {p.allocations
                          .map((a) => `${a.paymentLabel} (${new Intl.NumberFormat("ru-RU").format(Number(a.amount))})`)
                          .join(" + ")}
                      </span>
                    ) : (
                      <span className="text-amber-600">не разнесено</span>
                    )}
                    {hasLeftover && (
                      <span className="ml-1 text-amber-600">· нераспределено {fmt(p.leftover)}</span>
                    )}
                  </div>
                  <div className="text-xs text-slate-400">{p.createdByName}</div>
                  <span className="text-slate-400">{isOpen ? "▲" : "▼"}</span>
                </button>

                {isOpen && (
                  <div className="border-t border-slate-100 bg-slate-50 px-4 py-3">
                    {p.comment && <div className="mb-2 text-sm text-slate-600">{p.comment}</div>}
                    {p.allocations.length === 0 ? (
                      <div className="text-sm text-slate-500">Разнесений нет — вся сумма нераспределена.</div>
                    ) : (
                      <ul className="space-y-1">
                        {p.allocations.map((a) => (
                          <li key={a.id} className="flex items-center justify-between text-sm">
                            <span className="text-slate-700">{a.paymentLabel}</span>
                            <span className="font-medium text-slate-900">{fmt(a.amount)}</span>
                          </li>
                        ))}
                        <li className="flex items-center justify-between border-t border-slate-200 pt-1 text-sm font-semibold">
                          <span className="text-slate-600">Итого разнесено</span>
                          <span className="text-slate-900">{fmt(p.allocatedTotal)}</span>
                        </li>
                      </ul>
                    )}
                    {canDelete && (
                      <div className="mt-3 flex justify-end">
                        <button
                          onClick={() => remove(p.id)}
                          disabled={busyId === p.id}
                          className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50"
                        >
                          Удалить оплату
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Summary({ title, value, muted }: { title: string; value: string; muted?: boolean }) {
  return (
    <div className={`rounded-xl border p-4 ${muted ? "border-slate-200 bg-slate-50" : "border-slate-200 bg-white"}`}>
      <div className="text-xs text-slate-500">{title}</div>
      <div className="mt-1 text-xl font-semibold text-slate-900">{value}</div>
    </div>
  );
}
