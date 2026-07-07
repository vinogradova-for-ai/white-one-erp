"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BRAND_PLAN_STATUSES, BRAND_PLAN_STATUS_LABELS } from "@/lib/validators/brand-plan";
import { parseApiError, type ApiErrorResult } from "@/lib/api-error";
import { FormErrorBanner } from "@/components/common/form-errors";

type Initial = {
  id: string;
  name: string;
  status: (typeof BRAND_PLAN_STATUSES)[number];
  season: string;
  targetDate: string; // yyyy-mm-dd или ""
  plannedModelsCount: string;
  plannedUnitsPerModel: string;
  targetUnitPriceCny: string;
  cnyRubRate: string;
  budgetRub: string;
  notes: string;
};

const EMPTY: Omit<Initial, "id"> = {
  name: "",
  status: "IDEA",
  season: "",
  targetDate: "",
  plannedModelsCount: "",
  plannedUnitsPerModel: "",
  targetUnitPriceCny: "",
  cnyRubRate: "",
  budgetRub: "",
  notes: "",
};

function num(v: string): number | null {
  const t = v.trim().replace(",", ".");
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

const fmt = (n: number) => Math.round(n).toLocaleString("ru-RU");

export function BrandPlanForm({ initial }: { initial?: Initial }) {
  const router = useRouter();
  const [form, setForm] = useState<Omit<Initial, "id">>(() => initial ?? EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiErrorResult | null>(null);

  const set = (k: keyof Omit<Initial, "id">) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  // Живая прикидка: тест обойдётся ≈ фасоны × партия × цена¥ × курс
  const models = num(form.plannedModelsCount);
  const units = num(form.plannedUnitsPerModel);
  const price = num(form.targetUnitPriceCny);
  const rate = num(form.cnyRubRate);
  const budget = num(form.budgetRub);
  const estimate = models != null && units != null && price != null && rate != null ? models * units * price * rate : null;
  const overBudget = estimate != null && budget != null && estimate > budget;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const payload = {
        name: form.name,
        status: form.status,
        season: form.season,
        targetDate: form.targetDate,
        plannedModelsCount: form.plannedModelsCount,
        plannedUnitsPerModel: form.plannedUnitsPerModel,
        targetUnitPriceCny: form.targetUnitPriceCny,
        cnyRubRate: form.cnyRubRate,
        budgetRub: form.budgetRub,
        notes: form.notes,
      };
      const res = await fetch(initial ? `/api/brand-plans/${initial.id}` : "/api/brand-plans", {
        method: initial ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        setError(await parseApiError(res));
        return;
      }
      const plan = await res.json();
      router.push(`/planning/${initial ? initial.id : plan.id}`);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const inputCls =
    "h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-slate-500 focus:outline-none";
  const labelCls = "mb-1 block text-xs font-medium text-slate-600";

  return (
    <form onSubmit={submit} className="max-w-2xl space-y-5">
      {error && <FormErrorBanner error={error} />}

      <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
        <div>
          <label className={labelCls}>Что задумали *</label>
          <input
            value={form.name}
            onChange={(e) => set("name")(e.target.value)}
            placeholder="Пиджачная группа — весна 2027"
            className={inputCls}
            required
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className={labelCls}>Статус</label>
            <select value={form.status} onChange={(e) => set("status")(e.target.value)} className={inputCls}>
              {BRAND_PLAN_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {BRAND_PLAN_STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>Сезон</label>
            <input
              value={form.season}
              onChange={(e) => set("season")(e.target.value)}
              placeholder="Весна 2027"
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>Запуститься к</label>
            <input
              type="date"
              value={form.targetDate}
              onChange={(e) => set("targetDate")(e.target.value)}
              className={inputCls}
            />
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Рамка для продактов</div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={labelCls}>Сколько фасонов</label>
            <input
              type="number"
              min={0}
              value={form.plannedModelsCount}
              onChange={(e) => set("plannedModelsCount")(e.target.value)}
              placeholder="5"
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>Тестовая партия на фасон, шт</label>
            <input
              type="number"
              min={0}
              value={form.plannedUnitsPerModel}
              onChange={(e) => set("plannedUnitsPerModel")(e.target.value)}
              placeholder="100"
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>Примерная закупка за единицу, ¥</label>
            <input
              inputMode="decimal"
              value={form.targetUnitPriceCny}
              onChange={(e) => set("targetUnitPriceCny")(e.target.value)}
              placeholder="55"
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>Курс ¥ → ₽</label>
            <input
              inputMode="decimal"
              value={form.cnyRubRate}
              onChange={(e) => set("cnyRubRate")(e.target.value)}
              placeholder="12,5"
              className={inputCls}
            />
          </div>
          <div className="sm:col-span-2">
            <label className={labelCls}>Потолок затрат на направление, ₽</label>
            <input
              inputMode="decimal"
              value={form.budgetRub}
              onChange={(e) => set("budgetRub")(e.target.value)}
              placeholder="500 000"
              className={inputCls}
            />
          </div>
        </div>

        {/* Живая прикидка «идём или нет» */}
        {estimate != null && (
          <div
            className={`rounded-xl border px-4 py-3 text-sm ${
              overBudget
                ? "border-red-200 bg-red-50 text-red-800 dark:border-red-400/20 dark:bg-red-400/10 dark:text-red-300"
                : "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-300"
            }`}
          >
            Тест обойдётся ≈ <span className="font-semibold">{fmt(estimate)} ₽</span>
            {budget != null && (
              <>
                {" "}
                при потолке {fmt(budget)} ₽ —{" "}
                <span className="font-semibold">
                  {overBudget ? `выше потолка на ${fmt(estimate - budget)} ₽` : `влезаем, запас ${fmt(budget - estimate)} ₽`}
                </span>
              </>
            )}
            <div className="mt-0.5 text-xs opacity-75">
              {models} фасонов × {units} шт × {price} ¥ × {rate}
            </div>
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <label className={labelCls}>Заметки — что за направление, почему идём</label>
        <textarea
          value={form.notes}
          onChange={(e) => set("notes")(e.target.value)}
          rows={3}
          placeholder="К весне добавляем пиджачную группу: одна модель базовая дешевле, вторая моднее и дороже…"
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none"
        />
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={busy || !form.name.trim()}
          className="inline-flex h-11 items-center rounded-lg bg-slate-900 px-5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {busy ? "Сохраняю…" : initial ? "Сохранить" : "Создать план"}
        </button>
        <button
          type="button"
          onClick={() => router.back()}
          className="inline-flex h-11 items-center rounded-lg px-3 text-sm text-slate-500 hover:text-slate-700"
        >
          Отмена
        </button>
      </div>
    </form>
  );
}
