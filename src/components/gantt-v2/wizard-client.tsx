"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export type WizardOrder = {
  id: string;
  orderNumber: string;
  title: string;
  subtitle: string;
  statusLabel: string;
  photoUrl: string | null;
  decisionDate: string;
  handedToFactoryDate: string;
  readyAtFactoryDate: string;
  qcDate: string;
  arrivalPlannedDate: string;
};

const FIELDS = [
  { key: "decisionDate",        label: "Старт Разработки",  hint: "Когда решили запускать в производство" },
  { key: "handedToFactoryDate", label: "Конец Разработки = старт Производства", hint: "Когда передали ТЗ/лекала фабрике" },
  { key: "readyAtFactoryDate",  label: "Конец Производства = старт ОТК",        hint: "Когда фабрика отшила, готов к проверке" },
  { key: "qcDate",              label: "Конец ОТК = старт Доставки",            hint: "Когда прошёл проверку, поехал" },
  { key: "arrivalPlannedDate",  label: "Конец Доставки",                        hint: "Когда товар у нас на складе" },
] as const;

type FieldKey = typeof FIELDS[number]["key"];

export function WizardClient({ items }: { items: WizardOrder[] }) {
  const router = useRouter();
  const [idx, setIdx] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [savedCount, setSavedCount] = useState(0);
  const [skippedCount, setSkippedCount] = useState(0);

  const total = items.length;
  const cur = items[idx];

  const [vals, setVals] = useState<Record<FieldKey, string>>(() => initFromOrder(items[0]));

  // Когда переходим на следующий заказ — перезаливаем vals из items[idx]
  function loadFor(orderIdx: number) {
    const o = items[orderIdx];
    setVals(initFromOrder(o));
    setError(null);
  }

  // Валидация: даты должны идти неубывающе.
  const orderError = useMemo(() => {
    const sequence = FIELDS.map((f) => vals[f.key]).filter(Boolean);
    for (let i = 1; i < sequence.length; i++) {
      if (sequence[i] < sequence[i - 1]) {
        return "Даты должны идти по возрастанию: каждая фаза не раньше предыдущей.";
      }
    }
    return null;
  }, [vals]);

  async function saveAndNext() {
    if (!cur) return;
    if (orderError) {
      setError(orderError);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const body: Record<string, string | null> = {};
      for (const f of FIELDS) {
        body[f.key] = vals[f.key] || null;
      }
      const res = await fetch(`/api/orders/${cur.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(`Ошибка сохранения: ${j?.error?.message ?? res.status}`);
        return;
      }
      setSavedCount((n) => n + 1);
      goNext();
    } finally {
      setSaving(false);
    }
  }

  function skip() {
    setSkippedCount((n) => n + 1);
    goNext();
  }

  function goNext() {
    if (idx + 1 >= total) {
      setDone(true);
      return;
    }
    const next = idx + 1;
    setIdx(next);
    loadFor(next);
  }

  function goPrev() {
    if (idx === 0) return;
    const prev = idx - 1;
    setIdx(prev);
    loadFor(prev);
  }

  if (total === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
        Активных заказов нет — нечего заполнять.
        <div className="mt-3">
          <Link href="/gantt-v2" className="text-blue-600 hover:underline dark:text-blue-300">← Вернуться в Гант</Link>
        </div>
      </div>
    );
  }

  if (done) {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-8 text-center dark:border-emerald-400/20 dark:bg-emerald-400/10">
        <div className="text-4xl mb-2">🎉</div>
        <div className="text-base font-semibold text-emerald-900 dark:text-emerald-300">Готово</div>
        <div className="mt-2 text-sm text-emerald-800 dark:text-emerald-300">
          Сохранено: <b>{savedCount}</b> · Пропущено: <b>{skippedCount}</b> из {total}
        </div>
        <div className="mt-5 flex justify-center gap-2">
          <Link
            href="/gantt-v2"
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
            onClick={() => setTimeout(() => router.refresh(), 100)}
          >
            Открыть Гант
          </Link>
          <button
            type="button"
            onClick={() => { setIdx(0); setDone(false); setSavedCount(0); setSkippedCount(0); loadFor(0); }}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Пройти ещё раз
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      {/* Шапка */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Опросник: даты по заказу</h1>
          <div className="text-sm text-slate-500">
            Заказ <b>{idx + 1}</b> из {total}
            {savedCount > 0 && ` · сохранено ${savedCount}`}
            {skippedCount > 0 && ` · пропущено ${skippedCount}`}
          </div>
        </div>
        <Link
          href="/gantt-v2"
          className="text-sm text-slate-500 hover:text-slate-700"
        >
          ✕ Закрыть
        </Link>
      </div>

      {/* Прогресс-бар */}
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
        <div
          className="h-full bg-slate-900 transition-all"
          style={{ width: `${((idx) / total) * 100}%` }}
        />
      </div>

      {/* Карточка заказа */}
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex items-start gap-3">
          {cur.photoUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={cur.photoUrl} alt="" className="h-16 w-16 shrink-0 rounded-lg object-cover" />
          ) : (
            <div className="h-16 w-16 shrink-0 rounded-lg bg-slate-100" />
          )}
          <div className="min-w-0 flex-1">
            <div className="text-base font-semibold text-slate-900 truncate">
              {cur.title}
            </div>
            <div className="text-xs text-slate-500 truncate">
              #{cur.orderNumber} · {cur.subtitle}
            </div>
            <div className="mt-1 inline-block rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
              {cur.statusLabel}
            </div>
          </div>
        </div>

        {/* Поля дат */}
        <div className="mt-5 space-y-3">
          {FIELDS.map((f, i) => {
            const value = vals[f.key];
            const prevVal = i > 0 ? vals[FIELDS[i - 1].key] : "";
            const violatesOrder = !!(value && prevVal && value < prevVal);
            return (
              <div key={f.key}>
                <label className="block text-sm font-medium text-slate-700">{f.label}</label>
                <div className="text-[11px] text-slate-500">{f.hint}</div>
                <input
                  type="date"
                  value={value}
                  onChange={(e) => setVals((v) => ({ ...v, [f.key]: e.target.value }))}
                  className={`mt-1 w-full rounded-lg border px-3 py-2 text-sm ${
                    violatesOrder
                      ? "border-red-400 bg-red-50 focus:border-red-500 dark:bg-red-400/10"
                      : "border-slate-300 bg-white focus:border-slate-500"
                  } focus:outline-none`}
                />
                {violatesOrder && (
                  <div className="mt-1 text-[11px] text-red-600 dark:text-red-300">
                    Раньше предыдущей даты — фазы пересекаются
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {error && (
          <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-700 dark:border-red-400/20 dark:bg-red-400/10 dark:text-red-300">
            {error}
          </div>
        )}
      </div>

      {/* Кнопки навигации */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={goPrev}
          disabled={idx === 0 || saving}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
        >
          ← Назад
        </button>
        <button
          type="button"
          onClick={skip}
          disabled={saving}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
        >
          Пропустить
        </button>
        <button
          type="button"
          onClick={saveAndNext}
          disabled={saving || !!orderError}
          className="ml-auto rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-40"
        >
          {saving ? "Сохраняю…" : idx + 1 === total ? "Сохранить и закончить" : "Сохранить и далее →"}
        </button>
      </div>
    </div>
  );
}

function initFromOrder(o: WizardOrder | undefined): Record<FieldKey, string> {
  if (!o) return { decisionDate: "", handedToFactoryDate: "", readyAtFactoryDate: "", qcDate: "", arrivalPlannedDate: "" };
  return {
    decisionDate: o.decisionDate,
    handedToFactoryDate: o.handedToFactoryDate,
    readyAtFactoryDate: o.readyAtFactoryDate,
    qcDate: o.qcDate,
    arrivalPlannedDate: o.arrivalPlannedDate,
  };
}
