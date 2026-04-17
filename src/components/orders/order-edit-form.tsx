"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ORDER_TYPE_LABELS, DELIVERY_METHOD_LABELS } from "@/lib/constants";

type Option = { id: string; name: string };

export function OrderEditForm({
  order,
  factories,
  users,
}: {
  order: {
    id: string;
    orderType: string;
    season: string;
    launchMonth: number;
    quantity: number;
    factoryId: string;
    ownerId: string;
    deliveryMethod: string;
    paymentTerms: string;
    prepaymentAmount: string;
    finalPaymentAmount: string;
    packagingType: string;
    notes: string;
  };
  factories: Option[];
  users: Option[];
}) {
  const router = useRouter();
  const [form, setForm] = useState(order);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const payload = {
        orderType: form.orderType,
        season: form.season || null,
        launchMonth: Number(form.launchMonth),
        quantity: Number(form.quantity),
        factoryId: form.factoryId || null,
        ownerId: form.ownerId,
        deliveryMethod: form.deliveryMethod || null,
        paymentTerms: form.paymentTerms || null,
        prepaymentAmount: form.prepaymentAmount ? Number(form.prepaymentAmount) : null,
        finalPaymentAmount: form.finalPaymentAmount ? Number(form.finalPaymentAmount) : null,
        packagingType: form.packagingType || null,
        notes: form.notes || null,
      };
      const res = await fetch(`/api/orders/${order.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const j = await res.json();
        setError(j?.error?.message ?? "Ошибка");
        return;
      }
      router.push(`/orders/${order.id}`);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <Section title="Основное">
        <Field label="Тип заказа">
          <select value={form.orderType} onChange={(e) => setForm({ ...form, orderType: e.target.value })} className={inputCls}>
            {Object.entries(ORDER_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
        <Field label="Сезон">
          <input value={form.season} onChange={(e) => setForm({ ...form, season: e.target.value })} className={inputCls} />
        </Field>
        <Field label="Месяц продаж (YYYYMM)">
          <input type="number" value={form.launchMonth} onChange={(e) => setForm({ ...form, launchMonth: Number(e.target.value) })} className={inputCls} />
        </Field>
        <Field label="Количество, шт">
          <input type="number" min={1} value={form.quantity} onChange={(e) => setForm({ ...form, quantity: Number(e.target.value) })} className={inputCls} />
        </Field>
      </Section>

      <Section title="Производство">
        <Field label="Фабрика">
          <select value={form.factoryId} onChange={(e) => setForm({ ...form, factoryId: e.target.value })} className={inputCls}>
            <option value="">—</option>
            {factories.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
        </Field>
        <Field label="Ответственный">
          <select value={form.ownerId} onChange={(e) => setForm({ ...form, ownerId: e.target.value })} className={inputCls}>
            {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </Field>
        <Field label="Способ доставки">
          <select value={form.deliveryMethod} onChange={(e) => setForm({ ...form, deliveryMethod: e.target.value })} className={inputCls}>
            <option value="">—</option>
            {Object.entries(DELIVERY_METHOD_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
        <Field label="Тип упаковки">
          <input value={form.packagingType} onChange={(e) => setForm({ ...form, packagingType: e.target.value })} className={inputCls} />
        </Field>
      </Section>

      <Section title="Оплаты">
        <Field label="Условия">
          <input value={form.paymentTerms} onChange={(e) => setForm({ ...form, paymentTerms: e.target.value })} className={inputCls} />
        </Field>
        <Field label="Сумма предоплаты, ₽">
          <input type="number" step="0.01" value={form.prepaymentAmount} onChange={(e) => setForm({ ...form, prepaymentAmount: e.target.value })} className={inputCls} />
        </Field>
        <Field label="Сумма остатка, ₽">
          <input type="number" step="0.01" value={form.finalPaymentAmount} onChange={(e) => setForm({ ...form, finalPaymentAmount: e.target.value })} className={inputCls} />
        </Field>
      </Section>

      <Section title="Примечания">
        <div className="md:col-span-2">
          <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3} className={inputCls} />
        </div>
      </Section>

      {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      <div className="sticky bottom-0 flex justify-end gap-2 border-t border-slate-200 bg-white pt-4">
        <button type="button" onClick={() => router.back()} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm">
          Отмена
        </button>
        <button type="submit" disabled={saving} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
          {saving ? "Сохранение…" : "Сохранить изменения"}
        </button>
      </div>
    </form>
  );
}

const inputCls = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-900 focus:ring-1 focus:ring-slate-900";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="space-y-3">
      <legend className="text-sm font-semibold uppercase tracking-wide text-slate-500">{title}</legend>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">{children}</div>
    </fieldset>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm text-slate-700">{label}</span>
      {children}
    </label>
  );
}
