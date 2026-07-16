"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FilterDropdown } from "@/components/common/filter-dropdown";
import { usePersistedState } from "@/lib/use-persisted-state";
import type { HonestSignRow } from "./build-rows";

// Порядок колонок для копирования строк/выгрузки — как в XLSX-роуте.
// Компоновка экрана другая (карточки по цветомоделям), но буфер обмена
// отдаёт те же колонки в том же порядке, чтобы вставка в Excel/ЧЗ совпадала.
const COLUMNS: Array<{ key: keyof HonestSignRow; label: string }> = [
  { key: "name", label: "Наименование" },
  { key: "sku", label: "Артикул" },
  { key: "brand", label: "Товарный знак" },
  { key: "category", label: "Вид одежды" },
  { key: "gender", label: "Целевой пол" },
  { key: "colorName", label: "Цвет" },
  { key: "size", label: "Размер" },
  { key: "composition", label: "Состав" },
  { key: "tnved", label: "ТНВЭД" },
  { key: "country", label: "Страна производства" },
];

// Общие поля цветомодели (одинаковы для всех её размеров) — показываем ОДИН раз
// в шапке карточки, а не в каждой строке. hole=true — пустота критична для ЧЗ.
const COMMON_FIELDS: Array<{ key: keyof HonestSignRow; label: string; hole?: boolean }> = [
  { key: "category", label: "Вид одежды" },
  { key: "colorName", label: "Цвет", hole: true },
  { key: "composition", label: "Состав", hole: true },
  { key: "tnved", label: "ТНВЭД", hole: true },
  { key: "country", label: "Страна" },
  { key: "brand", label: "Товарный знак" },
  { key: "gender", label: "Целевой пол" },
];

function rowValue(row: HonestSignRow, key: keyof HonestSignRow): string {
  return String(row[key] ?? "");
}

// Дыра для ЧЗ: не заполнено хоть одно критичное поле (цвет/состав/ТНВЭД).
function isHoleRow(r: HonestSignRow): boolean {
  return COMMON_FIELDS.some((f) => f.hole && !String(r[f.key] ?? "").trim());
}

export function HonestSignTable({ rows }: { rows: HonestSignRow[] }) {
  const [catFilter, setCatFilter] = usePersistedState<string[]>("hs:cat:v1", []);
  const [modelFilter, setModelFilter] = usePersistedState<string[]>("hs:model:v1", []);
  const [colorFilter, setColorFilter] = usePersistedState<string[]>("hs:color:v1", []);
  // Топ-14: работать надо с дырявыми — фильтр «только незаполненные» запоминается.
  const [holesOnly, setHolesOnly] = usePersistedState<boolean>("hs:holes-only:v1", false);

  // Опции фильтров — из всех строк (не из отфильтрованных), чтобы список не «схлопывался».
  const catOptions = useMemo(() => uniqueOptions(rows.map((r) => r.category)), [rows]);
  const modelOptions = useMemo(() => uniqueOptions(rows.map((r) => r.modelName)), [rows]);
  const colorOptions = useMemo(() => uniqueOptions(rows.map((r) => r.colorName)), [rows]);

  const filtered = useMemo(
    () =>
      rows.filter(
        (r) =>
          (catFilter.length === 0 || catFilter.includes(r.category)) &&
          (modelFilter.length === 0 || modelFilter.includes(r.modelName)) &&
          (colorFilter.length === 0 || colorFilter.includes(r.colorName)) &&
          (!holesOnly || isHoleRow(r)),
      ),
    [rows, catFilter, modelFilter, colorFilter, holesOnly],
  );

  // Счётчик дыр — по ВСЕМ строкам (не по фильтру), чтобы цифра была честной.
  const holeCount = useMemo(() => rows.filter(isHoleRow).length, [rows]);

  // Группируем строки по цветомодели: одна карточка = фасон+цвет, внутри размеры.
  const groups = useMemo(() => {
    const map = new Map<string, HonestSignRow[]>();
    for (const r of filtered) {
      const list = map.get(r.variantId);
      if (list) list.push(r);
      else map.set(r.variantId, [r]);
    }
    return Array.from(map.values());
  }, [filtered]);

  async function copyText(text: string, note: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(note);
    } catch {
      toast.error("Не удалось скопировать");
    }
  }

  function copyRow(row: HonestSignRow) {
    const line = COLUMNS.map((c) => rowValue(row, c.key)).join("\t");
    copyText(line, "Строка скопирована");
  }

  // Все размеры цветомодели одним блоком (строки через перенос, колонки через таб).
  function copyGroup(group: HonestSignRow[]) {
    const block = group
      .map((row) => COLUMNS.map((c) => rowValue(row, c.key)).join("\t"))
      .join("\n");
    copyText(block, `Скопированы все размеры (${group.length})`);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <FilterDropdown label="Категория" options={catOptions} value={catFilter} onChange={setCatFilter} />
        <FilterDropdown label="Фасон" options={modelOptions} value={modelFilter} onChange={setModelFilter} widthClass="w-72" />
        <FilterDropdown label="Цветомодель" options={colorOptions} value={colorFilter} onChange={setColorFilter} />
        <button
          type="button"
          onClick={() => setHolesOnly((v) => !v)}
          className={`inline-flex min-h-[36px] items-center gap-1.5 rounded-full px-3 text-xs font-medium ${
            holesOnly
              ? "bg-red-600 text-white"
              : holeCount > 0
                ? "bg-red-50 text-red-700 hover:bg-red-100 dark:bg-red-400/10 dark:text-red-300 dark:hover:bg-red-400/20"
                : "bg-slate-100 text-slate-500"
          }`}
        >
          дыр по ЧЗ: {holeCount}
          <span className="opacity-80">{holesOnly ? "· показаны только они ✕" : "· показать только их"}</span>
        </button>
        <span className="ml-auto text-xs text-slate-500">
          Цветомоделей: {groups.length} · строк: {filtered.length}
          {filtered.length !== rows.length ? ` из ${rows.length}` : ""}
        </span>
      </div>

      {groups.length === 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white px-3 py-10 text-center text-sm text-slate-400">
          Нет цветомоделей под текущие фильтры.
        </div>
      )}

      {groups.map((group) => {
        const first = group[0];
        return (
          <div key={first.variantId} className="rounded-2xl border border-slate-200 bg-white">
            {/* Шапка карточки: фасон · цвет · артикул */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-slate-100 px-4 py-2.5">
              <span className="text-sm font-semibold text-slate-900">
                {first.modelName} · {first.colorName || "цвет не указан"}
              </span>
              <button
                type="button"
                onClick={() => copyText(first.sku, "Артикул скопирован")}
                className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-600 hover:bg-slate-200"
                title="Скопировать артикул"
              >
                {first.sku || "без артикула"}
              </button>
              <button
                type="button"
                onClick={() => copyGroup(group)}
                className="ml-auto rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:border-slate-300"
                title="Все размеры одним блоком — для вставки в Excel"
              >
                ⧉ Все размеры ({group.length})
              </button>
            </div>

            {/* Общие поля — один раз, кликом копируются */}
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 px-4 py-3 sm:grid-cols-4">
              {COMMON_FIELDS.map((f) => {
                const raw = rowValue(first, f.key);
                const isHole = Boolean(f.hole) && raw.trim() === "";
                // Состав и ТНВЭД живут на фасоне — дыру можно закрыть прямо
                // отсюда, не проваливаясь в форму фасона.
                const editableField =
                  f.key === "composition" ? "fabricComposition" :
                  f.key === "tnved" ? "tnvedCode" : null;
                if (isHole && editableField) {
                  return (
                    <HoleEditor
                      key={f.key}
                      modelId={first.modelId}
                      field={editableField}
                      label={f.label}
                    />
                  );
                }
                return (
                  <button
                    key={f.key}
                    type="button"
                    onClick={() => !isHole && copyText(raw, "Скопировано")}
                    className="min-w-0 text-left"
                    title={isHole ? "Не заполнено — нужно для ЧЗ" : "Скопировать"}
                  >
                    <div className="text-[11px] text-slate-400">{f.label}</div>
                    <div
                      className={`truncate text-[13px] ${
                        isHole
                          ? "italic text-red-500 dark:text-red-400"
                          : "text-slate-700 hover:text-slate-900"
                      }`}
                    >
                      {isHole ? "— не заполнено" : raw}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Размеры: только то, что различается — размер и наименование */}
            <div className="border-t border-slate-100">
              {group.map((row) => (
                <div
                  key={`${row.variantId}-${row.size}`}
                  className="flex items-center gap-2 border-b border-slate-50 px-4 py-1.5 last:border-0 hover:bg-slate-50"
                >
                  <span className="w-12 shrink-0 text-[13px] font-medium text-slate-800">{row.size}</span>
                  <button
                    type="button"
                    onClick={() => copyText(row.name, "Наименование скопировано")}
                    className="min-w-0 flex-1 truncate text-left text-[13px] text-slate-600 hover:text-slate-900"
                    title="Скопировать наименование"
                  >
                    {row.name}
                  </button>
                  <button
                    type="button"
                    onClick={() => copyRow(row)}
                    className="shrink-0 rounded px-1.5 py-0.5 text-xs text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                    title="Скопировать всю строку (через таб)"
                  >
                    ⧉ строка
                  </button>
                </div>
              ))}
            </div>
          </div>
        );
      })}
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

// Инлайн-закрытие дыры ЧЗ: клик по «не заполнено» → поле ввода → PATCH фасона.
// Состав/ТНВЭД общие для всех цветов фасона, поэтому пишем в ProductModel.
function HoleEditor({
  modelId,
  field,
  label,
}: {
  modelId: string;
  field: "fabricComposition" | "tnvedCode";
  label: string;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    const v = val.trim();
    if (!v) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/models/${modelId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: v }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        toast.error(j?.error?.message ?? "Не сохранилось");
        return;
      }
      toast.success(`${label} сохранён`);
      setEditing(false);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-w-0 text-left">
      <div className="text-[11px] text-slate-400">{label}</div>
      {editing ? (
        <input
          autoFocus
          value={val}
          onChange={(e) => setVal(e.target.value)}
          onBlur={save}
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
            if (e.key === "Escape") setEditing(false);
          }}
          disabled={saving}
          placeholder={field === "tnvedCode" ? "6204630000" : "70% вискоза, 30% пэ"}
          className="mt-0.5 h-7 w-full rounded border border-slate-300 bg-white px-1.5 text-[13px] text-slate-900 focus:border-slate-500 focus:outline-none disabled:opacity-50"
        />
      ) : (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="truncate text-[13px] font-medium text-red-600 underline decoration-dotted underline-offset-2 hover:text-red-700 dark:text-red-300"
          title="Заполнить прямо здесь — сохранится в фасон"
        >
          — заполнить
        </button>
      )}
    </div>
  );
}
