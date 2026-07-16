"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

/**
 * Панель «Файлы для Честного знака» (Алёна 16.07):
 *  1) IMPORT_K3 по категории: предпросмотр (с дырами КРАСНЫМ до скачивания) → файл;
 *  2) приём GTIN из выгрузки ЧЗ (тот же файл с заполненным «Кодом товара»);
 *  3) декларации соответствия → IMPORT_RD.
 * Доступно всем ролям.
 */

type K3Preview = {
  category: string;
  ok: Array<{ fullName: string; chzColor: string; size: string; artikul: string; modelId: string }>;
  problems: Array<{ modelId: string; modelName: string; sku: string; size: string; error: string }>;
};

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

export function ChzFilesPanel({ categories }: { categories: string[] }) {
  const [category, setCategory] = useState(categories[0] ?? "");
  const [preview, setPreview] = useState<K3Preview | null>(null);
  const [busy, setBusy] = useState(false);

  const [gtinReport, setGtinReport] = useState<{ saved: number; unmatched: Array<{ artikul: string; size: string }> } | null>(null);
  const [gtinBusy, setGtinBusy] = useState(false);

  const [docs, setDocs] = useState<RegDoc[]>([]);
  const [docForm, setDocForm] = useState({ kind: "DECLARATION", number: "", date: "", cats: [] as string[] });
  const [docBusy, setDocBusy] = useState(false);
  const [rdInfo, setRdInfo] = useState<Record<string, { gtins: number; missing: number }>>({});

  async function loadDocs() {
    const res = await fetch("/api/chz/regdocs");
    if (res.ok) setDocs((await res.json()).docs);
  }
  useEffect(() => {
    void loadDocs();
  }, []);

  async function loadPreview() {
    setBusy(true);
    setPreview(null);
    try {
      const res = await fetch(`/api/chz/k3?category=${encodeURIComponent(category)}&preview=1`);
      if (res.ok) setPreview(await res.json());
      else alert((await res.json())?.error?.message ?? "Не получилось собрать предпросмотр");
    } finally {
      setBusy(false);
    }
  }

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

  async function createDoc() {
    setDocBusy(true);
    try {
      const res = await fetch("/api/chz/regdocs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: docForm.kind,
          number: docForm.number,
          date: docForm.date,
          categories: docForm.cats,
        }),
      });
      if (!res.ok) {
        alert((await res.json())?.error?.message ?? "Не получилось сохранить документ");
        return;
      }
      setDocForm({ kind: "DECLARATION", number: "", date: "", cats: [] });
      await loadDocs();
    } finally {
      setDocBusy(false);
    }
  }

  async function checkRd(docId: string) {
    const res = await fetch(`/api/chz/rd?docId=${docId}&preview=1`);
    if (res.ok) {
      const j = await res.json();
      setRdInfo((p) => ({ ...p, [docId]: { gtins: j.gtins.length, missing: j.missing.length } }));
    }
  }

  return (
    <div className="space-y-4 rounded-2xl bg-white p-4 dark:bg-slate-900">
      <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Файлы для Честного знака</h2>

      {/* 1. IMPORT_K3 */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <select value={category} onChange={(e) => { setCategory(e.target.value); setPreview(null); }} className={inputCls}>
            {categories.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          <button type="button" onClick={loadPreview} disabled={busy || !category} className={btnCls}>
            {busy ? "Собираю…" : "Предпросмотр"}
          </button>
          {preview && preview.ok.length > 0 && (
            <a href={`/api/chz/k3?category=${encodeURIComponent(category)}`} className={btnCls}>
              ⬇ Скачать IMPORT_K3 ({preview.ok.length} строк)
            </a>
          )}
        </div>

        {preview && (
          <div className="space-y-2">
            {preview.problems.length > 0 && (
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
            {preview.ok.length > 0 && (
              <div className="overflow-x-auto rounded-lg border border-slate-100 dark:border-slate-800">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-slate-50 text-left text-slate-400 dark:bg-slate-800/60">
                      <th className="px-2 py-1.5 font-medium">Полное наименование</th>
                      <th className="px-2 py-1.5 font-medium">Артикул</th>
                      <th className="px-2 py-1.5 font-medium">Цвет ЧЗ</th>
                      <th className="px-2 py-1.5 font-medium">Размер</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.ok.slice(0, 8).map((r, i) => (
                      <tr key={i} className="border-t border-slate-50 dark:border-slate-800">
                        <td className="px-2 py-1 text-slate-700 dark:text-slate-300">{r.fullName}</td>
                        <td className="px-2 py-1 font-mono text-slate-500">{r.artikul}</td>
                        <td className="px-2 py-1">{r.chzColor}</td>
                        <td className="px-2 py-1">{r.size}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {preview.ok.length > 8 && (
                  <div className="px-2 py-1.5 text-[11px] text-slate-400">…и ещё {preview.ok.length - 8} строк в файле</div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 2. GTIN из выгрузки ЧЗ */}
      <div className="space-y-2 border-t border-slate-100 pt-3 dark:border-slate-800">
        <div className="text-sm font-medium text-slate-800 dark:text-slate-200">GTIN из выгрузки ЧЗ</div>
        <p className="text-xs text-slate-500">
          После загрузки K3 в ЧЗ выгрузи оттуда файл с присвоенными «Кодами товара» и закинь его сюда —
          GTIN лягут на цветомодели и понадобятся для декларации.
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

      {/* 3. Декларации → IMPORT_RD */}
      <div className="space-y-2 border-t border-slate-100 pt-3 dark:border-slate-800">
        <div className="text-sm font-medium text-slate-800 dark:text-slate-200">Декларации соответствия (IMPORT_RD)</div>
        <div className="flex flex-wrap items-center gap-2">
          <select value={docForm.kind} onChange={(e) => setDocForm((p) => ({ ...p, kind: e.target.value }))} className={inputCls}>
            <option value="DECLARATION">Декларация</option>
            <option value="CERTIFICATE">Сертификат</option>
          </select>
          <input
            value={docForm.number}
            onChange={(e) => setDocForm((p) => ({ ...p, number: e.target.value }))}
            placeholder="ЕАЭС N RU Д-RU.РА03.В.01124/25"
            className={`${inputCls} w-72`}
          />
          <input type="date" value={docForm.date} onChange={(e) => setDocForm((p) => ({ ...p, date: e.target.value }))} className={inputCls} />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {categories.map((c) => {
            const on = docForm.cats.includes(c);
            return (
              <button
                key={c}
                type="button"
                onClick={() =>
                  setDocForm((p) => ({ ...p, cats: on ? p.cats.filter((x) => x !== c) : [...p.cats, c] }))
                }
                className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                  on
                    ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
                    : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                }`}
              >
                {c}
              </button>
            );
          })}
          <button
            type="button"
            onClick={createDoc}
            disabled={docBusy || !docForm.number || !docForm.date || docForm.cats.length === 0}
            className={btnCls}
          >
            {docBusy ? "Сохраняю…" : "+ Документ"}
          </button>
        </div>

        {docs.length > 0 && (
          <ul className="divide-y divide-slate-100 rounded-lg border border-slate-100 dark:divide-slate-800 dark:border-slate-800">
            {docs.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
                <span className="font-medium text-slate-800 dark:text-slate-200">{d.number}</span>
                <span className="text-xs text-slate-400">{d.date.slice(0, 10)} · фасонов: {d.models.length}</span>
                {rdInfo[d.id] && (
                  <span className="text-xs">
                    <span className="text-emerald-700 dark:text-emerald-300">GTIN: {rdInfo[d.id].gtins}</span>
                    {rdInfo[d.id].missing > 0 && (
                      <span className="ml-1 text-rose-600 dark:text-rose-300">без GTIN: {rdInfo[d.id].missing}</span>
                    )}
                  </span>
                )}
                <span className="ml-auto flex items-center gap-2">
                  <button type="button" onClick={() => void checkRd(d.id)} className="text-xs text-slate-500 underline">
                    проверить GTIN
                  </button>
                  <a href={`/api/chz/rd?docId=${d.id}`} className="text-xs font-medium text-slate-900 underline dark:text-slate-100">
                    ⬇ IMPORT_RD
                  </a>
                </span>
              </li>
            ))}
          </ul>
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
