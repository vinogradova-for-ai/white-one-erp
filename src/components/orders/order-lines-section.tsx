"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { VariantVisual } from "@/components/common/variant-visual";
import { VariantPicker } from "@/components/common/variant-picker";
import { formatCurrency, formatNumber } from "@/lib/format";
import { colorHexFromName, isLightColor } from "@/lib/color-map";

function ColorChip({ name }: { name: string }) {
  const hex = colorHexFromName(name);
  const ring = isLightColor(hex) ? "ring-1 ring-slate-300" : "";
  return (
    <span
      aria-hidden
      className={`inline-block h-3 w-3 shrink-0 rounded-full ${ring}`}
      style={{ backgroundColor: hex }}
    />
  );
}

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
  quantity: number;                       // План — сколько заказали
  quantityActual: number | null;          // Факт — сколько получили после ОТК (null = не проставлено)
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
  // Факт по размерам — фабрика часто накраивает другую размерную матрицу.
  // Если все ячейки нули → факт не проставлен (sizeDistributionActual=null,
  // quantityActual=null). Если что-то введено — сохраняем и общее quantityActual
  // = сумма по размерам.
  const [fact, setFact] = useState<Record<string, number>>(line.sizeDistributionActual ?? {});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const qty = Object.values(plan).reduce((a, b) => a + (Number(b) || 0), 0);
  const factQty = Object.values(fact).reduce((a, b) => a + (Number(b) || 0), 0);
  const factEmpty = factQty === 0;

  const dirty =
    JSON.stringify(plan) !== JSON.stringify(line.sizeDistribution ?? {}) ||
    JSON.stringify(fact) !== JSON.stringify(line.sizeDistributionActual ?? {});

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/orders/${orderId}/lines/${line.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          quantity: qty,
          quantityActual: factEmpty ? null : factQty,
          sizeDistribution: Object.keys(plan).length > 0 ? plan : null,
          sizeDistributionActual: factEmpty ? null : fact,
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
    <div className="group relative rounded-xl border border-slate-200 bg-white p-2.5">
      {canDelete && (
        <button
          type="button"
          onClick={remove}
          disabled={saving}
          aria-label="Удалить позицию"
          title="Удалить позицию"
          className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-md text-slate-400 opacity-0 transition hover:bg-red-50 hover:text-red-600 group-hover:opacity-100 focus:opacity-100 disabled:opacity-30"
        >
          ✕
        </button>
      )}
      {/* На мобиле фото+название+итоги стоят в одной строке, а размерная
          матрица переносится на следующую строку с полной шириной (иначе
          6 размеров на 390px зажимаются между фото и правым блоком в
          ~3-5px колонки и цифры слипаются в «11155»).
          На ≥md всё в одну строку как раньше. */}
      <div className="flex flex-wrap items-start gap-3 md:flex-nowrap md:items-center">
        <VariantVisual
          variantPhotoUrl={line.photoUrl}
          modelPhotoUrl={modelPhotoUrl}
          colorName={line.colorName}
          size={44}
          hideBadge
        />
        <div className="min-w-0 order-3 basis-full md:order-none md:flex-1 md:basis-auto">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <ColorChip name={line.colorName} />
            <span className="truncate">{line.colorName}</span>
            <span className="truncate text-[11px] font-normal text-slate-400">{line.sku}</span>
          </div>
          {sizes.length > 0 && (
            <div className="mt-1.5 space-y-1">
              <div className="flex items-center gap-2">
                <span className="w-10 shrink-0 text-[10px] uppercase tracking-wider text-slate-500">План</span>
                <div className="flex-1 min-w-0">
                  <SizeRow sizes={sizes} dist={plan} onChange={setPlan} accent="slate" />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-10 shrink-0 text-[10px] uppercase tracking-wider text-emerald-600">Факт</span>
                <div className="flex-1 min-w-0">
                  <SizeRow sizes={sizes} dist={fact} onChange={setFact} accent="emerald" placeholder="—" />
                </div>
              </div>
            </div>
          )}
        </div>
        <div className="ml-auto flex shrink-0 flex-col items-end gap-0.5 pl-2 pr-6">
          <div className="flex items-baseline gap-1">
            <span className="text-[9px] uppercase text-slate-400">план</span>
            <div className="text-sm font-semibold text-slate-900">{qty} <span className="text-[11px] font-normal text-slate-500">шт</span></div>
          </div>
          <div
            className="flex items-baseline gap-1"
            title={
              factEmpty
                ? "Факт ещё не проставлен — заполни строку «Факт» после ОТК"
                : factQty !== qty
                  ? `Расхождение с планом: ${factQty > qty ? "+" : ""}${factQty - qty} шт`
                  : "Факт совпадает с планом"
            }
          >
            <span className={`text-[9px] uppercase ${factEmpty ? "text-slate-300" : "text-emerald-600"}`}>факт</span>
            <div className={`text-sm font-semibold ${
              factEmpty ? "text-slate-300" :
              factQty !== qty ? "text-amber-700" :
              "text-emerald-700"
            }`}>
              {factEmpty ? "—" : factQty}{!factEmpty && <span className="text-[11px] font-normal text-slate-500"> шт</span>}
            </div>
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">{formatCurrency(line.batchCost)}</div>
          {dirty && (
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="mt-1 rounded-md bg-slate-900 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-slate-800 disabled:opacity-50"
            >
              {saving ? "…" : "Сохранить"}
            </button>
          )}
        </div>
      </div>
      {error && <div className="mt-2 text-xs text-red-600">{error}</div>}
    </div>
  );
}

function SizeRow({
  sizes,
  dist,
  onChange,
  accent = "slate",
  placeholder,
}: {
  sizes: string[];
  dist: Record<string, number>;
  onChange: (v: Record<string, number>) => void;
  accent?: "slate" | "emerald";
  placeholder?: string;
}) {
  const ringClass = accent === "emerald"
    ? "border-emerald-200 focus:border-emerald-400 text-emerald-800"
    : "border-slate-200 focus:border-slate-400 text-slate-900";
  return (
    <div>
      <div
        className="grid gap-1"
        style={{ gridTemplateColumns: `repeat(${sizes.length}, minmax(0, 1fr))` }}
      >
        {sizes.map((s) => {
          const val = dist[s];
          const isEmpty = val === undefined || val === 0;
          return (
            <label key={s} className="block min-w-0">
              {/* Подписи размеров рисуем только для верхнего ряда (План).
                  Для нижнего ряда (Факт) — нет, чтобы не дублировать. */}
              {accent === "slate" && (
                <div className="text-center text-[10px] leading-none text-slate-500">{s}</div>
              )}
              <input
                type="text"
                inputMode="numeric"
                value={isEmpty && placeholder ? "" : (val ?? 0)}
                placeholder={placeholder}
                onFocus={(e) => e.target.select()}
                onChange={(e) => {
                  const digits = e.target.value.replace(/\D/g, "");
                  const n = digits === "" ? 0 : Number(digits);
                  onChange({ ...dist, [s]: n });
                }}
                className={`mt-0.5 h-9 w-full rounded border bg-white px-1 text-center text-sm font-medium tabular-nums sm:h-7 sm:text-[11px] ${ringClass}`}
              />
            </label>
          );
        })}
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
