"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BRAND_LABELS, DEV_TYPE_LABELS, CATEGORIES, DEFAULT_REDEMPTION_PCT } from "@/lib/constants";

type Option = { id: string; name: string };

export function ProductForm({ users, factories }: { users: Option[]; factories: Option[] }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    sku: "",
    name: "",
    brand: "WHITE_ONE",
    developmentType: "OWN",
    category: "Пальто",
    subcategory: "",
    color: "",
    fabric: "",
    sizeChart: "42-52",
    hsCode: "",
    preferredFactoryId: factories[0]?.id ?? "",
    countryOfOrigin: "Китай",
    packagingType: "полибэг",
    purchasePriceCny: "",
    cnyRubRate: "13.5",
    packagingCost: "0",
    wbLogisticsCost: "0",
    wbPrice: "",
    customerPrice: "",
    wbCommissionPct: "17",
    drrPct: "10",
    plannedRedemptionPct: "30",
    liters: "",
    lengthCm: "",
    widthCm: "",
    heightCm: "",
    weightG: "",
    ownerId: users[0]?.id ?? "",
    plannedLaunchMonth: "",
    patternsUrl: "",
    techDocsUrl: "",
    sampleUrl: "",
    notes: "",
  });

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    if (key === "category") {
      const pct = DEFAULT_REDEMPTION_PCT[value as string];
      if (pct) setForm((f) => ({ ...f, plannedRedemptionPct: String(pct) }));
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const payload = {
        ...form,
        purchasePriceCny: form.purchasePriceCny ? Number(form.purchasePriceCny) : null,
        cnyRubRate: form.cnyRubRate ? Number(form.cnyRubRate) : null,
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
        plannedLaunchMonth: form.plannedLaunchMonth ? Number(form.plannedLaunchMonth) : null,
      };
      const res = await fetch("/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const j = await res.json();
        const msg = j?.error?.message ?? "Ошибка сохранения";
        const fields = j?.error?.fields
          ? "\n" + Object.entries(j.error.fields).map(([k, v]) => `• ${k}: ${(v as string[]).join(", ")}`).join("\n")
          : "";
        setError(msg + fields);
        return;
      }
      const product = await res.json();
      router.push(`/products/${product.id}`);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <Section title="Идентификация">
        <Field label="Артикул *">
          <input required value={form.sku} onChange={(e) => update("sku", e.target.value)} className={inputCls} placeholder="П_038_шоколад_безэполет" />
        </Field>
        <Field label="Название *">
          <input required value={form.name} onChange={(e) => update("name", e.target.value)} className={inputCls} />
        </Field>
        <Field label="Бренд *">
          <select value={form.brand} onChange={(e) => update("brand", e.target.value)} className={inputCls}>
            {Object.entries(BRAND_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
        <Field label="Тип разработки">
          <select value={form.developmentType} onChange={(e) => update("developmentType", e.target.value)} className={inputCls}>
            {Object.entries(DEV_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
      </Section>

      <Section title="Классификация">
        <Field label="Категория *">
          <select value={form.category} onChange={(e) => update("category", e.target.value)} className={inputCls}>
            {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
          </select>
        </Field>
        <Field label="Подкатегория">
          <input value={form.subcategory} onChange={(e) => update("subcategory", e.target.value)} className={inputCls} />
        </Field>
        <Field label="Цвет *">
          <input required value={form.color} onChange={(e) => update("color", e.target.value)} className={inputCls} />
        </Field>
        <Field label="Ткань">
          <input value={form.fabric} onChange={(e) => update("fabric", e.target.value)} className={inputCls} />
        </Field>
        <Field label="Размерная сетка">
          <input value={form.sizeChart} onChange={(e) => update("sizeChart", e.target.value)} className={inputCls} />
        </Field>
        <Field label="ТНВЭД">
          <input value={form.hsCode} onChange={(e) => update("hsCode", e.target.value)} className={inputCls} />
        </Field>
      </Section>

      <Section title="Производство">
        <Field label="Фабрика">
          <select value={form.preferredFactoryId} onChange={(e) => update("preferredFactoryId", e.target.value)} className={inputCls}>
            <option value="">—</option>
            {factories.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
        </Field>
        <Field label="Страна производства *">
          <input required value={form.countryOfOrigin} onChange={(e) => update("countryOfOrigin", e.target.value)} className={inputCls} />
        </Field>
        <Field label="Тип упаковки">
          <input value={form.packagingType} onChange={(e) => update("packagingType", e.target.value)} className={inputCls} />
        </Field>
        <Field label="Ответственный *">
          <select value={form.ownerId} onChange={(e) => update("ownerId", e.target.value)} className={inputCls}>
            {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </Field>
        <Field label="Плановый месяц запуска (YYYYMM)">
          <input type="number" value={form.plannedLaunchMonth} onChange={(e) => update("plannedLaunchMonth", e.target.value)} className={inputCls} placeholder="202609" />
        </Field>
      </Section>

      <Section title="Финансы">
        <Field label="Закупка, CNY">
          <input type="number" step="0.01" value={form.purchasePriceCny} onChange={(e) => update("purchasePriceCny", e.target.value)} className={inputCls} />
        </Field>
        <Field label="Курс CNY→RUB">
          <input type="number" step="0.0001" value={form.cnyRubRate} onChange={(e) => update("cnyRubRate", e.target.value)} className={inputCls} />
        </Field>
        <Field label="Упаковка, ₽">
          <input type="number" step="0.01" value={form.packagingCost} onChange={(e) => update("packagingCost", e.target.value)} className={inputCls} />
        </Field>
        <Field label="Логистика WB, ₽">
          <input type="number" step="0.01" value={form.wbLogisticsCost} onChange={(e) => update("wbLogisticsCost", e.target.value)} className={inputCls} />
        </Field>
        <Field label="Цена WB (до СПП), ₽">
          <input type="number" step="0.01" value={form.wbPrice} onChange={(e) => update("wbPrice", e.target.value)} className={inputCls} />
        </Field>
        <Field label="Цена клиенту (после СПП), ₽">
          <input type="number" step="0.01" value={form.customerPrice} onChange={(e) => update("customerPrice", e.target.value)} className={inputCls} />
        </Field>
        <Field label="Комиссия WB, %">
          <input type="number" step="0.01" value={form.wbCommissionPct} onChange={(e) => update("wbCommissionPct", e.target.value)} className={inputCls} />
        </Field>
        <Field label="ДРР, %">
          <input type="number" step="0.01" value={form.drrPct} onChange={(e) => update("drrPct", e.target.value)} className={inputCls} />
        </Field>
        <Field label="% выкупа (план)">
          <input type="number" step="0.01" value={form.plannedRedemptionPct} onChange={(e) => update("plannedRedemptionPct", e.target.value)} className={inputCls} />
        </Field>
      </Section>

      <Section title="Габариты">
        <Field label="Длина, см"><input type="number" step="0.1" value={form.lengthCm} onChange={(e) => update("lengthCm", e.target.value)} className={inputCls} /></Field>
        <Field label="Ширина, см"><input type="number" step="0.1" value={form.widthCm} onChange={(e) => update("widthCm", e.target.value)} className={inputCls} /></Field>
        <Field label="Высота, см"><input type="number" step="0.1" value={form.heightCm} onChange={(e) => update("heightCm", e.target.value)} className={inputCls} /></Field>
        <Field label="Вес, г"><input type="number" value={form.weightG} onChange={(e) => update("weightG", e.target.value)} className={inputCls} /></Field>
        <Field label="Литраж"><input type="number" step="0.01" value={form.liters} onChange={(e) => update("liters", e.target.value)} className={inputCls} /></Field>
      </Section>

      <Section title="Ссылки на Google Drive">
        <Field label="Лекала"><input type="url" value={form.patternsUrl} onChange={(e) => update("patternsUrl", e.target.value)} className={inputCls} placeholder="https://drive.google.com/..." /></Field>
        <Field label="Тех. документация"><input type="url" value={form.techDocsUrl} onChange={(e) => update("techDocsUrl", e.target.value)} className={inputCls} /></Field>
        <Field label="Фото образца"><input type="url" value={form.sampleUrl} onChange={(e) => update("sampleUrl", e.target.value)} className={inputCls} /></Field>
      </Section>

      <Section title="Примечания">
        <div className="md:col-span-2">
          <textarea value={form.notes} onChange={(e) => update("notes", e.target.value)} rows={3} className={inputCls} />
        </div>
      </Section>

      {error && (
        <div className="whitespace-pre-line rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}

      <div className="sticky bottom-0 flex justify-end gap-2 border-t border-slate-200 bg-white pt-4">
        <button type="button" onClick={() => router.back()} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700">
          Отмена
        </button>
        <button type="submit" disabled={saving} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
          {saving ? "Сохранение…" : "Создать"}
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
