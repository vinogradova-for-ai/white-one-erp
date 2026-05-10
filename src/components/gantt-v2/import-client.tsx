"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

const PLACEHOLDER = `[
  {
    "orderNumber": "ORD-2026-0001",
    "decisionDate":         "2026-04-15",
    "handedToFactoryDate":  "2026-04-29",
    "readyAtFactoryDate":   "2026-06-03",
    "qcDate":               "2026-06-08",
    "arrivalPlannedDate":   "2026-07-08"
  }
]`;

export function ImportClient() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<null | { updated: number; notFound: string[]; errors: Array<{ orderNumber: string; message: string }> }>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  async function apply() {
    setError(null);
    setResult(null);
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      setError(`Неверный JSON: ${(e as Error).message}`);
      return;
    }
    if (!Array.isArray(parsed)) {
      setError("Ожидается массив объектов [{ orderNumber, decisionDate, ... }, ...]");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/admin/apply-dates-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: parsed }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(`Ошибка: ${data?.error?.message ?? res.status}`);
        return;
      }
      setResult({ updated: data.updated, notFound: data.notFound ?? [], errors: data.errors ?? [] });
      startTransition(() => router.refresh());
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Импорт дат по заказам</h1>
        <div className="text-sm text-slate-500">
          Вставь JSON-массив с датами заказов и нажми «Применить». Идентификация по <code className="rounded bg-slate-100 px-1 text-[12px]">orderNumber</code>.
        </div>
      </div>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={PLACEHOLDER}
        rows={20}
        spellCheck={false}
        className="w-full rounded-lg border border-slate-300 bg-white p-3 font-mono text-xs text-slate-800 focus:border-slate-500 focus:outline-none"
      />

      <div className="flex items-center gap-2">
        <Link
          href="/gantt-v2"
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
        >
          ← Назад в Гант
        </Link>
        <button
          type="button"
          onClick={() => setText(PLACEHOLDER)}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
        >
          Образец
        </button>
        <button
          type="button"
          onClick={apply}
          disabled={busy || !text.trim()}
          className="ml-auto rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-40"
        >
          {busy ? "Применяю…" : "Применить"}
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {result && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
          <div className="font-semibold">
            Готово. Обновлено: {result.updated}
          </div>
          {result.notFound.length > 0 && (
            <div className="mt-1 text-amber-800">
              Не найдены: {result.notFound.join(", ")}
            </div>
          )}
          {result.errors.length > 0 && (
            <div className="mt-1 text-red-800">
              Ошибки: {result.errors.map((e) => `${e.orderNumber} — ${e.message}`).join("; ")}
            </div>
          )}
          <Link
            href="/gantt-v2"
            className="mt-2 inline-block rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800"
          >
            Открыть Гант
          </Link>
        </div>
      )}
    </div>
  );
}
