"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type OrderOption = { id: string; label: string; factoryId: string | null };

type Initial = {
  id: string;
  type: "ORDER" | "PACKAGING";
  plannedDate: string;
  amount: string;
  label: string;
  notes: string;
  orderId: string;
  supplierName: string;
};

export function PaymentForm({ orders, initial }: { orders: OrderOption[]; initial?: Initial }) {
  const router = useRouter();
  const isEdit = !!initial;
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState<Omit<Initial, "id">>({
    type: initial?.type ?? "PACKAGING",
    plannedDate: initial?.plannedDate ?? new Date().toISOString().slice(0, 10),
    amount: initial?.amount ?? "",
    label: initial?.label ?? "",
    notes: initial?.notes ?? "",
    orderId: initial?.orderId ?? "",
    supplierName: initial?.supplierName ?? "",
  });

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const payload: Record<string, unknown> = {
        type: form.type,
        plannedDate: form.plannedDate,
        amount: Number(form.amount.replace(",", ".")),
        label: form.label,
        notes: form.notes || null,
      };
      if (form.type === "ORDER") {
        payload.orderId = form.orderId || null;
        payload.factoryId = orders.find((o) => o.id === form.orderId)?.factoryId ?? null;
      } else {
        payload.supplierName = form.supplierName || null;
      }

      const url = isEdit ? `/api/payments/${initial!.id}` : "/api/payments";
      const method = isEdit ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j?.error?.message ?? "Ошибка сохранения");
        return;
      }
      router.push("/payments");
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <fieldset className="space-y-3">
        <legend className="text-sm font-semibold uppercase tracking-wide text-slate-500">Тип платежа</legend>
        <div className="grid grid-cols-2 gap-2">
          <TypeBtn
            active={form.type === "ORDER"}
            onClick={() => setForm({ ...form, type: "ORDER" })}
          >
            Фабрика (заказ)
          </TypeBtn>
          <TypeBtn
            active={form.type === "PACKAGING"}
            onClick={() => setForm({ ...form, type: "PACKAGING" })}
          >
            Упаковка
          </TypeBtn>
        </div>
      </fieldset>

      {form.type === "ORDER" ? (
        <Field label="Заказ *">
          <select
            required
            value={form.orderId}
            onChange={(e) => setForm({ ...form, orderId: e.target.value })}
            className={inputCls}
          >
            <option value="">— выберите заказ —</option>
            {orders.map((o) => (
              <option key={o.id} value={o.id}>{o.label}</option>
            ))}
          </select>
        </Field>
      ) : (
        <Field label="Поставщик упаковки">
          <input
            value={form.supplierName}
            onChange={(e) => setForm({ ...form, supplierName: e.target.value })}
            placeholder="Название поставщика"
            className={inputCls}
          />
        </Field>
      )}

      <Field label="Название платежа *">
        <input
          required
          value={form.label}
          onChange={(e) => setForm({ ...form, label: e.target.value })}
          placeholder={form.type === "ORDER" ? "Предоплата 30%" : "Бирки апрель"}
          className={inputCls}
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Плановая дата *">
          <input
            type="date"
            required
            value={form.plannedDate}
            onChange={(e) => setForm({ ...form, plannedDate: e.target.value })}
            className={inputCls}
          />
        </Field>
        <Field label="Сумма, ₽ *">
          <input
            type="text"
            inputMode="decimal"
            required
            value={form.amount}
            onChange={(e) => setForm({ ...form, amount: e.target.value.replace(/[^\d.,]/g, "") })}
            placeholder="0"
            className={inputCls}
          />
        </Field>
      </div>

      <Field label="Примечание">
        <textarea
          value={form.notes}
          onChange={(e) => setForm({ ...form, notes: e.target.value })}
          rows={3}
          className={inputCls}
          placeholder="Ссылка на счёт, номер договора, что угодно"
        />
      </Field>

      {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      <div className="flex justify-end gap-2 border-t border-slate-200 pt-4">
        <button
          type="button"
          onClick={() => router.back()}
          className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm"
        >
          Отмена
        </button>
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {saving ? "Сохранение…" : isEdit ? "Сохранить" : "Создать платёж"}
        </button>
      </div>
    </form>
  );
}

const inputCls =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-900 focus:ring-1 focus:ring-slate-900";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm text-slate-700">{label}</span>
      {children}
    </label>
  );
}

function TypeBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg border px-4 py-3 text-sm font-medium transition ${
        active
          ? "border-slate-900 bg-slate-900 text-white"
          : "border-slate-300 bg-white text-slate-700 hover:border-slate-400"
      }`}
    >
      {children}
    </button>
  );
}
