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
  const totalFact = initialLines.reduce((a, l) => a + (l.quantityActual ?? 0), 0);
  const totalCost = initialLines.reduce((a, l) => a + l.batchCost, 0);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-900">
          Позиции ({initialLines.length}) · {formatNumber(totalQty)} шт
          {totalFact > 0 && (
            <span className="text-emerald-700 dark:text-emerald-300"> · факт {formatNumber(totalFact)}</span>
          )}
          {totalCost > 0 && <span className="text-slate-500 font-normal"> · {formatCurrency(totalCost)}</span>}
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

      {/* Одна размерная матрица на весь заказ: строка = цвет (план + факт),
          размеры в шапке один раз. На узких экранах таблица скроллится вбок,
          колонка с цветом прилипает слева. */}
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full border-separate border-spacing-0 text-sm">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 bg-white px-3 py-2 text-left text-[10px] font-medium uppercase tracking-wider text-slate-500">
                Цвет
              </th>
              {sizes.length > 0 ? (
                sizes.map((s) => (
                  <th key={s} className="min-w-[52px] px-1 py-2 text-center text-[10px] font-medium uppercase tracking-wider text-slate-500">
                    {s}
                  </th>
                ))
              ) : (
                <th className="px-2 py-2 text-center text-[10px] font-medium uppercase tracking-wider text-slate-500">
                  Кол-во
                </th>
              )}
              <th className="px-2 py-2 text-right text-[10px] font-medium uppercase tracking-wider text-slate-500 whitespace-nowrap">
                Итого
              </th>
              <th className="px-2 py-2 text-right text-[10px] font-medium uppercase tracking-wider text-slate-500 whitespace-nowrap">
                Сумма
              </th>
              <th className="w-8" />
            </tr>
          </thead>
          <tbody>
            {initialLines.map((line) => (
              <LineRows
                key={line.id}
                orderId={orderId}
                line={line}
                sizes={sizes}
                modelPhotoUrl={modelPhotoUrl}
                canDelete={initialLines.length > 1}
                onChanged={() => router.refresh()}
              />
            ))}
          </tbody>
        </table>
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

function LineRows({
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

  const hasSizes = sizes.length > 0;
  const qty = hasSizes
    ? Object.values(plan).reduce((a, b) => a + (Number(b) || 0), 0)
    : line.quantity;
  const factQty = hasSizes
    ? Object.values(fact).reduce((a, b) => a + (Number(b) || 0), 0)
    : (line.quantityActual ?? 0);
  const factEmpty = factQty === 0;

  const dirty =
    hasSizes &&
    (JSON.stringify(plan) !== JSON.stringify(line.sizeDistribution ?? {}) ||
      JSON.stringify(fact) !== JSON.stringify(line.sizeDistributionActual ?? {}));

  // Колонки: цвет + размеры (или «Кол-во») + итого + сумма + удаление
  const colCount = 1 + (hasSizes ? sizes.length : 1) + 3;

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
    <>
      {/* Строка «план» — сверху границы группы цвета */}
      <tr>
        <td rowSpan={2} className="sticky left-0 z-10 border-t border-slate-200 bg-white px-3 py-1.5 align-middle">
          <div className="flex items-center gap-2">
            <VariantVisual
              variantPhotoUrl={line.photoUrl}
              modelPhotoUrl={modelPhotoUrl}
              colorName={line.colorName}
              size={36}
              hideBadge
            />
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 text-[13px] font-semibold text-slate-900">
                <ColorChip name={line.colorName} />
                <span className="max-w-[120px] truncate">{line.colorName}</span>
              </div>
              <div className="max-w-[150px] truncate text-[10px] text-slate-400">{line.sku}</div>
            </div>
          </div>
        </td>
        {hasSizes ? (
          sizes.map((s) => (
            <td key={s} className="border-t border-slate-200 px-0.5 pt-1.5 align-middle">
              <CellInput
                value={plan[s]}
                onChange={(n) => setPlan({ ...plan, [s]: n })}
                accent="slate"
              />
            </td>
          ))
        ) : (
          <td className="border-t border-slate-200 px-2 pt-1.5 text-center font-medium tabular-nums text-slate-900">
            {formatNumber(line.quantity)}
          </td>
        )}
        <td className="border-t border-slate-200 px-2 pt-1.5 text-right align-middle whitespace-nowrap">
          <span className="mr-1 text-[9px] uppercase text-slate-400">план</span>
          <span className="font-semibold tabular-nums text-slate-900">{formatNumber(qty)}</span>
        </td>
        <td rowSpan={2} className="border-t border-slate-200 px-2 py-1.5 text-right align-middle text-[12px] text-slate-500 whitespace-nowrap">
          {line.batchCost > 0 ? formatCurrency(line.batchCost) : "—"}
        </td>
        <td rowSpan={2} className="border-t border-slate-200 px-1 py-1.5 text-center align-middle">
          {canDelete && (
            <button
              type="button"
              onClick={remove}
              disabled={saving}
              aria-label="Удалить позицию"
              title="Удалить позицию"
              className="flex h-6 w-6 items-center justify-center rounded-md text-slate-300 transition hover:bg-red-50 dark:hover:bg-red-400/10 hover:text-red-600 dark:hover:text-red-300 disabled:opacity-30"
            >
              ✕
            </button>
          )}
        </td>
      </tr>

      {/* Строка «факт» — тонкая, изумрудная, без верхней границы */}
      <tr>
        {hasSizes ? (
          sizes.map((s) => (
            <td key={s} className="px-0.5 pb-1.5 align-middle">
              <CellInput
                value={fact[s]}
                onChange={(n) => setFact({ ...fact, [s]: n })}
                accent="emerald"
                placeholder="—"
              />
            </td>
          ))
        ) : (
          <td className="px-2 pb-1.5 text-center tabular-nums text-emerald-700 dark:text-emerald-300">
            {line.quantityActual != null ? formatNumber(line.quantityActual) : "—"}
          </td>
        )}
        <td
          className="px-2 pb-1.5 text-right align-middle whitespace-nowrap"
          title={
            factEmpty
              ? "Факт ещё не проставлен — заполни строку «Факт» после ОТК"
              : factQty !== qty
                ? `Расхождение с планом: ${factQty > qty ? "+" : ""}${factQty - qty} шт`
                : "Факт совпадает с планом"
          }
        >
          <span className={`mr-1 text-[9px] uppercase ${factEmpty ? "text-slate-300" : "text-emerald-600 dark:text-emerald-300"}`}>факт</span>
          <span className={`font-semibold tabular-nums ${
            factEmpty ? "text-slate-300" :
            factQty !== qty ? "text-amber-700 dark:text-amber-300" :
            "text-emerald-700 dark:text-emerald-300"
          }`}>
            {factEmpty ? "—" : formatNumber(factQty)}
          </span>
        </td>
      </tr>

      {/* Строка сохранения — появляется только когда есть несохранённые правки */}
      {(dirty || error) && (
        <tr>
          <td colSpan={colCount} className="px-3 pb-2 text-right">
            {error && <span className="mr-3 text-xs text-red-600 dark:text-red-300">{error}</span>}
            {dirty && (
              <button
                type="button"
                onClick={save}
                disabled={saving}
                className="rounded-md bg-slate-900 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-slate-800 disabled:opacity-50"
              >
                {saving ? "…" : "Сохранить"}
              </button>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

function CellInput({
  value,
  onChange,
  accent = "slate",
  placeholder,
}: {
  value: number | undefined;
  onChange: (n: number) => void;
  accent?: "slate" | "emerald";
  placeholder?: string;
}) {
  const ringClass = accent === "emerald"
    ? "border-emerald-200 dark:border-emerald-400/20 focus:border-emerald-400 text-emerald-800 dark:text-emerald-300"
    : "border-slate-200 focus:border-slate-400 text-slate-900";
  const isEmpty = value === undefined || value === 0;
  return (
    <input
      type="text"
      inputMode="numeric"
      value={isEmpty && placeholder ? "" : (value ?? 0)}
      placeholder={placeholder}
      onFocus={(e) => e.target.select()}
      onChange={(e) => {
        const digits = e.target.value.replace(/\D/g, "");
        onChange(digits === "" ? 0 : Number(digits));
      }}
      className={`h-9 w-full min-w-[44px] rounded border bg-white px-1 text-center text-sm font-medium tabular-nums sm:h-8 sm:text-[12px] ${ringClass}`}
    />
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
          inputMode="numeric"
          min={1}
          value={qty}
          onChange={(e) => setQty(Math.max(1, Number(e.target.value) || 1))}
          placeholder="шт"
          className="h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm"
        />
        <button
          type="button"
          onClick={submit}
          disabled={saving || !variantId}
          className="flex h-11 items-center justify-center rounded-lg bg-slate-900 px-4 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {saving ? "Добавление…" : "Добавить"}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="flex h-11 items-center justify-center rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-600"
        >
          Отмена
        </button>
      </div>
      {error && <div className="mt-2 text-xs text-red-600 dark:text-red-300">{error}</div>}
    </div>
  );
}
