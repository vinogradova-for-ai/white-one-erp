"use client";

import { useMemo } from "react";
import { toast } from "sonner";
import { FilterDropdown } from "@/components/common/filter-dropdown";
import { usePersistedState } from "@/lib/use-persisted-state";
import type { HonestSignRow } from "./build-rows";

// Колонки таблицы = целевой набор атрибутов для карточки ЧЗ.
// key совпадает с полем HonestSignRow. hole=true — колонка, где пустое значение
// это «дыра» для ЧЗ (подсвечиваем красным и пишем «— не заполнено»).
const COLUMNS: Array<{ key: keyof HonestSignRow; label: string; hole?: boolean; width?: string }> = [
  { key: "name", label: "Наименование", width: "min-w-[280px]" },
  { key: "sku", label: "Артикул", width: "min-w-[160px]" },
  { key: "brand", label: "Товарный знак" },
  { key: "category", label: "Вид одежды" },
  { key: "gender", label: "Целевой пол" },
  { key: "colorName", label: "Цвет", hole: true },
  { key: "size", label: "Размер" },
  { key: "composition", label: "Состав", hole: true, width: "min-w-[180px]" },
  { key: "tnved", label: "ТНВЭД", hole: true },
  { key: "country", label: "Страна производства" },
];

// Значения этих ячеек уходят в буфер/файл; порядок — как в COLUMNS.
function rowValue(row: HonestSignRow, key: keyof HonestSignRow): string {
  return String(row[key] ?? "");
}

export function HonestSignTable({ rows }: { rows: HonestSignRow[] }) {
  const [catFilter, setCatFilter] = usePersistedState<string[]>("hs:cat:v1", []);
  const [modelFilter, setModelFilter] = usePersistedState<string[]>("hs:model:v1", []);
  const [colorFilter, setColorFilter] = usePersistedState<string[]>("hs:color:v1", []);

  // Опции фильтров — из всех строк (не из отфильтрованных), чтобы список не «схлопывался».
  const catOptions = useMemo(
    () => uniqueOptions(rows.map((r) => r.category)),
    [rows],
  );
  const modelOptions = useMemo(
    () => uniqueOptions(rows.map((r) => r.modelName)),
    [rows],
  );
  const colorOptions = useMemo(
    () => uniqueOptions(rows.map((r) => r.colorName)),
    [rows],
  );

  const filtered = useMemo(
    () =>
      rows.filter(
        (r) =>
          (catFilter.length === 0 || catFilter.includes(r.category)) &&
          (modelFilter.length === 0 || modelFilter.includes(r.modelName)) &&
          (colorFilter.length === 0 || colorFilter.includes(r.colorName)),
      ),
    [rows, catFilter, modelFilter, colorFilter],
  );

  async function copyText(text: string, note: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(note);
    } catch {
      toast.error("Не удалось скопировать");
    }
  }

  // Клик по ячейке — копируем её значение.
  function copyCell(row: HonestSignRow, key: keyof HonestSignRow) {
    copyText(rowValue(row, key), "Скопировано");
  }

  // Клик по «№» строки — вся строка через таб (готово для вставки в Excel/форму ЧЗ).
  function copyRow(row: HonestSignRow) {
    const line = COLUMNS.map((c) => rowValue(row, c.key)).join("\t");
    copyText(line, "Строка скопирована");
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <FilterDropdown
          label="Категория"
          options={catOptions}
          value={catFilter}
          onChange={setCatFilter}
        />
        <FilterDropdown
          label="Фасон"
          options={modelOptions}
          value={modelFilter}
          onChange={setModelFilter}
          widthClass="w-72"
        />
        <FilterDropdown
          label="Цветомодель"
          options={colorOptions}
          value={colorFilter}
          onChange={setColorFilter}
        />
        <span className="ml-auto text-xs text-slate-500">
          Строк: {filtered.length}
          {filtered.length !== rows.length ? ` из ${rows.length}` : ""}
        </span>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="w-full border-collapse text-left text-xs">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-slate-500">
              <th className="sticky left-0 z-10 bg-slate-50 px-2 py-2 text-center font-medium">
                №
              </th>
              {COLUMNS.map((c) => (
                <th key={c.key} className="px-3 py-2 font-medium whitespace-nowrap">
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={COLUMNS.length + 1} className="px-3 py-8 text-center text-slate-400">
                  Нет цветомоделей под текущие фильтры.
                </td>
              </tr>
            )}
            {filtered.map((row, i) => (
              <tr
                key={`${row.variantId}-${row.size}`}
                className="border-b border-slate-100 last:border-0 hover:bg-slate-50"
              >
                <td
                  className="sticky left-0 z-10 cursor-pointer bg-white px-2 py-1.5 text-center text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                  title="Скопировать всю строку (через таб)"
                  onClick={() => copyRow(row)}
                >
                  {i + 1}
                </td>
                {COLUMNS.map((c) => {
                  const raw = rowValue(row, c.key);
                  const isHole = Boolean(c.hole) && raw.trim() === "";
                  return (
                    <td
                      key={c.key}
                      className={`cursor-pointer px-3 py-1.5 align-top ${
                        c.width ?? ""
                      } ${
                        isHole
                          ? "bg-red-50 text-red-500 italic"
                          : "text-slate-700 hover:bg-slate-100"
                      }`}
                      title={isHole ? "Не заполнено — нужно для ЧЗ" : "Скопировать ячейку"}
                      onClick={() => copyCell(row, c.key)}
                    >
                      {isHole ? "— не заполнено" : raw}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Уникальные значения → опции для FilterDropdown, отсортированные, с count.
function uniqueOptions(values: string[]): Array<{ value: string; label: string; count: number }> {
  const counts = new Map<string, number>();
  for (const v of values) {
    if (!v) continue;
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .sort((a, b) => a[0].localeCompare(b[0], "ru"))
    .map(([value, count]) => ({ value, label: value, count }));
}
