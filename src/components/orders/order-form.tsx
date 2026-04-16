"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { ORDER_TYPE_LABELS, BRAND_LABELS, DELIVERY_METHOD_LABELS } from "@/lib/constants";
import { formatCurrency } from "@/lib/format";

type ProductOption = {
  id: string;
  sku: string;
  name: string;
  brand: keyof typeof BRAND_LABELS;
  customerPrice: string | null;
  fullCost: string | null;
  plannedRedemptionPct: string | null;
  preferredFactoryId: string | null;
};

type Option = { id: string; name: string };

export function OrderForm({
  products,
  factories,
  users,
  preselectedProductId,
}: {
  products: ProductOption[];
  factories: Option[];
  users: Option[];
  preselectedProductId?: string;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    productId: preselectedProductId ?? products[0]?.id ?? "",
    orderType: "SEASONAL",
    season: "Осень 2026",
    launchMonth: "202609",
    quantity: "500",
    factoryId: "",
    ownerId: users[0]?.id ?? "",
    deliveryMethod: "CARGO",
    paymentTerms: "30/70",
    prepaymentAmount: "",
    finalPaymentAmount: "",
    packagingType: "полибэг",
    notes: "",
  });

  const product = useMemo(() => products.find((p) => p.id === form.productId), [form.productId, products]);

  // Предпросмотр экономики
  const preview = useMemo(() => {
    if (!product || !form.quantity) return null;
    const qty = Number(form.quantity);
    const cost = Number(product.fullCost ?? 0);
    const price = Number(product.customerPrice ?? 0);
    const redemption = Number(product.plannedRedemptionPct ?? 0) / 100;
    return {
      batchCost: cost * qty,
      plannedRevenue: price * redemption * qty,
    };
  }, [product, form.quantity]);

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const payload = {
        productId: form.productId,
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
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const j = await res.json();
        setError(j?.error?.message ?? "Ошибка сохранения");
        return;
      }
      const order = await res.json();
      router.push(`/orders/${order.id}`);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <Section title="Изделие и параметры">
        <Field label="Изделие *" full>
          <select required value={form.productId} onChange={(e) => update("productId", e.target.value)} className={inputCls}>
            <option value="">— выберите —</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.sku} · {p.name} · {BRAND_LABELS[p.brand]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Тип заказа *">
          <select value={form.orderType} onChange={(e) => update("orderType", e.target.value)} className={inputCls}>
            {Object.entries(ORDER_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
        <Field label="Сезон">
          <input value={form.season} onChange={(e) => update("season", e.target.value)} className={inputCls} />
        </Field>
        <Field label="Месяц старта продаж (YYYYMM) *">
          <input type="number" required value={form.launchMonth} onChange={(e) => update("launchMonth", e.target.value)} className={inputCls} placeholder="202609" />
        </Field>
        <Field label="Количество, шт *">
          <input type="number" required min={1} value={form.quantity} onChange={(e) => update("quantity", e.target.value)} className={inputCls} />
        </Field>
      </Section>

      {preview && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm">
          <h3 className="mb-2 font-semibold text-slate-700">Предварительный расчёт:</h3>
          <div className="grid grid-cols-2 gap-2">
            <div className="flex justify-between">
              <span className="text-slate-600">Себестоимость партии:</span>
              <span className="font-medium">{formatCurrency(preview.batchCost)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600">Плановая выручка:</span>
              <span className="font-medium">{formatCurrency(preview.plannedRevenue)}</span>
            </div>
          </div>
        </div>
      )}

      <Section title="Производство и ответственность">
        <Field label="Фабрика">
          <select value={form.factoryId} onChange={(e) => update("factoryId", e.target.value)} className={inputCls}>
            <option value="">— как в каталоге —</option>
            {factories.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
        </Field>
        <Field label="Ответственный *">
          <select value={form.ownerId} onChange={(e) => update("ownerId", e.target.value)} className={inputCls}>
            {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </Field>
        <Field label="Способ доставки">
          <select value={form.deliveryMethod} onChange={(e) => update("deliveryMethod", e.target.value)} className={inputCls}>
            {Object.entries(DELIVERY_METHOD_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
        <Field label="Упаковка">
          <input value={form.packagingType} onChange={(e) => update("packagingType", e.target.value)} className={inputCls} />
        </Field>
      </Section>

      <Section title="Оплата">
        <Field label="Условия оплаты">
          <input value={form.paymentTerms} onChange={(e) => update("paymentTerms", e.target.value)} className={inputCls} />
        </Field>
        <Field label="Предоплата, ₽">
          <input type="number" step="0.01" value={form.prepaymentAmount} onChange={(e) => update("prepaymentAmount", e.target.value)} className={inputCls} />
        </Field>
        <Field label="Остаток, ₽">
          <input type="number" step="0.01" value={form.finalPaymentAmount} onChange={(e) => update("finalPaymentAmount", e.target.value)} className={inputCls} />
        </Field>
      </Section>

      <Section title="Примечания">
        <div className="md:col-span-2">
          <textarea value={form.notes} onChange={(e) => update("notes", e.target.value)} rows={3} className={inputCls} />
        </div>
      </Section>

      {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      <div className="sticky bottom-0 flex justify-end gap-2 border-t border-slate-200 bg-white pt-4">
        <button type="button" onClick={() => router.back()} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700">
          Отмена
        </button>
        <button type="submit" disabled={saving || !form.productId} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
          {saving ? "Сохранение…" : "Создать заказ"}
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

function Field({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <label className={`block ${full ? "md:col-span-2" : ""}`}>
      <span className="mb-1 block text-sm text-slate-700">{label}</span>
      {children}
    </label>
  );
}
