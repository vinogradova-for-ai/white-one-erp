"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CATEGORIES, DEFAULT_TAGS } from "@/lib/constants";
import { TagInput } from "@/components/common/tag-input";
import { PhotoUrlsInput } from "@/components/common/photo-urls-input";

type Option = { id: string; name: string; country?: string };

export function ModelEditForm({
  model,
  users,
  factories,
  sizeGrids,
  existingTags,
}: {
  model: {
    id: string;
    name: string;
    category: string;
    subcategory: string;
    tags: string[];
    sizeGridId: string;
    countryOfOrigin: string;
    preferredFactoryId: string;
    developmentType: "OWN" | "REPEAT";
    isRepeat: boolean;
    fabricName: string;
    fabricConsumption: string;
    fabricPricePerMeter: string;
    fabricCurrency: "RUB" | "CNY";
    patternsUrl: string;
    techPackUrl: string;
    photoUrls: string[];
    ownerId: string;
    notes: string;
  };
  users: Option[];
  factories: Option[];
  sizeGrids: Option[];
  existingTags: string[];
}) {
  const router = useRouter();
  const [form, setForm] = useState(model);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tagSuggestions = Array.from(new Set([...existingTags, ...DEFAULT_TAGS]));

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const payload = {
        name: form.name,
        category: form.category,
        subcategory: form.subcategory || null,
        countryOfOrigin: form.countryOfOrigin,
        preferredFactoryId: form.preferredFactoryId || null,
        sizeGridId: form.sizeGridId || null,
        developmentType: form.developmentType,
        isRepeat: form.isRepeat,
        tags: form.tags,
        fabricName: form.fabricName || null,
        fabricConsumption: form.fabricConsumption ? Number(form.fabricConsumption) : null,
        fabricPricePerMeter: form.fabricPricePerMeter ? Number(form.fabricPricePerMeter) : null,
        fabricCurrency: (form.fabricConsumption || form.fabricPricePerMeter) ? form.fabricCurrency : null,
        patternsUrl: form.patternsUrl || null,
        techPackUrl: form.techPackUrl || null,
        photoUrls: form.photoUrls,
        ownerId: form.ownerId,
        notes: form.notes || null,
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
    <form onSubmit={onSubmit} className="space-y-6">
      <Section title="Основное">
        <Field label="Название *" full>
          <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputCls} />
        </Field>
        <Field label="Категория *">
          <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className={inputCls}>
            {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
          </select>
        </Field>
        <Field label="Подкатегория">
          <input value={form.subcategory} onChange={(e) => setForm({ ...form, subcategory: e.target.value })} className={inputCls} />
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
        <Field label="Теги" full>
          <TagInput value={form.tags} onChange={(tags) => setForm({ ...form, tags })} suggestions={tagSuggestions} />
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
        <Field label="Фабрика">
          <select value={form.preferredFactoryId} onChange={(e) => setForm({ ...form, preferredFactoryId: e.target.value })} className={inputCls}>
            <option value="">—</option>
            {factories.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
        </Field>
        <Field label="Размерная сетка">
          <select value={form.sizeGridId} onChange={(e) => setForm({ ...form, sizeGridId: e.target.value })} className={inputCls}>
            <option value="">—</option>
            {sizeGrids.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        </Field>
      </Section>

      <Section title="Ткань (опционально)">
        <Field label="Название ткани">
          <input value={form.fabricName} onChange={(e) => setForm({ ...form, fabricName: e.target.value })} className={inputCls} />
        </Field>
        <Field label="Расход, м/шт">
          <input type="number" step="0.01" value={form.fabricConsumption} onChange={(e) => setForm({ ...form, fabricConsumption: e.target.value })} className={inputCls} />
        </Field>
        <Field label="Цена за метр">
          <input type="number" step="0.01" value={form.fabricPricePerMeter} onChange={(e) => setForm({ ...form, fabricPricePerMeter: e.target.value })} className={inputCls} />
        </Field>
        <Field label="Валюта">
          <select value={form.fabricCurrency} onChange={(e) => setForm({ ...form, fabricCurrency: e.target.value as "RUB" | "CNY" })} className={inputCls}>
            <option value="RUB">₽ рубли</option>
            <option value="CNY">¥ юани</option>
          </select>
        </Field>
      </Section>

      <Section title="Фото фасона">
        <div className="md:col-span-2">
          <PhotoUrlsInput value={form.photoUrls} onChange={(urls) => setForm({ ...form, photoUrls: urls })} />
        </div>
      </Section>

      <Section title="Документация">
        <Field label="Ссылка на лекала" full>
          <input type="url" value={form.patternsUrl} onChange={(e) => setForm({ ...form, patternsUrl: e.target.value })} className={inputCls} />
        </Field>
        <Field label="Ссылка на тех. пакет" full>
          <input type="url" value={form.techPackUrl} onChange={(e) => setForm({ ...form, techPackUrl: e.target.value })} className={inputCls} />
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
          {saving ? "Сохранение…" : "Сохранить"}
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
