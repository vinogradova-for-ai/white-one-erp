"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DropzonePhotos } from "@/components/common/dropzone-photos";

// Минимум: идентификация + фото. Остальные поля не редактируются здесь.
type Initial = {
  sku: string;
  colorName: string;
  fabricColorCode: string;
  photoUrls: string[];
};

export function VariantEditForm({
  variantId,
  initial,
}: {
  variantId: string;
  initial: Initial;
}) {
  const router = useRouter();
  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    if (form.photoUrls.length === 0) {
      setError("Должна быть минимум одна фотография");
      setSaving(false);
      return;
    }

    try {
      const payload = {
        sku: form.sku,
        colorName: form.colorName,
        fabricColorCode: form.fabricColorCode || null,
        photoUrls: form.photoUrls,
      };
      const res = await fetch(`/api/variants/${variantId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const j = await res.json();
        setError(j?.error?.message ?? "Ошибка");
        return;
      }
      router.push(`/variants/${variantId}`);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <Section title="Идентификация">
        <Field label="Артикул">
          <input required value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} className={inputCls} />
        </Field>
        <Field label="Цвет">
          <input required value={form.colorName} onChange={(e) => setForm({ ...form, colorName: e.target.value })} className={inputCls} />
        </Field>
        <Field label="Артикул цвета у поставщика ткани" full>
          <input value={form.fabricColorCode} onChange={(e) => setForm({ ...form, fabricColorCode: e.target.value })} className={inputCls} placeholder="Код, чтобы повторно заказать ткань" />
        </Field>
      </Section>

      <Section title="Фотографии (минимум 1)">
        <div className="md:col-span-2">
          <DropzonePhotos value={form.photoUrls} onChange={(urls) => setForm({ ...form, photoUrls: urls })} />
        </div>
      </Section>

      {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      <div className="sticky bottom-0 z-30 flex flex-wrap justify-end gap-3 border-t border-slate-200 bg-white pt-4 pb-4 -mx-2 px-2 sm:mx-0 sm:px-0">
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
