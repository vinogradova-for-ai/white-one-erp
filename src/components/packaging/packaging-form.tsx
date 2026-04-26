"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { PACKAGING_TYPE_LABELS } from "@/lib/constants";
import { PACKAGING_TYPES } from "@/lib/validators/packaging";
import { PackagingType } from "@prisma/client";
import { DropzonePhotos } from "@/components/common/dropzone-photos";
import { parseApiError, type ApiErrorResult } from "@/lib/api-error";
import { FormErrorBanner } from "@/components/common/form-errors";

type Initial = {
  id: string;
  name: string;
  type: PackagingType;
  sku: string;
  description: string;
  photoUrl: string;
  stock: number;
  minStock: number | null;
  notes: string;
  isActive: boolean;
  unitPriceRub: string;
  unitPriceCny: string;
  priceCurrency: "RUB" | "CNY";
  cnyRubRate: string;
  ownerId: string;
};

type UserOption = { id: string; name: string };

const EMPTY: Omit<Initial, "id"> = {
  name: "",
  type: "LABEL",
  sku: "",
  description: "",
  photoUrl: "",
  stock: 0,
  minStock: null,
  notes: "",
  isActive: true,
  unitPriceRub: "",
  unitPriceCny: "",
  priceCurrency: "RUB",
  cnyRubRate: "",
  ownerId: "",
};

export function PackagingForm({
  initial,
  users = [],
  defaultOwnerId,
}: {
  initial?: Initial;
  users?: UserOption[];
  defaultOwnerId?: string | null;
}) {
  const router = useRouter();
  const [form, setForm] = useState(() => {
    if (initial) return initial;
    const owner = defaultOwnerId && users.some((u) => u.id === defaultOwnerId) ? defaultOwnerId : "";
    return { ...EMPTY, ownerId: owner };
  });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [apiErr, setApiErr] = useState<ApiErrorResult | null>(null);
  const skuTouched = useRef<boolean>(Boolean(initial));

  // При создании (и пока пользователь не правил SKU руками) подтягиваем авто-SKU под выбранный тип.
  useEffect(() => {
    if (initial) return;
    if (skuTouched.current) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/packaging/next-sku?type=${form.type}`);
        if (!res.ok) return;
        const { sku } = await res.json();
        if (!cancelled && !skuTouched.current && sku) {
          setForm((f) => ({ ...f, sku }));
        }
      } catch {}
    })();
    return () => {
      cancelled = true;
    };
  }, [form.type, initial]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setApiErr(null);

    const isCny = form.priceCurrency === "CNY";
    const payload = {
      name: form.name.trim(),
      type: form.type,
      sku: form.sku.trim() || null,
      description: form.description.trim() || null,
      photoUrl: form.photoUrl.trim() || null,
      stock: Number(form.stock) || 0,
      minStock: form.minStock != null && form.minStock !== ("" as unknown) ? Number(form.minStock) : null,
      notes: form.notes.trim() || null,
      isActive: form.isActive,
      priceCurrency: (form.unitPriceRub || form.unitPriceCny) ? form.priceCurrency : null,
      unitPriceRub: !isCny && form.unitPriceRub ? Number(form.unitPriceRub) : null,
      unitPriceCny: isCny && form.unitPriceCny ? Number(form.unitPriceCny) : null,
      cnyRubRate: isCny && form.cnyRubRate ? Number(form.cnyRubRate) : null,
      ownerId: form.ownerId || null,
    };

    try {
      const isEdit = initial && "id" in initial && initial.id;
      const url = isEdit ? `/api/packaging/${initial.id}` : "/api/packaging";
      const method = isEdit ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        setApiErr(await parseApiError(res));
        return;
      }
      if (isEdit) {
        router.push(`/packaging/${initial.id}`);
      } else {
        const created = await res.json();
        router.push(`/packaging/${created.id}`);
      }
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  async function onDelete() {
    if (!initial) return;
    if (!confirm(`Удалить «${form.name}»? Это действие нельзя отменить.`)) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/packaging/${initial.id}`, { method: "DELETE" });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        alert(j?.error?.message ?? "Не удалось удалить");
        return;
      }
      router.push("/packaging");
      router.refresh();
    } finally {
      setDeleting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-sm text-slate-700">Название *</span>
          <input
            required
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
            placeholder="Бирка навесная с логотипом"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-sm text-slate-700">Тип *</span>
          <select
            value={form.type}
            onChange={(e) => setForm({ ...form, type: e.target.value as PackagingType })}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
          >
            {PACKAGING_TYPES.map((t) => (
              <option key={t} value={t}>
                {PACKAGING_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="mb-1 block text-sm text-slate-700">Внутренний код (SKU)</span>
          <input
            value={form.sku}
            onChange={(e) => {
              skuTouched.current = true;
              setForm({ ...form, sku: e.target.value });
            }}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
            placeholder="BIR-001"
          />
          {!initial && (
            <span className="mt-1 block text-xs text-slate-500">
              Заполняется автоматически, можно поменять.
            </span>
          )}
        </label>

      </div>

      <div>
        <div className="mb-1 text-sm text-slate-700">Фото</div>
        <DropzonePhotos
          value={form.photoUrl ? [form.photoUrl] : []}
          onChange={(urls) => setForm({ ...form, photoUrl: urls[urls.length - 1] ?? "" })}
        />
      </div>

      <label className="block">
        <span className="mb-1 block text-sm text-slate-700">Описание</span>
        <textarea
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          rows={2}
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
          placeholder="Размер, материал, требования к печати"
        />
      </label>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-sm text-slate-700">На складе (шт)</span>
          <input
            type="text"
            inputMode="numeric"
            value={String(form.stock)}
            onChange={(e) =>
              setForm({ ...form, stock: Number(e.target.value.replace(/\D/g, "")) || 0 })
            }
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
          />
        </label>

      </div>

      <fieldset className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
        <legend className="px-1 text-sm font-semibold uppercase tracking-wide text-slate-500">Стоимость</legend>
        <div className="grid gap-3 md:grid-cols-3">
          <label className="block">
            <span className="mb-1 block text-sm text-slate-700">Валюта</span>
            <select
              value={form.priceCurrency}
              onChange={(e) => setForm({ ...form, priceCurrency: e.target.value as "RUB" | "CNY" })}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
            >
              <option value="RUB">₽ рубли</option>
              <option value="CNY">¥ юани</option>
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-sm text-slate-700">
              Цена за штуку ({form.priceCurrency === "CNY" ? "¥" : "₽"})
            </span>
            <input
              type="text"
              inputMode="decimal"
              value={form.priceCurrency === "CNY" ? form.unitPriceCny : form.unitPriceRub}
              onChange={(e) => {
                const v = e.target.value.replace(",", ".");
                setForm(form.priceCurrency === "CNY" ? { ...form, unitPriceCny: v } : { ...form, unitPriceRub: v });
              }}
              placeholder={form.priceCurrency === "CNY" ? "0.5" : "5"}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
            />
          </label>
          {form.priceCurrency === "CNY" && (
            <label className="block">
              <span className="mb-1 block text-sm text-slate-700">Курс ¥ → ₽</span>
              <input
                type="text"
                inputMode="decimal"
                value={form.cnyRubRate}
                onChange={(e) => setForm({ ...form, cnyRubRate: e.target.value.replace(",", ".") })}
                placeholder="12.5"
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
              />
            </label>
          )}
        </div>
        {form.priceCurrency === "CNY" && form.unitPriceCny && form.cnyRubRate && (
          <p className="text-xs text-slate-500">
            ≈ {(Number(form.unitPriceCny) * Number(form.cnyRubRate)).toLocaleString("ru-RU", { maximumFractionDigits: 2 })} ₽ за штуку
          </p>
        )}
      </fieldset>

      {users.length > 0 && (
        <label className="block">
          <span className="mb-1 block text-sm text-slate-700">Ответственный</span>
          <select
            value={form.ownerId}
            onChange={(e) => setForm({ ...form, ownerId: e.target.value })}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
          >
            <option value="">— не назначен —</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
        </label>
      )}

      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={form.isActive}
          onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
          className="h-4 w-4"
        />
        <span className="text-sm text-slate-700">Активна (показывать в списках выбора)</span>
      </label>

      <FormErrorBanner error={apiErr} />

      <div className="flex justify-between pt-2">
        {initial ? (
          <button
            type="button"
            onClick={onDelete}
            disabled={deleting}
            className="rounded-lg border border-red-200 bg-white px-4 py-2 text-sm text-red-700 hover:bg-red-50 disabled:opacity-50"
          >
            {deleting ? "Удаление…" : "Удалить"}
          </button>
        ) : (
          <span />
        )}

        <div className="flex gap-2">
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
            {saving ? "Сохранение…" : initial ? "Сохранить" : "Создать"}
          </button>
        </div>
      </div>
    </form>
  );
}
