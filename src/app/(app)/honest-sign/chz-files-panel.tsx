"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

/**
 * «Честный знак» — путь человека по шагам (Алёна 17.07: «выбираем категорию,
 * тыкаем товары, предпросмотр, скачиваем файл — вот и всё»):
 *  1) категория → 2) галочки на фасонах → 3) предпросмотр КАК В ФАЙЛЕ
 *  (столбцы шаблона, GTIN пустой — его присвоит ЧЗ) → 4) скачать IMPORT_K3 →
 *  5) вернуть выгрузку ЧЗ с GTIN → 6) справочник деклараций → IMPORT_RD.
 * Предпросмотр собирается сам при выборе; скачивание доступно сразу.
 */

type PreviewRow = {
  modelId: string;
  tnvedShort: string;
  categoryCode: string;
  isKit: string;
  fullName: string;
  brand: string;
  artikul: string;
  productKind: string;
  chzColor: string;
  gender: string;
  sizeSystem: string;
  size: string;
  composition: string;
  tnvedFull: string;
  techReg: string;
  status: string;
};

type K3Preview = {
  category: string;
  ok: PreviewRow[];
  problems: Array<{ modelId: string; modelName: string; sku: string; size: string; error: string }>;
};

export type ChzModelOption = { id: string; name: string; rows: number };

type RegDoc = {
  id: string;
  kind: string;
  number: string;
  date: string;
  models: Array<{ id: string; name: string; category: string }>;
};

const inputCls =
  "h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100";
const btnCls =
  "inline-flex h-11 items-center rounded-lg bg-slate-900 px-4 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900";

// Колонки предпросмотра = колонки шаблона IMPORT_K3, в том же порядке.
const FILE_COLUMNS: Array<{ label: string; cell: (r: PreviewRow) => string }> = [
  { label: "Код товара (GTIN)", cell: () => "" },
  { label: "Код ТНВЭД", cell: (r) => r.tnvedShort },
  { label: "Код категории", cell: (r) => r.categoryCode },
  { label: "Комплект", cell: (r) => r.isKit },
  { label: "Полное наименование", cell: (r) => r.fullName },
  { label: "Товарный знак", cell: (r) => r.brand },
  { label: "Артикул", cell: (r) => r.artikul },
  { label: "Вид товара", cell: (r) => r.productKind },
  { label: "Цвет", cell: (r) => r.chzColor },
  { label: "Целевой пол", cell: (r) => r.gender },
  { label: "Размерная система", cell: (r) => r.sizeSystem },
  { label: "Размер", cell: (r) => r.size },
  { label: "Состав", cell: (r) => r.composition },
  { label: "Код ТНВЭД (полный)", cell: (r) => r.tnvedFull },
  { label: "Техрегламент", cell: (r) => r.techReg },
  { label: "Статус", cell: (r) => r.status },
];

function StepTitle({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white dark:bg-slate-100 dark:text-slate-900">
        {n}
      </span>
      <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">{children}</span>
    </div>
  );
}

export function ChzFilesPanel({
  categories,
  modelsByCategory,
}: {
  categories: string[];
  modelsByCategory: Record<string, ChzModelOption[]>;
}) {
  const [category, setCategory] = useState(categories[0] ?? "");
  // Отмеченные фасоны. При смене категории — все включены.
  const [picked, setPicked] = useState<Set<string>>(
    () => new Set((modelsByCategory[categories[0] ?? ""] ?? []).map((m) => m.id)),
  );
  const [preview, setPreview] = useState<K3Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [showAllRows, setShowAllRows] = useState(false);

  const models = useMemo(() => modelsByCategory[category] ?? [], [modelsByCategory, category]);
  const pickedIds = useMemo(
    () => models.filter((m) => picked.has(m.id)).map((m) => m.id),
    [models, picked],
  );
  const allPicked = pickedIds.length === models.length;

  function switchCategory(next: string) {
    setCategory(next);
    setPicked(new Set((modelsByCategory[next] ?? []).map((m) => m.id)));
    setPreview(null);
    setShowAllRows(false);
  }

  // Предпросмотр собирается сам: выбрала категорию/товары — таблица обновилась.
  useEffect(() => {
    if (!category || pickedIds.length === 0) {
      setPreview(null);
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setBusy(true);
      try {
        const idsParam = allPicked ? "" : `&modelIds=${pickedIds.join(",")}`;
        const res = await fetch(
          `/api/chz/k3?category=${encodeURIComponent(category)}&preview=1${idsParam}`,
          { signal: ctrl.signal },
        );
        if (res.ok) setPreview(await res.json());
      } catch {
        // отменённый запрос / сеть — предпросмотр просто не обновился
      } finally {
        setBusy(false);
      }
    }, 350);
    return () => {
      ctrl.abort();
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, pickedIds.join(",")]);

  const downloadHref =
    `/api/chz/k3?category=${encodeURIComponent(category)}` +
    (allPicked ? "" : `&modelIds=${pickedIds.join(",")}`);

  const [gtinReport, setGtinReport] = useState<{ saved: number; unmatched: Array<{ artikul: string; size: string }> } | null>(null);
  const [gtinBusy, setGtinBusy] = useState(false);

  async function uploadGtins(file: File) {
    setGtinBusy(true);
    setGtinReport(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/chz/gtins", { method: "POST", body: fd });
      if (res.ok) setGtinReport(await res.json());
      else alert((await res.json())?.error?.message ?? "Не получилось разобрать файл");
    } finally {
      setGtinBusy(false);
    }
  }

  const shownRows = preview ? (showAllRows ? preview.ok : preview.ok.slice(0, 12)) : [];

  return (
    <div className="space-y-5 rounded-2xl bg-white p-4 dark:bg-slate-900">
      <div>
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
          Загрузка карточек в «Честный знак»
        </h2>
        <p className="mt-0.5 text-xs text-slate-500">
          Выбери категорию → отметь товары → проверь таблицу → скачай файл и загрузи его в
          Нацкаталог ЧЗ. GTIN мы не заполняем — его присвоит ЧЗ, потом верни выгрузку сюда (шаг 5).
        </p>
      </div>

      {/* Шаг 1. Категория */}
      <div className="space-y-2">
        <StepTitle n={1}>Категория</StepTitle>
        <select value={category} onChange={(e) => switchCategory(e.target.value)} className={inputCls}>
          {categories.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </div>

      {/* Шаг 2. Товары галочками */}
      <div className="space-y-2">
        <StepTitle n={2}>Какие товары выгружаем</StepTitle>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setPicked(allPicked ? new Set() : new Set(models.map((m) => m.id)))}
            className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            {allPicked ? "Снять все" : "Выбрать все"}
          </button>
          <span className="text-xs text-slate-400">
            отмечено {pickedIds.length} из {models.length}
          </span>
        </div>
        <div className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
          {models.map((m) => (
            <label
              key={m.id}
              className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              <input
                type="checkbox"
                checked={picked.has(m.id)}
                onChange={(e) => {
                  setPicked((p) => {
                    const next = new Set(p);
                    if (e.target.checked) next.add(m.id);
                    else next.delete(m.id);
                    return next;
                  });
                }}
                className="h-4 w-4 accent-slate-900"
              />
              <span className="min-w-0 flex-1 truncate text-slate-800 dark:text-slate-200">{m.name}</span>
              <span className="shrink-0 text-xs text-slate-400">{m.rows} строк</span>
            </label>
          ))}
        </div>
      </div>

      {/* Шаг 3. Предпросмотр как в файле + скачать */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-3">
          <StepTitle n={3}>Проверь и скачай файл</StepTitle>
          {preview && preview.ok.length > 0 && (
            <a href={downloadHref} className={btnCls}>
              ⬇ Скачать IMPORT_K3 ({preview.ok.length} строк)
            </a>
          )}
          {busy && <span className="text-xs text-slate-400">собираю…</span>}
        </div>

        {preview && preview.problems.length > 0 && (
          <div className="rounded-lg bg-rose-50 p-3 text-sm dark:bg-rose-400/10">
            <div className="font-medium text-rose-700 dark:text-rose-300">
              Не попадут в файл — {preview.problems.length} строк, заполни в карточках:
            </div>
            <ul className="mt-1 space-y-0.5">
              {dedupeProblems(preview.problems).map((p, i) => (
                <li key={i} className="text-rose-600 dark:text-rose-300">
                  <Link href={`/models/${p.modelId}`} className="underline">{p.modelName}</Link>
                  {" — "}{p.error}
                </li>
              ))}
            </ul>
          </div>
        )}

        {preview && preview.ok.length > 0 ? (
          <div className="overflow-x-auto rounded-lg border border-slate-100 dark:border-slate-800">
            {/* Столбцы — один в один как в шаблоне ЧЗ, порядок не меняем */}
            <table className="w-full min-w-[1100px] text-xs">
              <thead>
                <tr className="bg-slate-50 text-left text-slate-400 dark:bg-slate-800/60">
                  {FILE_COLUMNS.map((c) => (
                    <th key={c.label} className="whitespace-nowrap px-2 py-1.5 font-medium">
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {shownRows.map((r, i) => (
                  <tr key={i} className="border-t border-slate-50 dark:border-slate-800">
                    {FILE_COLUMNS.map((c) => (
                      <td key={c.label} className="max-w-[280px] truncate px-2 py-1 text-slate-700 dark:text-slate-300" title={c.cell(r)}>
                        {c.label.startsWith("Код товара") ? (
                          <span className="italic text-slate-300 dark:text-slate-600">присвоит ЧЗ</span>
                        ) : (
                          c.cell(r)
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {preview.ok.length > shownRows.length && (
              <button
                type="button"
                onClick={() => setShowAllRows(true)}
                className="w-full px-2 py-1.5 text-left text-[11px] text-slate-500 underline"
              >
                показать все {preview.ok.length} строк
              </button>
            )}
          </div>
        ) : !busy && pickedIds.length > 0 && preview ? (
          <p className="text-sm text-slate-500">Ни одной готовой строки — сначала закрой красные дыры выше.</p>
        ) : null}
      </div>

      {/* Шаг 4. Загрузка в ЧЗ — руками на их сайте */}
      <div className="space-y-1">
        <StepTitle n={4}>Загрузи файл в ЧЗ</StepTitle>
        <p className="text-xs text-slate-500">
          В кабинете «Честного знака» (Национальный каталог) → Импорт → выбери скачанный файл.
          ЧЗ создаст карточки-черновики и присвоит каждой GTIN.
        </p>
      </div>

      {/* Шаг 5. Вернуть GTIN */}
      <div className="space-y-2">
        <StepTitle n={5}>Верни выгрузку ЧЗ с GTIN</StepTitle>
        <p className="text-xs text-slate-500">
          Когда ЧЗ присвоит «Коды товара», выгрузи оттуда файл и закинь сюда — GTIN лягут на
          цветомодели, без них не собрать файл деклараций.
        </p>
        <label className={`${btnCls} cursor-pointer`}>
          {gtinBusy ? "Разбираю…" : "📎 Загрузить выгрузку ЧЗ"}
          <input
            type="file"
            accept=".xlsx"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void uploadGtins(f);
              e.currentTarget.value = "";
            }}
          />
        </label>
        {gtinReport && (
          <div className="text-sm">
            <span className="text-emerald-700 dark:text-emerald-300">Сохранено GTIN: {gtinReport.saved}.</span>
            {gtinReport.unmatched.length > 0 && (
              <span className="ml-2 text-rose-600 dark:text-rose-300">
                Не нашла артикулы: {gtinReport.unmatched.slice(0, 5).map((u) => `${u.artikul} (${u.size})`).join(", ")}
                {gtinReport.unmatched.length > 5 ? ` и ещё ${gtinReport.unmatched.length - 5}` : ""}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// Одна модель может дать десятки одинаковых ошибок (по числу размеров) — сжимаем.
function dedupeProblems(problems: K3Preview["problems"]) {
  const seen = new Map<string, K3Preview["problems"][number]>();
  for (const p of problems) {
    const key = `${p.modelId}:${p.error}`;
    if (!seen.has(key)) seen.set(key, p);
  }
  return Array.from(seen.values());
}
