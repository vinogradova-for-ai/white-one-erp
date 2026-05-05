"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CATEGORIES, BRAND_LABELS } from "@/lib/constants";
import { Brand } from "@prisma/client";
import { DropzonePhotos } from "@/components/common/dropzone-photos";
import { SizeGridPicker } from "@/components/common/size-grid-picker";

type Option = { id: string; name: string; country?: string };
type SizeGridOption = { id: string; name: string; sizes: string[] };

export function ModelEditForm({
  model,
  users,
  factories,
  sizeGrids,
}: {
  model: {
    id: string;
    name: string;
    brand: Brand;
    category: string;
    subcategory: string;
    sizeGridId: string;
    countryOfOrigin: string;
    preferredFactoryId: string;
    developmentType: "OWN" | "REPEAT";
    isRepeat: boolean;
    fabricName: string;
    fabricComposition: string;
    fabricConsumption: string;
    fabricPricePerMeter: string;
    fabricCurrency: "RUB" | "CNY";
    patternsUrl: string;
    photoUrls: string[];
    ownerId: string;
    notes: string;
    purchasePriceCny: string;
    purchasePriceRub: string;
    cnyRubRate: string;
    packagingCost: string;
    wbLogisticsCost: string;
    wbPrice: string;
    customerPrice: string;
    wbCommissionPct: string;
    drrPct: string;
    plannedRedemptionPct: string;
    targetCostCny: string;
    targetCostRub: string;
    targetCostNote: string;
    patternsDate: string;
    sampleDate: string;
    approvedDate: string;
    productionStartDate: string;
    plannedLaunchMonth: number | null;
  };
  users: Option[];
  factories: Option[];
  sizeGrids: SizeGridOption[];
}) {
  const router = useRouter();
  const [form, setForm] = useState(model);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isChina = form.countryOfOrigin === "Китай";
  const currentSizes = sizeGrids.find((g) => g.id === form.sizeGridId)?.sizes ?? [];

  function changeSizeGrid(id: string) {
    setForm({ ...form, sizeGridId: id });
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const payload = {
        name: form.name,
        brand: form.brand,
        category: form.category,
        subcategory: form.subcategory || null,
        countryOfOrigin: form.countryOfOrigin,
        preferredFactoryId: form.preferredFactoryId || null,
        sizeGridId: form.sizeGridId || null,
        developmentType: form.developmentType,
        isRepeat: form.isRepeat,
        fabricName: form.fabricName || null,
        fabricComposition: form.fabricComposition || null,
        fabricPricePerMeter: form.fabricPricePerMeter ? Number(form.fabricPricePerMeter) : null,
        fabricCurrency: form.fabricPricePerMeter ? form.fabricCurrency : null,
        patternsUrl: form.patternsUrl || null,
        photoUrls: form.photoUrls,
        ownerId: form.ownerId,
        notes: form.notes || null,
        purchasePriceCny: isChina && form.purchasePriceCny ? Number(form.purchasePriceCny) : null,
        purchasePriceRub: !isChina && form.purchasePriceRub ? Number(form.purchasePriceRub) : null,
        cnyRubRate: isChina && form.cnyRubRate ? Number(form.cnyRubRate) : null,
        packagingCost: Number(form.packagingCost || 0),
        wbLogisticsCost: Number(form.wbLogisticsCost || 0),
        wbPrice: form.wbPrice ? Number(form.wbPrice) : null,
        customerPrice: form.customerPrice ? Number(form.customerPrice) : null,
        wbCommissionPct: Number(form.wbCommissionPct || 0),
        drrPct: Number(form.drrPct || 0),
        plannedRedemptionPct: form.plannedRedemptionPct ? Number(form.plannedRedemptionPct) : null,
        targetCostCny: form.targetCostCny ? Number(form.targetCostCny) : null,
        targetCostRub: form.targetCostRub ? Number(form.targetCostRub) : null,
        targetCostNote: form.targetCostNote || null,
        patternsDate: form.patternsDate || null,
        sampleDate: form.sampleDate || null,
        approvedDate: form.approvedDate || null,
        productionStartDate: form.productionStartDate || null,
        plannedLaunchMonth: form.plannedLaunchMonth ?? null,
      };
      const res = await fetch(`/api/models/${model.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const j = await res.json();
        setError(j?.error?.message ?? "Ошибка");
        return;
      }
      router.push(`/models/${model.id}`);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <form id="model-edit-form" onSubmit={onSubmit} className="space-y-6">
      <Section title="Основное">
        <Field label="Название *" full>
          <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputCls} />
        </Field>
        <Field label="Бренд *">
          <select value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value as Brand })} className={inputCls}>
            {Object.entries(BRAND_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
        <Field label="Категория *">
          <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className={inputCls}>
            {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
          </select>
        </Field>
        <Field label="Тип разработки">
          <select value={form.developmentType} onChange={(e) => setForm({ ...form, developmentType: e.target.value as "OWN" | "REPEAT" })} className={inputCls}>
            <option value="OWN">Собственный дизайн</option>
            <option value="REPEAT">Повтор</option>
          </select>
        </Field>
        <Field label="Ответственный *">
          <select value={form.ownerId} onChange={(e) => setForm({ ...form, ownerId: e.target.value })} className={inputCls}>
            {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </Field>
      </Section>

      <Section title="Производство">
        <Field label="Страна *">
          <select value={form.countryOfOrigin} onChange={(e) => setForm({ ...form, countryOfOrigin: e.target.value })} className={inputCls}>
            <option>Россия</option>
            <option>Китай</option>
            <option>Кыргызстан</option>
          </select>
        </Field>
        <Field label="Фабрика (по умолчанию)">
          <select value={form.preferredFactoryId} onChange={(e) => setForm({ ...form, preferredFactoryId: e.target.value })} className={inputCls}>
            <option value="">—</option>
            {factories.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
          <span className="mt-1 block text-xs text-slate-500">
            Предлагается при создании заказов, в каждом заказе можно поменять.
          </span>
        </Field>
        <Field label="Размерная сетка">
          <SizeGridPicker
            value={form.sizeGridId}
            onChange={changeSizeGrid}
            grids={sizeGrids}
          />
        </Field>
      </Section>

      <Section title="Целевая себестоимость (план на момент разработки)">
        <Field label="Таргет">
          <div className="flex items-stretch gap-2">
            <input
              type="number"
              step="0.01"
              value={form.targetCostRub}
              onChange={(e) => setForm({ ...form, targetCostRub: e.target.value })}
              className={`${inputCls} flex-1`}
              placeholder="₽"
            />
            <span className="self-center text-sm text-slate-400">₽</span>
            <span className="self-center text-sm text-slate-300">/</span>
            <input
              type="number"
              step="0.01"
              value={form.targetCostCny}
              onChange={(e) => setForm({ ...form, targetCostCny: e.target.value })}
              className={`${inputCls} flex-1`}
              placeholder="¥"
            />
            <span className="self-center text-sm text-slate-400">¥</span>
          </div>
          <span className="mt-1 block text-xs text-slate-500">
            Введи в той валюте, в которой удобно. Можно обе. Прикидка до согласования с фабрикой.
          </span>
        </Field>
        <Field label="Комментарий к таргету">
          <input
            value={form.targetCostNote}
            onChange={(e) => setForm({ ...form, targetCostNote: e.target.value })}
            className={inputCls}
            placeholder="например, без учёта упаковки"
          />
        </Field>
      </Section>

      <Section title="Ткань (опционально)">
        <Field label="Название ткани">
          <input value={form.fabricName} onChange={(e) => setForm({ ...form, fabricName: e.target.value })} className={inputCls} placeholder="Диагональ" />
        </Field>
        <Field label="Состав">
          <input value={form.fabricComposition} onChange={(e) => setForm({ ...form, fabricComposition: e.target.value })} className={inputCls} placeholder="70% шерсть, 30% полиэстер" />
        </Field>
      </Section>

      <Section title="Фото фасона">
        <div className="md:col-span-2">
          <DropzonePhotos value={form.photoUrls} onChange={(urls) => setForm({ ...form, photoUrls: urls })} />
        </div>
      </Section>

      <Section title="Документация (Google Drive / Яндекс.Диск)">
        <Field label="Ссылка на папку с материалами" full>
          <input
            type="url"
            value={form.patternsUrl}
            onChange={(e) => setForm({ ...form, patternsUrl: e.target.value })}
            className={inputCls}
            placeholder="https://drive.google.com/… или https://disk.yandex.ru/…"
          />
          <span className="mt-1 block text-xs text-slate-500">
            Одна общая ссылка на папку, где лежат лекала, тех. пакет, фото образцов и всё остальное.
          </span>
        </Field>
      </Section>

      <Section title="Этапы разработки">
        <Field label="Лекала готовы">
          <input
            type="date"
            value={form.patternsDate}
            onChange={(e) => setForm({ ...form, patternsDate: e.target.value })}
            className={inputCls}
          />
        </Field>
        <Field label="Образец получен">
          <input
            type="date"
            value={form.sampleDate}
            onChange={(e) => setForm({ ...form, sampleDate: e.target.value })}
            className={inputCls}
          />
        </Field>
        <Field label="Утверждён">
          <input
            type="date"
            value={form.approvedDate}
            onChange={(e) => setForm({ ...form, approvedDate: e.target.value })}
            className={inputCls}
          />
        </Field>
        <Field label="Запуск производства">
          <input
            type="date"
            value={form.productionStartDate}
            onChange={(e) => setForm({ ...form, productionStartDate: e.target.value })}
            className={inputCls}
          />
        </Field>
        <Field label="Плановый месяц запуска (YYYYMM)" full>
          <input
            type="number"
            min={202501}
            max={203012}
            value={form.plannedLaunchMonth ?? ""}
            onChange={(e) => setForm({ ...form, plannedLaunchMonth: e.target.value ? Number(e.target.value) : null })}
            className={inputCls}
            placeholder="например, 202608"
          />
          <span className="mt-1 block text-xs text-slate-500">
            До этой даты тянется активная фаза в Ганте, если конкретные даты этапов ещё не заполнены.
          </span>
        </Field>
      </Section>


      {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>}
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
