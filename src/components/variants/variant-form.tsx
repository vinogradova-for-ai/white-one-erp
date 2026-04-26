"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DropzonePhotos } from "@/components/common/dropzone-photos";
import { parseApiError, type ApiErrorResult } from "@/lib/api-error";
import { FormErrorBanner, FieldError } from "@/components/common/form-errors";

// Минимальная форма создания цвета: артикул + цвет + фото + (опционально артикул ткани / ТНВЭД).
// Пропорция, габариты, факт-выкуп — на форме редактирования, когда понадобятся.
export function VariantForm({ modelId, modelName }: { modelId: string; modelName: string }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [apiErr, setApiErr] = useState<ApiErrorResult | null>(null);

  const [form, setForm] = useState({
    sku: "",
    colorName: "",
    fabricColorCode: "",
    photoUrls: [] as string[],
    notes: "",
  });
  // Пользователь правил SKU руками — не трогаем авто-генерацию больше
  const [skuTouched, setSkuTouched] = useState(false);

  // Авто-артикул = модель + цвет, транслитерировано в ASCII
  function buildSku(color: string) {
    const base = slugifyToAscii(modelName);
    const col = slugifyToAscii(color);
    if (!col) return base;
    return base ? `${base}_${col}` : col;
  }

  function onColorChange(colorName: string) {
    setForm((f) => ({
      ...f,
      colorName,
      sku: skuTouched ? f.sku : buildSku(colorName),
    }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setApiErr(null);

    try {
      const payload = {
        productModelId: modelId,
        sku: form.sku,
        colorName: form.colorName,
        fabricColorCode: form.fabricColorCode || null,
        photoUrls: form.photoUrls,
        notes: form.notes || null,
      };

      const res = await fetch("/api/variants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        setApiErr(await parseApiError(res));
        return;
      }
      const variant = await res.json();
      router.push(`/variants/${variant.id}`);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <Section title="Основное">
        <Field label="Цвет *">
          <input
            required
            value={form.colorName}
            onChange={(e) => onColorChange(e.target.value)}
            className={inputCls}
            placeholder="шоколад"
          />
          <FieldError error={apiErr} field="colorName" />
        </Field>
        <Field label="Артикул *">
          <input
            required
            value={form.sku}
            onChange={(e) => { setSkuTouched(true); setForm({ ...form, sku: e.target.value }); }}
            className={inputCls}
            placeholder="palto-test_shokolad"
          />
          <FieldError error={apiErr} field="sku" />
          <span className="mt-1 block text-xs text-slate-500">
            Автоматически из фасона и цвета. Можно поменять.
          </span>
        </Field>
        <Field label="Артикул цвета у поставщика ткани" full>
          <input
            value={form.fabricColorCode}
            onChange={(e) => setForm({ ...form, fabricColorCode: e.target.value })}
            className={inputCls}
            placeholder="Код, чтобы повторно заказать ткань"
          />
        </Field>
      </Section>

      <Section title="Фотографии">
        <div className="md:col-span-2 space-y-2">
          <p className="text-xs text-slate-500">Необязательно — можно добавить позже.</p>
          <DropzonePhotos
            value={form.photoUrls}
            onChange={(urls) => setForm({ ...form, photoUrls: urls })}
          />
        </div>
      </Section>

      <FormErrorBanner error={apiErr} ignoreFields={["sku", "colorName"]} />

      <div className="sticky bottom-0 flex justify-end gap-2 border-t border-slate-200 bg-white pt-4">
        <button
          type="button"
          onClick={() => router.back()}
          className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm"
        >
          Отмена
        </button>
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {saving ? "Сохранение…" : "Создать цветомодель"}
        </button>
      </div>
    </form>
  );
}

const inputCls =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-900 focus:ring-1 focus:ring-slate-900";

const CYR_TO_LAT: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z",
  и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r",
  с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "ts", ч: "ch", ш: "sh", щ: "sch",
  ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
};

function slugifyToAscii(raw: string): string {
  const lower = raw.trim().toLowerCase();
  let out = "";
  for (const ch of lower) {
    if (CYR_TO_LAT[ch] !== undefined) out += CYR_TO_LAT[ch];
    else if (/[a-z0-9]/.test(ch)) out += ch;
    else if (/[\s_\-]/.test(ch)) out += "-";
  }
  return out.replace(/-+/g, "-").replace(/^-+|-+$/g, "");
}

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
