"use client";

import { useEffect, useState } from "react";

/**
 * Справочник деклараций соответствия (Алёна 17.07: «нужен справочник наших
 * деклараций»). Здесь живут все декларации/сертификаты: номер + дата +
 * категории, к которым они относятся. Когда у товаров категории появились
 * GTIN (шаг 5 выше) — отсюда скачивается IMPORT_RD для загрузки в ЧЗ.
 */

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

export function DeclarationsPanel({ categories }: { categories: string[] }) {
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
    <div className="space-y-3 rounded-2xl bg-white p-4 dark:bg-slate-900">
      <div>
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
          Справочник деклараций (IMPORT_RD)
        </h2>
        <p className="mt-0.5 text-xs text-slate-500">
          Все наши декларации и сертификаты в одном месте: номер, дата, категории. Когда GTIN
          подтянуты (шаг 5), жми «⬇ IMPORT_RD» у нужной декларации и загружай файл в ЧЗ — он
          привяжет декларацию к карточкам.
        </p>
      </div>

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

      {docs.length === 0 ? (
        <p className="text-sm text-slate-400">Деклараций пока нет — заведи первую формой выше.</p>
      ) : (
        <ul className="divide-y divide-slate-100 rounded-lg border border-slate-100 dark:divide-slate-800 dark:border-slate-800">
          {docs.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
              <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium uppercase text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                {d.kind === "CERTIFICATE" ? "серт" : "декл"}
              </span>
              <span className="font-medium text-slate-800 dark:text-slate-200">{d.number}</span>
              <span className="text-xs text-slate-400">
                {d.date.slice(0, 10)} · фасонов: {d.models.length}
                {d.models.length > 0 && (
                  <> · {Array.from(new Set(d.models.map((m) => m.category))).join(", ")}</>
                )}
              </span>
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
  );
}
