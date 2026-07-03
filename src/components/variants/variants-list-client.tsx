"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { formatCurrency } from "@/lib/format";
import { PRODUCT_VARIANT_STATUS_LABELS, PRODUCT_VARIANT_STATUS_COLORS } from "@/lib/constants";
import { VariantVisual } from "@/components/common/variant-visual";
import { ColorChip } from "@/components/common/color-chip";
import { FilterDropdown } from "@/components/common/filter-dropdown";
import { usePersistedState } from "@/lib/use-persisted-state";
import type { ProductVariantStatus } from "@prisma/client";

// Список цветомоделей (топ-15 UX-аудита): живой поиск без кнопки «Применить»,
// фильтры по фасону и категории, статус в строке.
export type VariantListRow = {
  id: string;
  sku: string;
  colorName: string;
  status: ProductVariantStatus;
  photoUrl: string | null;
  modelId: string;
  modelName: string;
  modelPhotoUrl: string | null;
  category: string;
  cost: number | null;
};

export function VariantsListClient({ rows }: { rows: VariantListRow[] }) {
  const [q, setQ] = useState("");
  const [modelFilter, setModelFilter] = usePersistedState<string[]>("variants:model:v1", []);
  const [catFilter, setCatFilter] = usePersistedState<string[]>("variants:cat:v1", []);

  const modelOptions = useMemo(() => countedOptions(rows.map((r) => r.modelName)), [rows]);
  const catOptions = useMemo(() => countedOptions(rows.map((r) => r.category)), [rows]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (modelFilter.length && !modelFilter.includes(r.modelName)) return false;
      if (catFilter.length && !catFilter.includes(r.category)) return false;
      if (
        needle &&
        !r.sku.toLowerCase().includes(needle) &&
        !r.colorName.toLowerCase().includes(needle) &&
        !r.modelName.toLowerCase().includes(needle)
      ) {
        return false;
      }
      return true;
    });
  }, [rows, q, modelFilter, catFilter]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Поиск: артикул, цвет, фасон…"
          className="h-11 min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none focus:border-slate-900"
        />
        <FilterDropdown label="Фасон" options={modelOptions} value={modelFilter} onChange={setModelFilter} widthClass="w-72" />
        <FilterDropdown label="Категория" options={catOptions} value={catFilter} onChange={setCatFilter} />
        <span className="text-xs text-slate-500">
          {filtered.length}{filtered.length !== rows.length ? ` из ${rows.length}` : ""}
        </span>
      </div>

      {/* Мобильная версия — карточки */}
      <div className="md:hidden space-y-2">
        {filtered.map((v) => (
          <div
            key={v.id}
            className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3"
          >
            <Link href={`/variants/${v.id}`} className="flex min-w-0 flex-1 items-center gap-3 active:bg-slate-50">
              <VariantVisual
                variantPhotoUrl={v.photoUrl}
                modelPhotoUrl={v.modelPhotoUrl}
                colorName={v.colorName}
                size={56}
                hideBadge
              />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-slate-900">{v.modelName}</div>
                <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs">
                  <ColorChip name={v.colorName} />
                  <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${PRODUCT_VARIANT_STATUS_COLORS[v.status]}`}>
                    {PRODUCT_VARIANT_STATUS_LABELS[v.status]}
                  </span>
                </div>
                <div className="mt-1 truncate font-mono text-[11px] text-slate-400">{v.sku}</div>
              </div>
            </Link>
            <div className="shrink-0 text-right">
              <div className="text-xs text-slate-500">{v.cost != null ? formatCurrency(v.cost) : "—"}</div>
              {/* §4 UX-аудита: править цвет прямо из списка */}
              <Link
                href={`/variants/${v.id}/edit`}
                className="mt-1 inline-flex min-h-[36px] items-center rounded-lg border border-slate-300 bg-white px-3 text-xs text-slate-600 active:bg-slate-50"
              >
                Править
              </Link>
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="rounded-xl border border-slate-200 bg-white px-6 py-12 text-center text-sm text-slate-500">
            <div className="mb-2 text-3xl">◎</div>
            Ничего не найдено
          </div>
        )}
      </div>

      {/* Десктопная версия — таблица */}
      <div className="scroll-x-hint hidden md:block">
      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500">Фото</th>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500">Артикул</th>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500">Фасон</th>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500">Цвет</th>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500">Статус</th>
              <th className="px-3 py-2 text-right text-xs font-semibold uppercase text-slate-500">Себест.</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.map((v) => (
              <tr key={v.id} className="hover:bg-slate-50">
                <td className="px-3 py-2">
                  <VariantVisual
                    variantPhotoUrl={v.photoUrl}
                    modelPhotoUrl={v.modelPhotoUrl}
                    colorName={v.colorName}
                    size={48}
                  />
                </td>
                <td className="px-3 py-2">
                  <Link href={`/variants/${v.id}`} className="font-mono text-xs text-slate-700 hover:underline">
                    {v.sku}
                  </Link>
                </td>
                <td className="px-3 py-2">
                  <Link href={`/models/${v.modelId}`} className="text-slate-900 hover:underline">
                    {v.modelName}
                  </Link>
                  <div className="text-xs text-slate-500">{v.category}</div>
                </td>
                <td className="px-3 py-2 text-slate-700"><ColorChip name={v.colorName} /></td>
                <td className="px-3 py-2">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${PRODUCT_VARIANT_STATUS_COLORS[v.status]}`}>
                    {PRODUCT_VARIANT_STATUS_LABELS[v.status]}
                  </span>
                </td>
                <td className="px-3 py-2 text-right text-xs">{v.cost != null ? formatCurrency(v.cost) : "—"}</td>
                <td className="px-3 py-2 text-right">
                  <Link
                    href={`/variants/${v.id}/edit`}
                    className="inline-flex min-h-[32px] items-center rounded-lg border border-slate-300 bg-white px-2.5 text-xs text-slate-600 hover:bg-slate-50"
                  >
                    Править
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && <div className="p-12 text-center text-sm text-slate-500">Ничего не найдено</div>}
      </div>
      </div>
    </div>
  );
}

function countedOptions(values: string[]): Array<{ value: string; label: string; count: number }> {
  const map = new Map<string, number>();
  for (const v of values) map.set(v, (map.get(v) ?? 0) + 1);
  return [...map.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([value, count]) => ({ value, label: value, count }));
}
