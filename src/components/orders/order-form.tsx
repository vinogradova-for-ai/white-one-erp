"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ORDER_TYPE_LABELS, DELIVERY_METHOD_LABELS } from "@/lib/constants";
import { formatCurrency } from "@/lib/format";
import { PhotoThumb } from "@/components/common/photo-thumb";

type VariantOption = {
  id: string;
  sku: string;
  colorName: string;
  modelName: string;
  photoUrl: string | null;
  customerPrice: string | null;
  fullCost: string | null;
  plannedRedemptionPct: string | null;
  sizes: string[];
  defaultSizeProportion: Record<string, number> | null;
  preferredFactoryId: string | null;
};

type Option = { id: string; name: string };

export function OrderForm({
  variants,
  factories,
  users,
  preselectedVariantId,
}: {
  variants: VariantOption[];
  factories: Option[];
  users: Option[];
  preselectedVariantId?: string;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    productVariantId: preselectedVariantId ?? variants[0]?.id ?? "",
    orderType: "SEASONAL",
    season: "Осень 2026",
    launchMonth: "202609",
    quantity: "500",
    factoryId: "",
    ownerId: users[0]?.id ?? "",
    deliveryMethod: "CARGO",
    paymentTerms: "30/70",
    notes: "",
  });

  const variant = useMemo(() => variants.find((v) => v.id === form.productVariantId), [variants, form.productVariantId]);

  // Размерная матрица — автоматически из пропорции × количество
  const sizeDistribution = useMemo(() => {
    if (!variant || !variant.defaultSizeProportion) return {};
    const qty = Number(form.quantity);
    if (!qty) return {};
    const result: Record<string, number> = {};
    const entries = Object.entries(variant.defaultSizeProportion);
    let distributed = 0;
    entries.forEach(([size, pct], idx) => {
      if (idx === entries.length - 1) {
        result[size] = qty - distributed;
      } else {
        const share = Math.floor((qty * pct) / 100);
        result[size] = share;
        distributed += share;
      }
    });
    return result;
  }, [variant, form.quantity]);

  const [sizeOverride, setSizeOverride] = useState<Record<string, number> | null>(null);
  const finalSizeDist = sizeOverride ?? sizeDistribution;
  const sizeTotal = Object.values(finalSizeDist).reduce((a, b) => a + b, 0);

  const preview = useMemo(() => {
    if (!variant || !form.quantity) return null;
    const qty = Number(form.quantity);
    const cost = Number(variant.fullCost ?? 0);
    const price = Number(variant.customerPrice ?? 0);
    const redemption = Number(variant.plannedRedemptionPct ?? 0) / 100;
    return {
      batchCost: cost * qty,
      plannedRevenue: price * redemption * qty,
    };
  }, [variant, form.quantity]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const payload = {
        productVariantId: form.productVariantId,
        orderType: form.orderType,
        season: form.season || null,
        launchMonth: Number(form.launchMonth),
        quantity: Number(form.quantity),
        sizeDistribution: Object.keys(finalSizeDist).length > 0 ? finalSizeDist : null,
        factoryId: form.factoryId || null,
        ownerId: form.ownerId,
        deliveryMethod: form.deliveryMethod || null,
        paymentTerms: form.paymentTerms || null,
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
      <Section title="Вариант и параметры">
        <Field label="Цветовой вариант *" full>
          <select
            required
            value={form.productVariantId}
            onChange={(e) => {
              setForm({ ...form, productVariantId: e.target.value });
              setSizeOverride(null);
            }}
            className={inputCls}
          >
            <option value="">— выберите —</option>
            {variants.map((v) => (
              <option key={v.id} value={v.id}>
                {v.sku} · {v.modelName} · {v.colorName}
              </option>
            ))}
          </select>
        </Field>

        {variant && (
          <div className="md:col-span-2 flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
            <PhotoThumb url={variant.photoUrl} size={56} />
            <div className="text-sm">
              <div className="font-medium">{variant.modelName}</div>
              <div className="text-slate-500">{variant.colorName} · {variant.sku}</div>
            </div>
          </div>
        )}

        <Field label="Тип заказа *">
          <select value={form.orderType} onChange={(e) => setForm({ ...form, orderType: e.target.value })} className={inputCls}>
            {Object.entries(ORDER_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
        <Field label="Сезон">
          <input value={form.season} onChange={(e) => setForm({ ...form, season: e.target.value })} className={inputCls} />
        </Field>
        <Field label="Месяц продаж (YYYYMM) *">
          <input type="number" required value={form.launchMonth} onChange={(e) => setForm({ ...form, launchMonth: e.target.value })} className={inputCls} />
        </Field>
        <Field label="Количество, шт *">
          <input type="number" required min={1} value={form.quantity} onChange={(e) => { setForm({ ...form, quantity: e.target.value }); setSizeOverride(null); }} className={inputCls} />
        </Field>
      </Section>

      {variant && variant.sizes.length > 0 && (
        <Section title={`Распределение по размерам (сумма = ${sizeTotal})`}>
          <div className="md:col-span-2 grid grid-cols-4 gap-2 sm:grid-cols-6">
            {variant.sizes.map((s) => (
              <label key={s} className="rounded-lg border border-slate-200 bg-slate-50 p-2">
                <div className="text-center text-sm font-medium text-slate-900">{s}</div>
                <input
                  type="number"
                  value={finalSizeDist[s] ?? 0}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    setSizeOverride({ ...finalSizeDist, [s]: val });
                  }}
                  className="mt-1 w-full rounded border border-slate-300 bg-white px-1 py-1 text-center text-xs"
                />
              </label>
            ))}
          </div>
          <p className="md:col-span-2 text-xs text-slate-500">
            Автоматически рассчитано по пропорции варианта — можно переопределить.
          </p>
        </Section>
      )}

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

      <Section title="Производство">
        <Field label="Фабрика">
          <select value={form.factoryId} onChange={(e) => setForm({ ...form, factoryId: e.target.value })} className={inputCls}>
            <option value="">— как в фасоне —</option>
            {factories.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
        </Field>
        <Field label="Ответственный *">
          <select value={form.ownerId} onChange={(e) => setForm({ ...form, ownerId: e.target.value })} className={inputCls}>
            {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </Field>
        <Field label="Способ доставки">
          <select value={form.deliveryMethod} onChange={(e) => setForm({ ...form, deliveryMethod: e.target.value })} className={inputCls}>
            {Object.entries(DELIVERY_METHOD_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
        <Field label="Условия оплаты">
          <input value={form.paymentTerms} onChange={(e) => setForm({ ...form, paymentTerms: e.target.value })} className={inputCls} />
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
        <button type="submit" disabled={saving || !form.productVariantId} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
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
