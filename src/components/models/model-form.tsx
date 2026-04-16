"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CATEGORIES, DEFAULT_TAGS } from "@/lib/constants";
import { TagInput } from "@/components/common/tag-input";

type Option = { id: string; name: string; country?: string };

export function ModelForm({
  users,
  factories,
  sizeGrids,
  existingTags,
}: {
  users: Option[];
  factories: Option[];
  sizeGrids: Option[];
  existingTags: string[];
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    name: "",
    category: "Пальто",
    subcategory: "",
    countryOfOrigin: "Китай",
    preferredFactoryId: factories.find((f) => f.country === "Китай")?.id ?? factories[0]?.id ?? "",
    sizeGridId: sizeGrids[0]?.id ?? "",
    developmentType: "OWN" as "OWN" | "REPEAT",
    isRepeat: false,
    tags: [] as string[],
    fabricName: "",
    fabricConsumption: "",
    fabricPricePerMeter: "",
    fabricCurrency: "CNY" as "RUB" | "CNY",
    patternsUrl: "",
    techPackUrl: "",
    photoUrls: [] as string[],
    ownerId: users[0]?.id ?? "",
    notes: "",
  });

  const tagSuggestions = Array.from(new Set([...existingTags, ...DEFAULT_TAGS]));

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    if (key === "countryOfOrigin") {
      // Подхватываем фабрику той же страны
      const country = value as string;
      const firstFactory = factories.find((f) => f.country === country);
      if (firstFactory) setForm((f) => ({ ...f, preferredFactoryId: firstFactory.id }));
      setForm((f) => ({ ...f, fabricCurrency: country === "Россия" ? "RUB" : "CNY" }));
    }
  }

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
      const res = await fetch("/api/models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const j = await res.json();
        setError(j?.error?.message ?? "Ошибка сохранения");
        return;
      }
      const model = await res.json();
      router.push(`/models/${model.id}`);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <Section title="Основное">
        <Field label="Название фасона *" full>
          <input required value={form.name} onChange={(e) => update("name", e.target.value)} className={inputCls} placeholder="Пальто Классика Двубортное Миди" />
        </Field>
        <Field label="Категория *">
          <select value={form.category} onChange={(e) => update("category", e.target.value)} className={inputCls}>
            {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
          </select>
        </Field>
        <Field label="Подкатегория">
          <input value={form.subcategory} onChange={(e) => update("subcategory", e.target.value)} className={inputCls} placeholder="Палаццо оверсайз" />
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
        <Field label="Теги" full>
          <TagInput value={form.tags} onChange={(tags) => update("tags", tags)} suggestions={tagSuggestions} />
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
        <Field label="Фабрика">
          <select value={form.preferredFactoryId} onChange={(e) => update("preferredFactoryId", e.target.value)} className={inputCls}>
            <option value="">—</option>
            {factories.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
        </Field>
        <Field label="Размерная сетка">
          <select value={form.sizeGridId} onChange={(e) => update("sizeGridId", e.target.value)} className={inputCls}>
            <option value="">—</option>
            {sizeGrids.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        </Field>
      </Section>

      <Section title="Ткань (опционально)">
        <Field label="Название ткани">
          <input value={form.fabricName} onChange={(e) => update("fabricName", e.target.value)} className={inputCls} placeholder="Диагональ 70% шерсть" />
        </Field>
        <Field label="Расход, м/шт">
          <input type="number" step="0.01" value={form.fabricConsumption} onChange={(e) => update("fabricConsumption", e.target.value)} className={inputCls} />
        </Field>
        <Field label="Цена за метр">
          <input type="number" step="0.01" value={form.fabricPricePerMeter} onChange={(e) => update("fabricPricePerMeter", e.target.value)} className={inputCls} />
        </Field>
        <Field label="Валюта ткани">
          <select value={form.fabricCurrency} onChange={(e) => update("fabricCurrency", e.target.value as "RUB" | "CNY")} className={inputCls}>
            <option value="RUB">₽ (рубли)</option>
            <option value="CNY">¥ (юани)</option>
          </select>
        </Field>
      </Section>

      <Section title="Документация (Google Drive)">
        <Field label="Ссылка на лекала" full>
          <input type="url" value={form.patternsUrl} onChange={(e) => update("patternsUrl", e.target.value)} className={inputCls} placeholder="https://drive.google.com/..." />
        </Field>
        <Field label="Ссылка на тех. пакет" full>
          <input type="url" value={form.techPackUrl} onChange={(e) => update("techPackUrl", e.target.value)} className={inputCls} />
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
