"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PhotoUrlsInput } from "@/components/common/photo-urls-input";

export function VariantForm({
  modelId,
  countryOfOrigin,
  sizes,
  defaultRedemption,
}: {
  modelId: string;
  countryOfOrigin: string;
  sizes: string[];
  defaultRedemption: number;
}) {
  const router = useRouter();
  const isChina = countryOfOrigin === "Китай";
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Дефолтная пропорция — равномерно
  const defaultProp: Record<string, number> = {};
  if (sizes.length > 0) {
    const share = Math.round(100 / sizes.length);
    sizes.forEach((s, i) => {
      defaultProp[s] = i === sizes.length - 1 ? 100 - share * (sizes.length - 1) : share;
    });
  }

  const [form, setForm] = useState({
    sku: "",
    colorName: "",
    pantoneCode: "",
    photoUrls: [] as string[],
    purchasePriceCny: "",
    purchasePriceRub: "",
    cnyRubRate: "13.5",
    packagingCost: "0",
    wbLogisticsCost: "0",
    wbPrice: "",
    customerPrice: "",
    wbCommissionPct: "17",
    drrPct: "10",
    plannedRedemptionPct: String(defaultRedemption),
    lengthCm: "",
    widthCm: "",
    heightCm: "",
    weightG: "",
    liters: "",
    hsCode: "",
    packagingType: "полибэг",
    sizeProportion: defaultProp as Record<string, number>,
    notes: "",
  });

  function updateProportion(size: string, pct: number) {
    setForm((f) => ({ ...f, sizeProportion: { ...f.sizeProportion, [size]: pct } }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    if (form.photoUrls.length === 0) {
      setError("Добавьте хотя бы одну фотографию — это обязательно");
      setSaving(false);
      return;
    }

    try {
      const payload = {
        productModelId: modelId,
        sku: form.sku,
        colorName: form.colorName,
        pantoneCode: form.pantoneCode || null,
        photoUrls: form.photoUrls,
        defaultSizeProportion: form.sizeProportion,
        purchasePriceCny: isChina && form.purchasePriceCny ? Number(form.purchasePriceCny) : null,
        purchasePriceRub: !isChina && form.purchasePriceRub ? Number(form.purchasePriceRub) : null,
        cnyRubRate: isChina && form.cnyRubRate ? Number(form.cnyRubRate) : null,
        packagingCost: Number(form.packagingCost),
        wbLogisticsCost: Number(form.wbLogisticsCost),
        wbPrice: form.wbPrice ? Number(form.wbPrice) : null,
        customerPrice: form.customerPrice ? Number(form.customerPrice) : null,
        wbCommissionPct: Number(form.wbCommissionPct),
        drrPct: Number(form.drrPct),
        plannedRedemptionPct: Number(form.plannedRedemptionPct),
        liters: form.liters ? Number(form.liters) : null,
        lengthCm: form.lengthCm ? Number(form.lengthCm) : null,
        widthCm: form.widthCm ? Number(form.widthCm) : null,
        heightCm: form.heightCm ? Number(form.heightCm) : null,
        weightG: form.weightG ? Number(form.weightG) : null,
        hsCode: form.hsCode || null,
        packagingType: form.packagingType || null,
        notes: form.notes || null,
      };

      const res = await fetch("/api/variants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const j = await res.json();
        setError(j?.error?.message ?? "Ошибка сохранения");
        return;
      }
      const variant = await res.json();
      router.push(`/variants/${variant.id}`);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  const propTotal = Object.values(form.sizeProportion).reduce((a, b) => a + b, 0);

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <Section title="Основное">
        <Field label="Артикул *">
          <input required value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} className={inputCls} placeholder="П_038_шоколад" />
        </Field>
        <Field label="Цвет *">
          <input required value={form.colorName} onChange={(e) => setForm({ ...form, colorName: e.target.value })} className={inputCls} placeholder="шоколад" />
        </Field>
        <Field label="Код Pantone">
          <input value={form.pantoneCode} onChange={(e) => setForm({ ...form, pantoneCode: e.target.value })} className={inputCls} placeholder="18-1418 TCX" />
        </Field>
        <Field label="ТНВЭД">
          <input value={form.hsCode} onChange={(e) => setForm({ ...form, hsCode: e.target.value })} className={inputCls} />
        </Field>
      </Section>

      <Section title="Фотографии (обязательно минимум 1) *">
        <div className="md:col-span-2">
          <PhotoUrlsInput value={form.photoUrls} onChange={(urls) => setForm({ ...form, photoUrls: urls })} />
        </div>
      </Section>

      {sizes.length > 0 && (
        <Section title={`Размерная пропорция (сумма = ${propTotal}%)`}>
          <div className="md:col-span-2 grid grid-cols-4 gap-2 sm:grid-cols-6">
            {sizes.map((s) => (
              <label key={s} className="rounded-lg border border-slate-200 bg-slate-50 p-2">
                <div className="text-center text-sm font-medium text-slate-900">{s}</div>
                <input
                  type="number"
                  value={form.sizeProportion[s] ?? 0}
                  onChange={(e) => updateProportion(s, Number(e.target.value))}
                  className="mt-1 w-full rounded border border-slate-300 bg-white px-1 py-1 text-center text-xs"
                />
              </label>
            ))}
          </div>
        </Section>
      )}

      <Section title={`Закупка (${isChina ? "Китай" : "Россия"})`}>
        {isChina ? (
          <>
            <Field label="Закупка, ¥">
              <input type="number" step="0.01" value={form.purchasePriceCny} onChange={(e) => setForm({ ...form, purchasePriceCny: e.target.value })} className={inputCls} />
            </Field>
            <Field label="Курс ¥ → ₽">
              <input type="number" step="0.0001" value={form.cnyRubRate} onChange={(e) => setForm({ ...form, cnyRubRate: e.target.value })} className={inputCls} />
            </Field>
          </>
        ) : (
          <Field label="Закупка, ₽" full>
            <input type="number" step="0.01" value={form.purchasePriceRub} onChange={(e) => setForm({ ...form, purchasePriceRub: e.target.value })} className={inputCls} />
          </Field>
        )}
        <Field label="Упаковка, ₽">
          <input type="number" step="0.01" value={form.packagingCost} onChange={(e) => setForm({ ...form, packagingCost: e.target.value })} className={inputCls} />
        </Field>
        <Field label="Логистика WB, ₽">
          <input type="number" step="0.01" value={form.wbLogisticsCost} onChange={(e) => setForm({ ...form, wbLogisticsCost: e.target.value })} className={inputCls} />
        </Field>
      </Section>

      <Section title="Цены и проценты">
        <Field label="Цена WB (до СПП), ₽">
          <input type="number" step="0.01" value={form.wbPrice} onChange={(e) => setForm({ ...form, wbPrice: e.target.value })} className={inputCls} />
        </Field>
        <Field label="Цена для клиента, ₽">
          <input type="number" step="0.01" value={form.customerPrice} onChange={(e) => setForm({ ...form, customerPrice: e.target.value })} className={inputCls} />
        </Field>
        <Field label="Комиссия WB, %">
          <input type="number" step="0.01" value={form.wbCommissionPct} onChange={(e) => setForm({ ...form, wbCommissionPct: e.target.value })} className={inputCls} />
        </Field>
        <Field label="ДРР, %">
          <input type="number" step="0.01" value={form.drrPct} onChange={(e) => setForm({ ...form, drrPct: e.target.value })} className={inputCls} />
        </Field>
        <Field label="% выкупа (план)">
          <input type="number" step="0.01" value={form.plannedRedemptionPct} onChange={(e) => setForm({ ...form, plannedRedemptionPct: e.target.value })} className={inputCls} />
        </Field>
      </Section>

      <Section title="Габариты">
        <Field label="Длина, см"><input type="number" step="0.1" value={form.lengthCm} onChange={(e) => setForm({ ...form, lengthCm: e.target.value })} className={inputCls} /></Field>
        <Field label="Ширина, см"><input type="number" step="0.1" value={form.widthCm} onChange={(e) => setForm({ ...form, widthCm: e.target.value })} className={inputCls} /></Field>
        <Field label="Высота, см"><input type="number" step="0.1" value={form.heightCm} onChange={(e) => setForm({ ...form, heightCm: e.target.value })} className={inputCls} /></Field>
        <Field label="Вес, г"><input type="number" value={form.weightG} onChange={(e) => setForm({ ...form, weightG: e.target.value })} className={inputCls} /></Field>
        <Field label="Литраж"><input type="number" step="0.01" value={form.liters} onChange={(e) => setForm({ ...form, liters: e.target.value })} className={inputCls} /></Field>
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
          {saving ? "Сохранение…" : "Создать вариант"}
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
