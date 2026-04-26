"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CATEGORIES, BRAND_LABELS } from "@/lib/constants";
import { PackagingType } from "@prisma/client";
import { DropzonePhotos } from "@/components/common/dropzone-photos";
import { SizeGridPicker } from "@/components/common/size-grid-picker";
import { PackagingPicker } from "@/components/common/packaging-picker";
import { parseApiError, type ApiErrorResult } from "@/lib/api-error";
import { FormErrorBanner, FieldError } from "@/components/common/form-errors";

type Option = { id: string; name: string; country?: string };
type SizeGridOption = { id: string; name: string; sizes: string[] };
type PackagingOption = { id: string; name: string; type: PackagingType; photoUrl?: string | null };

type PackagingPick = { packagingItemId: string };

// Форма создания фасона. Минимум, что нужно на момент заведения:
// название, бренд, категория, ткань, страна/фабрика, размерная сетка, документы, фото.
// Экономика (закупка, WB-цена, комиссия и т.п.) — заполняется на странице редактирования,
// когда уже согласовано с фабрикой.
// Размерная пропорция тоже не здесь — штуки по размерам раскладываются только при создании заказа.
export function ModelForm({
  users,
  factories,
  sizeGrids,
  packagingItems,
  defaultOwnerId,
  defaultTargetCostCny = "",
  defaultTargetCostRub = "",
}: {
  users: Option[];
  factories: Option[];
  sizeGrids: SizeGridOption[];
  packagingItems: PackagingOption[];
  defaultOwnerId?: string | null;
  defaultTargetCostCny?: string;
  defaultTargetCostRub?: string;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [apiErr, setApiErr] = useState<ApiErrorResult | null>(null);

  const [form, setForm] = useState({
    name: "",
    brand: "WHITE_ONE" as "WHITE_ONE" | "SERDCEBIENIE",
    category: "Пальто",
    subcategory: "",
    countryOfOrigin: "Китай",
    preferredFactoryId: factories.find((f) => f.country === "Китай")?.id ?? factories[0]?.id ?? "",
    sizeGridId: sizeGrids[0]?.id ?? "",
    developmentType: "OWN" as "OWN" | "REPEAT",
    isRepeat: false,
    fabricName: "",
    fabricComposition: "",
    fabricConsumption: "",
    fabricPricePerMeter: "",
    fabricCurrency: "CNY" as "RUB" | "CNY",
    // Себестоимость изделия (закуп у фабрики)
    purchaseCurrency: "CNY" as "RUB" | "CNY",
    purchasePriceRub: "",
    purchasePriceCny: "",
    cnyRubRate: "",
    patternsUrl: "",
    photoUrls: [] as string[],
    ownerId: (defaultOwnerId && users.some((u) => u.id === defaultOwnerId)) ? defaultOwnerId : (users[0]?.id ?? ""),
    notes: "",
    hsCode: "",
    targetCostCny: defaultTargetCostCny,
    targetCostRub: defaultTargetCostRub,
    targetCostNote: "",
    packagingPicks: [] as PackagingPick[],
  });

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    if (key === "countryOfOrigin") {
      const country = value as string;
      const firstFactory = factories.find((f) => f.country === country);
      if (firstFactory) setForm((f) => ({ ...f, preferredFactoryId: firstFactory.id }));
      setForm((f) => ({ ...f, fabricCurrency: country === "Россия" ? "RUB" : "CNY" }));
    }
  }

  // --- Комплект упаковки ---
  function addPackagingPick() {
    setForm((f) => ({
      ...f,
      packagingPicks: [...f.packagingPicks, { packagingItemId: "" }],
    }));
  }
  function removePackagingPick(idx: number) {
    setForm((f) => ({ ...f, packagingPicks: f.packagingPicks.filter((_, i) => i !== idx) }));
  }
  function updatePackagingPick(idx: number, patch: Partial<PackagingPick>) {
    setForm((f) => ({
      ...f,
      packagingPicks: f.packagingPicks.map((p, i) => (i === idx ? { ...p, ...patch } : p)),
    }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setApiErr(null);
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
        cnyRubRate: form.fabricCurrency === "CNY" && form.cnyRubRate ? Number(form.cnyRubRate) : null,
        patternsUrl: form.patternsUrl || null,
        photoUrls: form.photoUrls,
        ownerId: form.ownerId,
        notes: form.notes || null,
        hsCode: form.hsCode || null,
        targetCostCny: form.targetCostCny ? Number(form.targetCostCny) : null,
        targetCostRub: form.targetCostRub ? Number(form.targetCostRub) : null,
        targetCostNote: form.targetCostNote || null,
      };
      const res = await fetch("/api/models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        setApiErr(await parseApiError(res));
        return;
      }
      const model = await res.json();

      // Сохраним комплект упаковки, если выбран
      const validPicks = form.packagingPicks.filter((p) => p.packagingItemId);
      for (const p of validPicks) {
        await fetch(`/api/models/${model.id}/packaging`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            packagingItemId: p.packagingItemId,
            quantityPerUnit: 1,
          }),
        });
      }

      router.push(`/models/${model.id}`);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  const usedPackagingIds = new Set(form.packagingPicks.map((p) => p.packagingItemId).filter(Boolean));

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <Section title="Основное">
        <Field label="Название фасона *" full>
          <input required value={form.name} onChange={(e) => update("name", e.target.value)} className={inputCls} placeholder="Пальто Классика Двубортное Миди" />
          <FieldError error={apiErr} field="name" />
        </Field>
        <Field label="Бренд *">
          <select value={form.brand} onChange={(e) => update("brand", e.target.value as "WHITE_ONE" | "SERDCEBIENIE")} className={inputCls}>
            {Object.entries(BRAND_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
        <Field label="Категория *">
          <select value={form.category} onChange={(e) => update("category", e.target.value)} className={inputCls}>
            {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
          </select>
        </Field>
        <Field label="Тип разработки">
          <select value={form.developmentType} onChange={(e) => update("developmentType", e.target.value as "OWN" | "REPEAT")} className={inputCls}>
            <option value="OWN">Собственный дизайн</option>
            <option value="REPEAT">Повтор</option>
          </select>
        </Field>
        <Field label="Ответственный *">
          <select value={form.ownerId} onChange={(e) => update("ownerId", e.target.value)} className={inputCls}>
            {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </Field>
      </Section>

      <Section title="Производство">
        <Field label="Страна *">
          <select value={form.countryOfOrigin} onChange={(e) => update("countryOfOrigin", e.target.value)} className={inputCls}>
            <option>Россия</option>
            <option>Китай</option>
            <option>Кыргызстан</option>
          </select>
        </Field>
        <Field label="Фабрика (по умолчанию)">
          <select value={form.preferredFactoryId} onChange={(e) => update("preferredFactoryId", e.target.value)} className={inputCls}>
            <option value="">—</option>
            {factories.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
        </Field>
        <Field label="Размерная сетка">
          <SizeGridPicker
            value={form.sizeGridId}
            onChange={(id) => update("sizeGridId", id)}
            grids={sizeGrids}
          />
          <span className="mt-1 block text-xs text-slate-500">
            Штуки по размерам раскладываются позже, при создании заказа.
          </span>
        </Field>
      </Section>

      <Section title="Ткань (опционально)">
        <Field label="Название ткани">
          <input value={form.fabricName} onChange={(e) => update("fabricName", e.target.value)} className={inputCls} placeholder="Диагональ" />
        </Field>
        <Field label="Состав">
          <input value={form.fabricComposition} onChange={(e) => update("fabricComposition", e.target.value)} className={inputCls} placeholder="70% шерсть, 30% полиэстер" />
        </Field>
      </Section>

      <Section title="Целевая себестоимость (план на момент разработки)">
        <Field label={`Таргет, ${form.countryOfOrigin === "Китай" ? "¥" : "₽"}`}>
          <input
            type="number"
            step="0.01"
            value={form.countryOfOrigin === "Китай" ? form.targetCostCny : form.targetCostRub}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                ...(f.countryOfOrigin === "Китай"
                  ? { targetCostCny: e.target.value }
                  : { targetCostRub: e.target.value }),
              }))
            }
            className={inputCls}
            placeholder={form.countryOfOrigin === "Китай" ? "например, 120" : "например, 1500"}
          />
          <span className="mt-1 block text-xs text-slate-500">
            Прикидка до согласования с фабрикой. Точная фиксируется в заказе.
          </span>
        </Field>
        <Field label="Комментарий к таргету">
          <input
            value={form.targetCostNote}
            onChange={(e) => update("targetCostNote", e.target.value)}
            className={inputCls}
            placeholder="например, без учёта упаковки"
          />
        </Field>
      </Section>

      <Section title="Фото фасона">
        <div className="md:col-span-2">
          <DropzonePhotos hideLink value={form.photoUrls} onChange={(urls) => setForm((f) => ({ ...f, photoUrls: urls }))} />
          <p className="mt-1 text-xs text-slate-500">
            Фото можно добавить позже. Но для перехода фасона в статус «Образец» минимум одно фото обязательно.
          </p>
        </div>
      </Section>

      <Section title="Документация (Google Drive / Яндекс.Диск)">
        <Field label="Ссылка на папку с материалами" full>
          <input
            type="url"
            value={form.patternsUrl}
            onChange={(e) => update("patternsUrl", e.target.value)}
            className={inputCls}
            placeholder="https://drive.google.com/… или https://disk.yandex.ru/…"
          />
          <span className="mt-1 block text-xs text-slate-500">
            Одна общая ссылка на папку, где лежат лекала, тех. пакет, фото образцов и всё остальное.
          </span>
        </Field>
      </Section>

      <Section title="Комплект упаковки">
        <div className="md:col-span-2 space-y-2">
          {form.packagingPicks.length > 0 ? (
            <div className="space-y-2">
              {form.packagingPicks.map((p, idx) => {
                const options = packagingItems.filter(
                  (opt) => opt.id === p.packagingItemId || !usedPackagingIds.has(opt.id),
                );
                return (
                  <div key={idx} className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 sm:flex-row">
                    <div className="flex-1">
                      <PackagingPicker
                        value={p.packagingItemId}
                        options={options}
                        onChange={(id) => updatePackagingPick(idx, { packagingItemId: id })}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => removePackagingPick(idx)}
                      className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                    >
                      Убрать
                    </button>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-xs text-slate-500">
              Пока не выбрано. Добавьте бирки, размерники, полибэги и т.п. — этот комплект автоматически применится при создании заказа на любой цвет этого фасона.
            </p>
          )}
          <button
            type="button"
            onClick={addPackagingPick}
            disabled={packagingItems.length === 0}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            + Добавить упаковку
          </button>
          {packagingItems.length === 0 && (
            <p className="text-xs text-slate-400">
              Справочник упаковки пуст — сначала создайте карточки в разделе «Упаковка».
            </p>
          )}
        </div>
      </Section>

      <FormErrorBanner error={apiErr} ignoreFields={["name"]} />

      <div className="sticky bottom-0 flex justify-end gap-2 border-t border-slate-200 bg-white pt-4">
        <button type="button" onClick={() => router.back()} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700">
          Отмена
        </button>
        <button type="submit" disabled={saving} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
          {saving ? "Сохранение…" : "Создать фасон"}
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
