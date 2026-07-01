"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  toKopecks,
  kopecksToRubString,
  autoAllocate,
  type OpenPaymentInput,
} from "@/lib/payments/allocate-payout";

// Форма «+ Оплата»: дата, фабрика, сумма ₽, валютная пометка, комментарий.
// После ввода суммы и фабрики подтягивает открытые плановые платежи фабрики и
// авто-раскидывает сумму сверху вниз. Руками можно поправить.

type FactoryOption = { id: string; name: string };

type OpenPayment = {
  id: string;
  type: "ORDER" | "PACKAGING";
  label: string;
  targetLabel: string;
  plannedDate: string;
  amount: string;
  allocated: string;
  remaining: string;
  amountKopecks: number;
  allocatedKopecks: number;
  remainingKopecks: number;
};

// Сегодня по МСК → YYYY-MM-DD для <input type=date>.
function moscowTodayInput(): string {
  const now = new Date();
  const moscow = new Date(now.getTime() + (3 * 60 - now.getTimezoneOffset()) * 60_000);
  return moscow.toISOString().slice(0, 10);
}

function fmtRub(kop: number): string {
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(kop / 100);
}

function fmtDateRu(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getUTCDate()).padStart(2, "0")}.${String(d.getUTCMonth() + 1).padStart(2, "0")}.${d.getUTCFullYear()}`;
}

export function PayoutForm({
  factories,
  onDone,
  onCancel,
}: {
  factories: FactoryOption[];
  onDone: () => void;
  onCancel: () => void;
}) {
  const router = useRouter();
  const [date, setDate] = useState(moscowTodayInput());
  const [factoryId, setFactoryId] = useState("");
  const [amount, setAmount] = useState("");
  const [currencyNote, setCurrencyNote] = useState("");
  const [comment, setComment] = useState("");

  const [openPayments, setOpenPayments] = useState<OpenPayment[]>([]);
  const [loadingPayments, setLoadingPayments] = useState(false);
  // paymentId → сумма разнесения в рублях-строке ("" = не выбран/0).
  const [alloc, setAlloc] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const totalKopecks = amount.trim() ? toKopecks(amount) : 0;

  // Грузим открытые платежи при смене фабрики.
  useEffect(() => {
    if (!factoryId) {
      setOpenPayments([]);
      setAlloc({});
      return;
    }
    let cancelled = false;
    setLoadingPayments(true);
    fetch(`/api/payouts?factoryId=${encodeURIComponent(factoryId)}`)
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return;
        setOpenPayments(j.payments ?? []);
        setAlloc({});
      })
      .catch(() => {
        if (!cancelled) setOpenPayments([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingPayments(false);
      });
    return () => {
      cancelled = true;
    };
  }, [factoryId]);

  // Автораспределение: пересчитывается при смене суммы или списка платежей.
  // Ручные правки живут в alloc и не перетираются, пока пользователь не нажмёт «Распределить заново».
  function runAutoAllocate() {
    if (totalKopecks <= 0 || openPayments.length === 0) {
      setAlloc({});
      return;
    }
    const inputs: OpenPaymentInput[] = openPayments.map((p) => ({
      id: p.id,
      amountKopecks: p.amountKopecks,
      allocatedKopecks: p.allocatedKopecks,
    }));
    const res = autoAllocate(totalKopecks, inputs);
    const next: Record<string, string> = {};
    for (const row of res.rows) {
      next[row.paymentId] = kopecksToRubString(row.amountKopecks);
    }
    setAlloc(next);
  }

  // Первый автопрогон, когда появились платежи и есть сумма.
  useEffect(() => {
    if (openPayments.length > 0 && totalKopecks > 0 && Object.keys(alloc).length === 0) {
      runAutoAllocate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openPayments, totalKopecks]);

  const allocatedKopecks = useMemo(
    () => Object.values(alloc).reduce((s, v) => s + (v.trim() ? toKopecks(v) : 0), 0),
    [alloc],
  );
  const leftoverKopecks = Math.max(0, totalKopecks - allocatedKopecks);
  const overAllocated = allocatedKopecks > totalKopecks;

  function setRow(paymentId: string, value: string) {
    setAlloc((prev) => {
      const next = { ...prev };
      if (!value.trim() || Number(value) === 0) delete next[paymentId];
      else next[paymentId] = value;
      return next;
    });
  }

  function toggleRow(p: OpenPayment, checked: boolean) {
    if (checked) {
      // При включении — предлагаем min(остаток платежа, нераспределённый остаток оплаты).
      const free = Math.max(0, totalKopecks - allocatedKopecks);
      const take = Math.min(p.remainingKopecks, free > 0 ? free : p.remainingKopecks);
      setRow(p.id, kopecksToRubString(take));
    } else {
      setRow(p.id, "");
    }
  }

  async function submit() {
    setError(null);
    if (!factoryId) return setError("Выберите фабрику");
    if (totalKopecks <= 0) return setError("Укажите сумму оплаты");
    if (overAllocated) return setError("Разнесено больше суммы оплаты");

    const allocations = Object.entries(alloc)
      .filter(([, v]) => v.trim() && Number(v) > 0)
      .map(([paymentId, v]) => ({ paymentId, amount: v }));

    setBusy(true);
    try {
      const res = await fetch("/api/payouts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date,
          factoryId,
          amount,
          currencyNote: currencyNote.trim() || null,
          comment: comment.trim() || null,
          allocations,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j?.error?.message ?? "Не удалось сохранить оплату");
        return;
      }
      router.refresh();
      onDone();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-slate-900">Новая оплата фабрике</h2>
        <button onClick={onCancel} className="text-sm text-slate-500 hover:text-slate-700">
          Отмена
        </button>
      </div>

      {/* Шапка формы */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-600">Дата оплаты</span>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-600">Фабрика</span>
          <select
            value={factoryId}
            onChange={(e) => setFactoryId(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">— выберите —</option>
            {factories.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-600">Сумма, ₽</span>
          <input
            type="number"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-600">Валютная пометка (необязательно)</span>
          <input
            type="text"
            value={currencyNote}
            onChange={(e) => setCurrencyNote(e.target.value)}
            placeholder="≈36 500 ¥"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </label>
      </div>
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-slate-600">Комментарий (необязательно)</span>
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={2}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
      </label>

      {/* Разнесение по открытым платежам */}
      {factoryId && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-slate-700">Разнести по платежам</span>
            <button
              type="button"
              onClick={runAutoAllocate}
              disabled={totalKopecks <= 0 || openPayments.length === 0}
              className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-40"
            >
              Распределить заново
            </button>
          </div>

          {loadingPayments ? (
            <div className="rounded-lg border border-dashed border-slate-300 p-4 text-center text-sm text-slate-400">
              Загрузка платежей…
            </div>
          ) : openPayments.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-300 p-4 text-center text-sm text-slate-500">
              У этой фабрики нет открытых плановых платежей. Оплату можно сохранить — сумма будет числиться нераспределённой.
            </div>
          ) : (
            <div className="divide-y divide-slate-100 rounded-lg border border-slate-200">
              {openPayments.map((p) => {
                const checked = !!alloc[p.id];
                return (
                  <div key={p.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => toggleRow(p, e.target.checked)}
                      className="h-4 w-4"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-slate-900">{p.targetLabel}</div>
                      <div className="truncate text-[11px] text-slate-500">
                        {p.label} · план {fmtDateRu(p.plannedDate)} · остаток {fmtRub(p.remainingKopecks)} ₽
                        {p.allocatedKopecks > 0 && ` (из ${fmtRub(p.amountKopecks)})`}
                      </div>
                    </div>
                    <input
                      type="number"
                      inputMode="decimal"
                      value={alloc[p.id] ?? ""}
                      onChange={(e) => setRow(p.id, e.target.value)}
                      placeholder="0"
                      className="w-28 rounded-lg border border-slate-300 px-2 py-1 text-sm"
                    />
                  </div>
                );
              })}
            </div>
          )}

          {/* Live-строка */}
          <div
            className={`rounded-lg px-3 py-2 text-sm font-medium ${
              overAllocated ? "bg-red-50 text-red-700" : "bg-slate-50 text-slate-700"
            }`}
          >
            Разнесено {fmtRub(allocatedKopecks)} из {fmtRub(totalKopecks)} ₽ · остаток{" "}
            {overAllocated ? "−" + fmtRub(allocatedKopecks - totalKopecks) : fmtRub(leftoverKopecks)} ₽
            {overAllocated && " — уберите лишнее"}
            {!overAllocated && leftoverKopecks > 0 && " (нераспределённый — ок)"}
          </div>
        </div>
      )}

      {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm text-slate-600 hover:bg-slate-50">
          Отмена
        </button>
        <button
          onClick={submit}
          disabled={busy || overAllocated}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {busy ? "Сохранение…" : "Сохранить оплату"}
        </button>
      </div>
    </div>
  );
}
