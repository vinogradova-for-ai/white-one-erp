"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { VariantVisual } from "@/components/common/variant-visual";
import { VariantPicker } from "@/components/common/variant-picker";
import { formatCurrency, formatNumber } from "@/lib/format";

type Variant = {
  id: string;
  sku: string;
  colorName: string;
  photoUrls: string[];
};

type Line = {
  id: string;
  productVariantId: string;
  sku: string;
  colorName: string;
  photoUrl: string | null;
  quantity: number;
  sizeDistribution: Record<string, number> | null;
  sizeDistributionActual: Record<string, number> | null;
  batchCost: number;
};

export function OrderLinesSection({
  orderId,
  sizes,
  initialLines,
  modelVariants,
  modelPhotoUrl,
}: {
  orderId: string;
  sizes: string[];
  initialLines: Line[];
  modelVariants: Variant[];
  modelPhotoUrl: string | null;
}) {
  const router = useRouter();
  const [addingOpen, setAddingOpen] = useState(false);

  const usedVariantIds = new Set(initialLines.map((l) => l.productVariantId));
  const availableVariants = modelVariants.filter((v) => !usedVariantIds.has(v.id));

  const totalQty = initialLines.reduce((a, l) => a + l.quantity, 0);
  const totalCost = initialLines.reduce((a, l) => a + l.batchCost, 0);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-900">
          Позиции ({initialLines.length}) · {formatNumber(totalQty)} шт · {formatCurrency(totalCost)}
        </h2>
        {availableVariants.length > 0 && !addingOpen && (
          <button
            type="button"
            onClick={() => setAddingOpen(true)}
            className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800"
          >
            + Добавить цвет
          </button>
        )}
      </div>

      <div className="space-y-3">
        {initialLines.map((line) => (
          <LineCard
            key={line.id}
            orderId={orderId}
            line={line}
            sizes={sizes}
            modelPhotoUrl={modelPhotoUrl}
            canDelete={initialLines.length > 1}
            onChanged={() => router.refresh()}
          />
        ))}
      </div>

      {addingOpen && (
        <AddLineForm
          orderId={orderId}
          sizes={sizes}
          availableVariants={availableVariants}
          onClose={() => setAddingOpen(false)}
          onAdded={() => {
            setAddingOpen(false);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function LineCard({
  orderId,
  line,
  sizes,
  modelPhotoUrl,
  canDelete,
  onChanged,
}: {
  orderId: string;
  line: Line;
  sizes: string[];
  modelPhotoUrl: string | null;
  canDelete: boolean;
  onChanged: () => void;
}) {
  const [plan, setPlan] = useState<Record<string, number>>(line.sizeDistribution ?? {});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const qty = Object.values(plan).reduce((a, b) => a + (Number(b) || 0), 0);

  const dirty = JSON.stringify(plan) !== JSON.stringify(line.sizeDistribution ?? {});

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/orders/${orderId}/lines/${line.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          quantity: qty,
          sizeDistribution: Object.keys(plan).length > 0 ? plan : null,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j?.error?.message ?? "Ошибка сохранения");
        return;
      }
      onChanged();
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!confirm(`Удалить позицию «${line.colorName}»?`)) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/orders/${orderId}/lines/${line.id}`, { method: "DELETE" });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        alert(j?.error?.message ?? "Не удалось удалить");
      } else {
        onChanged();
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex items-start gap-3">
        <VariantVisual
          variantPhotoUrl={line.photoUrl}
          modelPhotoUrl={modelPhotoUrl}
          colorName={line.colorName}
          size={56}
        />
        <div className="flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <div>
              <div className="font-semibold text-slate-900">{line.colorName}</div>
              <div className="text-xs text-slate-500">{line.sku}</div>
            </div>
            <div className="text-right text-sm">
              <div className="flex items-baseline justify-end gap-1">
                <span className="text-xs text-slate-500">Количество:</span>
                <span className="text-base font-semibold text-slate-900">{qty}</span>
                <span className="text-xs text-slate-500">шт</span>
              </div>
              <div className="mt-0.5 text-xs text-slate-500">
                {formatCurrency(line.batchCost)}
              </div>
            </div>
          </div>

          {sizes.length > 0 && (
            <div className="mt-3 space-y-2">
              <SizeRow
                label="Размеры"
                sizes={sizes}
                dist={plan}
                onChange={setPlan}
              />
            </div>
          )}

          {error && <div className="mt-2 text-xs text-red-600">{error}</div>}

          <div className="mt-3 flex items-center justify-end gap-2">
            {canDelete && (
              <button
                type="button"
                onClick={remove}
                disabled={saving}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50"
              >
                Удалить
              </button>
            )}
            <button
              type="button"
              onClick={save}
              disabled={!dirty || saving}
              className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50"
            >
              {saving ? "Сохранение…" : "Сохранить"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function SizeRow({
  label,
  sizes,
  dist,
  onChange,
}: {
  label: string;
  sizes: string[];
  dist: Record<string, number>;
  onChange: (v: Record<string, number>) => void;
}) {
  return (
    <div>
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1 grid grid-cols-4 gap-1 sm:grid-cols-6 md:grid-cols-8">
        {sizes.map((s) => (
          <label key={s} className="block">
            <div className="text-center text-[10px] font-medium text-slate-600">{s}</div>
            <input
              type="text"
              inputMode="numeric"
              value={dist[s] ?? 0}
              onFocus={(e) => e.target.select()}
              onChange={(e) => {
                const digits = e.target.value.replace(/\D/g, "");
                const n = digits === "" ? 0 : Number(digits);
                onChange({ ...dist, [s]: n });
              }}
              className="mt-0.5 w-full rounded border border-slate-300 bg-white px-1 py-1 text-center text-xs"
            />
          </label>
        ))}
      </div>
    </div>
  );
}

function AddLineForm({
  orderId,
  sizes,
  availableVariants,
  onClose,
  onAdded,
}: {
  orderId: string;
  sizes: string[];
  availableVariants: Variant[];
  onClose: () => void;
  onAdded: () => void;
}) {
  const [variantId, setVariantId] = useState(availableVariants[0]?.id ?? "");
  const [qty, setQty] = useState(500);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setSaving(true);
    setError(null);
    try {
      // Размеры распределяем ровно вручную не стоим — сервер просто сохранит пустое, пользователь доредактирует в карточке.
      const sizeDist: Record<string, number> = {};
      if (sizes.length > 0) {
        const base = Math.floor(qty / sizes.length);
        const rest = qty - base * sizes.length;
        sizes.forEach((s, idx) => {
          sizeDist[s] = idx === 0 ? base + rest : base;
        });
      }
      const res = await fetch(`/api/orders/${orderId}/lines`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productVariantId: variantId,
          quantity: qty,
          sizeDistribution: Object.keys(sizeDist).length > 0 ? sizeDist : null,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j?.error?.message ?? "Ошибка добавления");
        return;
      }
      onAdded();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4">
      <h3 className="text-sm font-semibold text-slate-700">Новая позиция</h3>
      <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_160px_auto_auto]">
        <VariantPicker
          value={variantId}
          onChange={setVariantId}
          options={availableVariants.map((v) => ({
            id: v.id,
            sku: v.sku,
            colorName: v.colorName,
            photoUrl: v.photoUrls?.[0] ?? null,
          }))}
        />
        <input
          type="number"
          min={1}
          value={qty}
          onChange={(e) => setQty(Math.max(1, Number(e.target.value) || 1))}
          placeholder="шт"
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
        />
        <button
          type="button"
          onClick={submit}
          disabled={saving || !variantId}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {saving ? "Добавление…" : "Добавить"}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-600"
        >
          Отмена
        </button>
      </div>
      {error && <div className="mt-2 text-xs text-red-600">{error}</div>}
    </div>
  );
}
