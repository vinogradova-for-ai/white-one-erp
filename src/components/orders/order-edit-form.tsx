"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ORDER_TYPE_LABELS, DELIVERY_METHOD_LABELS } from "@/lib/constants";
import { OrderTimeline } from "@/components/orders/order-timeline";
import type { DeliveryMethod } from "@prisma/client";

type Option = { id: string; name: string };

type Timeline = {
  readyAtFactoryDate: string;
  qcDate: string;
  arrivalPlannedDate: string;
};

type PaymentRow = {
  id: string;
  plannedDate: string;
  amount: number;
  label: string;
  paid: boolean;
};

export function OrderEditForm({
  order,
  factories,
  users,
}: {
  order: {
    id: string;
    orderType: string;
    season: string;
    launchMonth: string; // "YYYY-MM"
    factoryId: string;
    ownerId: string;
    deliveryMethod: string;
    paymentTerms: string;
    packagingType: string;
    notes: string;
    timeline: Timeline;
    payments: PaymentRow[];
  };
  factories: Option[];
  users: Option[];
}) {
  const router = useRouter();
  const [common, setCommon] = useState({
    orderType: order.orderType,
    season: order.season,
    launchMonth: order.launchMonth,
    factoryId: order.factoryId,
    ownerId: order.ownerId,
    deliveryMethod: order.deliveryMethod,
    paymentTerms: order.paymentTerms,
    packagingType: order.packagingType,
    notes: order.notes,
  });
  const [timeline, setTimeline] = useState<Timeline>(order.timeline);
  const [payments, setPayments] = useState<PaymentRow[]>(order.payments);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updatePayment(idx: number, patch: Partial<PaymentRow>) {
    setPayments(payments.map((p, i) => (i === idx ? { ...p, ...patch } : p)));
  }
  function addPayment() {
    setPayments([
      ...payments,
      {
        id: `new-${Date.now()}`,
        plannedDate: new Date().toISOString().slice(0, 10),
        amount: 0,
        label: "Платёж",
        paid: false,
      },
    ]);
  }
  function removePayment(idx: number) {
    setPayments(payments.filter((_, i) => i !== idx));
  }

  const paymentsTotal = payments.reduce((a, p) => a + (Number(p.amount) || 0), 0);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        orderType: common.orderType,
        season: common.season || null,
        launchMonth: Number(common.launchMonth.replace("-", "")),
        factoryId: common.factoryId || null,
        ownerId: common.ownerId,
        deliveryMethod: common.deliveryMethod || null,
        paymentTerms: common.paymentTerms || null,
        packagingType: common.packagingType || null,
        notes: common.notes || null,
        readyAtFactoryDate: timeline.readyAtFactoryDate || null,
        qcDate: timeline.qcDate || null,
        arrivalPlannedDate: timeline.arrivalPlannedDate || null,
        payments: payments.map((p) => ({
          plannedDate: p.plannedDate,
          amount: Number(p.amount) || 0,
          label: p.label,
          paid: p.paid,
        })),
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
          <select value={common.orderType} onChange={(e) => setCommon({ ...common, orderType: e.target.value })} className={inputCls}>
            {Object.entries(ORDER_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
        <Field label="Сезон">
          <input value={common.season} onChange={(e) => setCommon({ ...common, season: e.target.value })} className={inputCls} />
        </Field>
        <Field label="Месяц продаж">
          <input
            type="month"
            value={common.launchMonth}
            onChange={(e) => setCommon({ ...common, launchMonth: e.target.value })}
            className={inputCls}
          />
        </Field>
      </Section>
      <p className="text-xs text-slate-500">
        Количество по позициям и размерные матрицы правятся на странице заказа в блоке «Позиции».
      </p>

      <Section title="Производство">
        <Field label="Фабрика">
          <select value={common.factoryId} onChange={(e) => setCommon({ ...common, factoryId: e.target.value })} className={inputCls}>
            <option value="">—</option>
            {factories.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
        </Field>
        <Field label="Ответственный">
          <select value={common.ownerId} onChange={(e) => setCommon({ ...common, ownerId: e.target.value })} className={inputCls}>
            {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </Field>
        <Field label="Способ доставки">
          <select value={common.deliveryMethod} onChange={(e) => setCommon({ ...common, deliveryMethod: e.target.value })} className={inputCls}>
            <option value="">—</option>
            {Object.entries(DELIVERY_METHOD_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
        <Field label="Тип упаковки">
          <input value={common.packagingType} onChange={(e) => setCommon({ ...common, packagingType: e.target.value })} className={inputCls} />
        </Field>
      </Section>

      <OrderTimeline
        launchMonth={common.launchMonth}
        initial={timeline}
        onChange={setTimeline}
        deliveryMethod={(common.deliveryMethod || null) as DeliveryMethod | null}
      />

      <Section title="График платежей">
        <Field label="Условия (например, 30/70)">
          <input value={common.paymentTerms} onChange={(e) => setCommon({ ...common, paymentTerms: e.target.value })} className={inputCls} />
        </Field>
        <div className="md:col-span-2 space-y-2">
          {payments.length === 0 && (
            <p className="text-sm text-slate-500">Платежей пока нет.</p>
          )}
          {payments.map((p, idx) => (
            <div key={p.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2">
              <input
                type="date"
                value={p.plannedDate}
                onChange={(e) => updatePayment(idx, { plannedDate: e.target.value })}
                className="rounded border border-slate-300 bg-white px-2 py-1 text-sm"
              />
              <input
                type="number"
                value={p.amount}
                onChange={(e) => updatePayment(idx, { amount: Number(e.target.value) || 0 })}
                className="w-28 rounded border border-slate-300 bg-white px-2 py-1 text-right text-sm"
              />
              <span className="text-xs text-slate-500">₽</span>
              <input
                value={p.label}
                onChange={(e) => updatePayment(idx, { label: e.target.value })}
                className="flex-1 min-w-[140px] rounded border border-slate-300 bg-white px-2 py-1 text-sm"
              />
              <label className="flex items-center gap-1 text-xs text-slate-600 whitespace-nowrap">
                <input
                  type="checkbox"
                  checked={p.paid}
                  onChange={(e) => updatePayment(idx, { paid: e.target.checked })}
                />
                Оплачено
              </label>
              <button
                type="button"
                onClick={() => removePayment(idx)}
                className="rounded border border-slate-300 bg-white px-2 py-1 text-xs text-red-600 hover:bg-red-50"
              >
                ×
              </button>
            </div>
          ))}
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={addPayment}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50"
            >
              + Добавить платёж
            </button>
            <span className="text-xs text-slate-500">
              Сумма: {paymentsTotal.toLocaleString("ru-RU")} ₽
            </span>
          </div>
        </div>
      </Section>

      <Section title="Примечания">
        <div className="md:col-span-2">
          <textarea value={common.notes} onChange={(e) => setCommon({ ...common, notes: e.target.value })} rows={3} className={inputCls} />
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
