"use client";

import { useMemo, useState } from "react";

// Редактор замеров: таблица параметры × размеры + вставка из Excel.
// Формат вставки: первая строка — размеры (через таб), дальше строки
// «параметр<TAB>значения…» — ровно как копируется из МЛ конструктора.

type Row = { size: string; param: string; valueCm: number | null };

const DEFAULT_PARAMS = ["Обхват груди", "Обхват талии", "Обхват бёдер", "Длина по спинке", "Длина рукава"];

export function MeasurementsEditor({
  modelId,
  gridSizes,
  initial,
}: {
  modelId: string;
  gridSizes: string[];
  initial: Row[];
}) {
  const initSizes = useMemo(() => {
    const s = [...new Set(initial.map((r) => r.size))];
    return s.length ? s : gridSizes.length ? gridSizes : ["42", "44", "46", "48"];
  }, [initial, gridSizes]);
  const initParams = useMemo(() => {
    const p = [...new Set(initial.map((r) => r.param))];
    return p.length ? p : DEFAULT_PARAMS;
  }, [initial]);

  const [sizes, setSizes] = useState<string[]>(initSizes);
  const [paramsList, setParamsList] = useState<string[]>(initParams);
  const [values, setValues] = useState<Record<string, string>>(() => {
    const v: Record<string, string> = {};
    initial.forEach((r) => {
      v[`${r.param}|${r.size}`] = r.valueCm === null || r.valueCm === undefined ? "" : String(r.valueCm);
    });
    return v;
  });
  const [paste, setPaste] = useState("");
  const [msg, setMsg] = useState("");
  const [saving, setSaving] = useState(false);

  function applyPaste() {
    const lines = paste
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length < 2) {
      setMsg("Нужно минимум 2 строки: размеры и хотя бы один параметр");
      return;
    }
    const head = lines[0].split(/\t|;/).map((s) => s.trim()).filter(Boolean);
    // первая ячейка шапки может быть подписью («размер») — выкидываем нечисловую
    const newSizes = (head.length && !/\d/.test(head[0]) ? head.slice(1) : head).map((s) => s.replace(/\.0$/, ""));
    const newParams: string[] = [];
    const v: Record<string, string> = {};
    for (const line of lines.slice(1)) {
      const cells = line.split(/\t|;/).map((s) => s.trim());
      const param = cells[0];
      if (!param) continue;
      newParams.push(param);
      cells.slice(1).forEach((c, i) => {
        if (newSizes[i] !== undefined) v[`${param}|${newSizes[i]}`] = c.replace(",", ".");
      });
    }
    setSizes(newSizes);
    setParamsList(newParams);
    setValues(v);
    setPaste("");
    setMsg(`Вставлено: ${newParams.length} параметров × ${newSizes.length} размеров — проверь и сохрани`);
  }

  async function save() {
    setSaving(true);
    setMsg("");
    const rows: Row[] = [];
    for (const p of paramsList) {
      for (const s of sizes) {
        const raw = values[`${p}|${s}`] ?? "";
        rows.push({ param: p, size: s, valueCm: raw === "" ? null : Number(raw.replace(",", ".")) });
      }
    }
    const r = await fetch(`/api/models/${modelId}/measurements`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rows }),
    });
    const d = await r.json().catch(() => ({}));
    setSaving(false);
    setMsg(r.ok ? `Сохранено (${d.saved ?? rows.length})` : d.error?.message || d.error || "не сохранилось");
  }

  return (
    <div className="space-y-6">
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-slate-500 dark:border-slate-700">
              <th className="p-2 text-left font-medium">Параметр, см</th>
              {sizes.map((s) => (
                <th key={s} className="p-2 text-center font-medium">
                  {s}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paramsList.map((p) => (
              <tr key={p} className="border-b border-slate-100 last:border-0 dark:border-slate-800">
                <td className="p-2">{p}</td>
                {sizes.map((s) => (
                  <td key={s} className="p-1 text-center">
                    <input
                      className="w-16 rounded border border-slate-200 p-1 text-center dark:border-slate-700 dark:bg-slate-800"
                      inputMode="decimal"
                      value={values[`${p}|${s}`] ?? ""}
                      onChange={(e) => setValues((v) => ({ ...v, [`${p}|${s}`]: e.target.value }))}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={save}
          disabled={saving}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50 dark:bg-white dark:text-slate-900"
        >
          {saving ? "Сохраняю…" : "Сохранить замеры"}
        </button>
        <span className="text-sm text-slate-500">{msg}</span>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
        <h2 className="mb-1 text-sm font-semibold">Вставить из Excel (МЛ конструктора)</h2>
        <p className="mb-2 text-xs text-slate-500">
          Скопируй таблицу: первая строка — размеры, дальше строки «параметр → значения». Вставь сюда и нажми «Разобрать».
        </p>
        <textarea
          value={paste}
          onChange={(e) => setPaste(e.target.value)}
          rows={5}
          placeholder={"размер\t42\t44\t46\nОбхват груди\t90\t94\t98\nДлина по спинке\t106\t106\t106"}
          className="w-full rounded-lg border border-slate-200 p-2 font-mono text-xs dark:border-slate-700 dark:bg-slate-800"
        />
        <button
          onClick={applyPaste}
          className="mt-2 rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-800"
        >
          Разобрать вставку
        </button>
      </div>
    </div>
  );
}
