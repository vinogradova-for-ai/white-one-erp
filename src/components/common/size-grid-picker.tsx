"use client";

import { useMemo, useState } from "react";

type Option = { id: string; name: string };

/**
 * Выбор размерной сетки из справочника + возможность создать новую прямо отсюда.
 * Поддерживает свободный ввод размеров:
 *  - "40, 42, 44" — перечисление через запятую/пробел
 *  - "40-60" — диапазон чисел (разворачивает с шагом 2: 40,42,44,...,60)
 *  - "40-46 step 1" — диапазон с указанием шага
 *  - "XS-XXL" — буквенная шкала (XS,S,M,L,XL,XXL)
 */
export function SizeGridPicker({
  value,
  onChange,
  grids: initialGrids,
}: {
  value: string;
  onChange: (id: string) => void;
  grids: Option[];
}) {
  const [grids, setGrids] = useState(initialGrids);
  const [mode, setMode] = useState<"select" | "create">("select");
  const [form, setForm] = useState({ name: "", sizesRaw: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const preview = useMemo(() => parseSizes(form.sizesRaw), [form.sizesRaw]);

  async function createGrid() {
    setError(null);
    if (!form.name.trim()) {
      setError("Укажите название");
      return;
    }
    if (preview.length === 0) {
      setError("Не могу разобрать размеры — напишите через запятую или в виде диапазона");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/size-grids", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: form.name.trim(), sizes: preview }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j?.error?.message ?? "Не удалось создать");
        return;
      }
      const grid = await res.json();
      setGrids((gs) =>
        [...gs, { id: grid.id, name: grid.name }].sort((a, b) => a.name.localeCompare(b.name)),
      );
      onChange(grid.id);
      setForm({ name: "", sizesRaw: "" });
      setMode("select");
    } finally {
      setSaving(false);
    }
  }

  if (mode === "create") {
    return (
      <div className="space-y-2 rounded-lg border border-blue-200 bg-blue-50 p-3">
        <div className="text-sm font-medium text-blue-900">Новая размерная сетка</div>
        <input
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          placeholder="Название (например, «44-48 премиум»)"
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
        />
        <input
          value={form.sizesRaw}
          onChange={(e) => setForm({ ...form, sizesRaw: e.target.value })}
          placeholder="Размеры: 40, 42, 44  •  или  40-60  •  или  XS-XXL"
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
        />
        <div className="text-xs text-slate-600">
          <div>
            Примеры ввода: <code>40, 42, 44, 46</code> · <code>40-60</code> (шаг 2) ·{" "}
            <code>40-46 step 1</code> · <code>XS-XXL</code>
          </div>
          {preview.length > 0 && (
            <div className="mt-1 text-blue-900">
              Получится: <b>{preview.join(", ")}</b>
            </div>
          )}
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={createGrid}
            disabled={saving}
            className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
          >
            {saving ? "Сохранение…" : "Создать и выбрать"}
          </button>
          <button
            type="button"
            onClick={() => {
              setMode("select");
              setError(null);
            }}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700"
          >
            Отмена
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-2">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-900 focus:ring-1 focus:ring-slate-900"
      >
        <option value="">—</option>
        {grids.map((g) => (
          <option key={g.id} value={g.id}>
            {g.name}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={() => setMode("create")}
        className="whitespace-nowrap rounded-lg border border-slate-900 bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800"
        title="Создать новую размерную сетку"
      >
        + Новая
      </button>
    </div>
  );
}

// ---------- Парсер размеров ----------

const LETTER_SCALE = ["XXXS", "XXS", "XS", "S", "M", "L", "XL", "XXL", "XXXL", "XXXXL"];

function parseSizes(raw: string): string[] {
  const text = raw.trim();
  if (!text) return [];

  const result: string[] = [];
  const tokens = text
    .split(/[,;]+/)
    .map((t) => t.trim())
    .filter(Boolean);

  for (const token of tokens) {
    // "40-60 step 1" или "40-60" или "XS-XXL"
    const rangeMatch = token.match(/^(\S+?)\s*[-–—]\s*(\S+?)(?:\s+(?:step|шаг)\s+(\d+))?$/i);
    if (rangeMatch) {
      const [, a, b, stepRaw] = rangeMatch;
      const step = stepRaw ? Number(stepRaw) : undefined;
      const expanded = expandRange(a, b, step);
      if (expanded) {
        result.push(...expanded);
        continue;
      }
    }
    // Если не разобрали как диапазон — пробуем раздробить по пробелам/слешам
    const parts = token.split(/[\s/]+/).filter(Boolean);
    for (const p of parts) {
      result.push(p);
    }
  }

  // Уникализируем, сохраняя порядок
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const s of result) {
    if (!seen.has(s)) {
      seen.add(s);
      unique.push(s);
    }
  }
  return unique;
}

function expandRange(a: string, b: string, stepOverride?: number): string[] | null {
  const na = Number(a);
  const nb = Number(b);
  if (Number.isFinite(na) && Number.isFinite(nb)) {
    const step = stepOverride ?? (Math.abs(nb - na) >= 6 ? 2 : 1);
    if (step <= 0) return null;
    const out: string[] = [];
    if (na <= nb) {
      for (let i = na; i <= nb; i += step) out.push(String(i));
    } else {
      for (let i = na; i >= nb; i -= step) out.push(String(i));
    }
    return out;
  }

  // Буквенная шкала
  const ai = LETTER_SCALE.indexOf(a.toUpperCase());
  const bi = LETTER_SCALE.indexOf(b.toUpperCase());
  if (ai !== -1 && bi !== -1) {
    const [from, to] = ai <= bi ? [ai, bi] : [bi, ai];
    return LETTER_SCALE.slice(from, to + 1);
  }
  return null;
}
