"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { PackagingType } from "@prisma/client";
import { PackagingPicker, type PackagingPickerOption } from "@/components/common/packaging-picker";
import { parseApiError, type ApiErrorResult } from "@/lib/api-error";
import { FormErrorBanner } from "@/components/common/form-errors";
import { DELIVERY_METHOD_LABELS } from "@/lib/constants";
import { DeliveryMethod } from "@prisma/client";
import { PackagingOrderTimeline } from "./packaging-order-timeline";

type PackagingOption = PackagingPickerOption & {
  unitPriceRub: string | null;
  unitPriceCny: string | null;
  priceCurrency: "RUB" | "CNY" | null;
  cnyRubRate: string | null;
};
type FactoryOption = { id: string; name: string };
type UserOption = { id: string; name: string };

type LineInput = {
  packagingItemId: string;
  quantity: number;
  unitPriceRub: string;
  unitPriceCny: string;
  priceCurrency: "RUB" | "CNY";
  cnyRubRate: string;
};

type Initial = {
  id?: string;
  lines: LineInput[];
  factoryId: string;
  supplierName: string;
  expectedDate: string;
  ownerId: string;
  notes: string;
  deliveryMethod: DeliveryMethod | "";
};

const inputCls =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-900 focus:ring-1 focus:ring-slate-900";

function makeEmptyLine(): LineInput {
  return {
    packagingItemId: "",
    quantity: 1000,
    unitPriceRub: "",
    unitPriceCny: "",
    priceCurrency: "RUB",
    cnyRubRate: "",
  };
}

export function PackagingOrderForm({
  packagings,
  factories,
  users,
  defaultOwnerId,
  initial,
}: {
  packagings: PackagingOption[];
  factories: FactoryOption[];
  users: UserOption[];
  defaultOwnerId: string;
  initial?: Initial;
}) {
  const router = useRouter();
  const [form, setForm] = useState<Initial>(
    initial ?? {
      lines: [makeEmptyLine()],
      factoryId: "",
      supplierName: "",
      expectedDate: "",
      ownerId: defaultOwnerId,
      notes: "",
      deliveryMethod: "CHINA_INTERNAL",
    },
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [apiErr, setApiErr] = useState<ApiErrorResult | null>(null);

  const packagingById = useMemo(
    () => new Map(packagings.map((p) => [p.id, p])),
    [packagings],
  );

  function updateLine(idx: number, patch: Partial<LineInput>) {
    setForm((f) => ({
      ...f,
      lines: f.lines.map((l, i) => (i === idx ? { ...l, ...patch } : l)),
    }));
  }

  function pickLineItem(idx: number, packagingItemId: string) {
    const p = packagingById.get(packagingItemId);
    updateLine(idx, {
      packagingItemId,
      unitPriceRub: p?.unitPriceRub ?? "",
      unitPriceCny: p?.unitPriceCny ?? "",
      priceCurrency: (p?.priceCurrency ?? "RUB") as "RUB" | "CNY",
      cnyRubRate: p?.cnyRubRate ?? "",
    });
  }

  function addLine() {
    setForm((f) => ({ ...f, lines: [...f.lines, makeEmptyLine()] }));
  }

  function removeLine(idx: number) {
    setForm((f) => ({
      ...f,
      lines: f.lines.length > 1 ? f.lines.filter((_, i) => i !== idx) : f.lines,
    }));
  }

  function lineTotalRub(l: LineInput): number {
    const isCny = l.priceCurrency === "CNY";
    if (isCny && l.unitPriceCny && l.cnyRubRate) {
      return Number(l.unitPriceCny) * Number(l.cnyRubRate) * l.quantity;
    }
    if (!isCny && l.unitPriceRub) {
      return Number(l.unitPriceRub) * l.quantity;
    }
    return 0;
  }

  const totalQty = form.lines.reduce((a, l) => a + (Number(l.quantity) || 0), 0);
  const totalRub = form.lines.reduce((a, l) => a + lineTotalRub(l), 0);
  const usedItemIds = new Set(form.lines.map((l) => l.packagingItemId).filter(Boolean));

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setApiErr(null);
    try {
      if (form.lines.some((l) => !l.packagingItemId)) {
        setError("Во всех позициях выберите упаковку");
        return;
      }
      const payload = {
        factoryId: form.factoryId || null,
        supplierName: form.supplierName.trim() || null,
        expectedDate: form.expectedDate || null,
        ownerId: form.ownerId,
        notes: form.notes.trim() || null,
        deliveryMethod: form.deliveryMethod || null,
        lines: form.lines.map((l) => {
          const isCny = l.priceCurrency === "CNY";
          return {
            packagingItemId: l.packagingItemId,
            quantity: Number(l.quantity),
            unitPriceRub: !isCny && l.unitPriceRub ? Number(l.unitPriceRub) : null,
            unitPriceCny: isCny && l.unitPriceCny ? Number(l.unitPriceCny) : null,
            priceCurrency: l.priceCurrency,
            cnyRubRate: isCny && l.cnyRubRate ? Number(l.cnyRubRate) : null,
          };
        }),
      };
      const url = initial?.id ? `/api/packaging-orders/${initial.id}` : "/api/packaging-orders";
      const method = initial?.id ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        setApiErr(await parseApiError(res));
        return;
      }
      const created = await res.json();
      router.push(`/packaging-orders/${created.id ?? initial?.id}`);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      {/* Позиции */}
      <Section title={`Позиции (${form.lines.length}) · ${totalQty.toLocaleString("ru-RU")} шт`}>
        <div className="md:col-span-2 space-y-3">
          {form.lines.map((line, idx) => {
            const options = packagings.filter(
              (opt) => opt.id === line.packagingItemId || !usedItemIds.has(opt.id),
            );
            const isCny = line.priceCurrency === "CNY";
            return (
              <div
                key={idx}
                className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-3"
              >
                <div className="flex items-start gap-2">
                  <div className="flex-1">
                    <PackagingPicker
                      value={line.packagingItemId}
                      options={options}
                      onChange={(id) => pickLineItem(idx, id)}
                    />
                  </div>
                  {form.lines.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeLine(idx)}
                      className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                    >
                      Убрать
                    </button>
                  )}
                </div>

                <div className="grid gap-3 md:grid-cols-4">
                  <label className="block">
                    <span className="mb-1 block text-xs text-slate-500">Количество</span>
                    <input
                      type="number"
                      min={1}
                      value={line.quantity}
                      onChange={(e) => updateLine(idx, { quantity: Math.max(1, Number(e.target.value) || 1) })}
                      className={inputCls}
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs text-slate-500">Валюта</span>
                    <select
                      value={line.priceCurrency}
                      onChange={(e) => updateLine(idx, { priceCurrency: e.target.value as "RUB" | "CNY" })}
                      className={inputCls}
                    >
                      <option value="RUB">₽ рубли</option>
                      <option value="CNY">¥ юани</option>
                    </select>
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs text-slate-500">
                      Цена за шт ({isCny ? "¥" : "₽"})
                    </span>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={isCny ? line.unitPriceCny : line.unitPriceRub}
                      onChange={(e) => {
                        const v = e.target.value.replace(",", ".");
                        updateLine(idx, isCny ? { unitPriceCny: v } : { unitPriceRub: v });
                      }}
                      placeholder={isCny ? "0.5" : "5"}
                      className={inputCls}
                    />
                  </label>
                  {isCny && (
                    <label className="block">
                      <span className="mb-1 block text-xs text-slate-500">Курс ¥→₽</span>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={line.cnyRubRate}
                        onChange={(e) => updateLine(idx, { cnyRubRate: e.target.value.replace(",", ".") })}
                        placeholder="12.5"
                        className={inputCls}
                      />
                    </label>
                  )}
                </div>

                {lineTotalRub(line) > 0 && (
                  <div className="text-xs text-slate-500">
                    Итого по позиции:{" "}
                    <span className="font-semibold text-slate-900">
                      {lineTotalRub(line).toLocaleString("ru-RU", { maximumFractionDigits: 2 })} ₽
                    </span>
                  </div>
                )}
              </div>
            );
          })}

          <button
            type="button"
            onClick={addLine}
            disabled={packagings.length === usedItemIds.size}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            + Добавить позицию
          </button>
        </div>
      </Section>

      {/* Стоимость (общая) */}
      {totalRub > 0 && (
        <div className="rounded-xl border border-slate-200 bg-emerald-50 p-4">
          <div className="text-xs uppercase tracking-wide text-emerald-700">Сумма заказа</div>
          <div className="mt-1 text-2xl font-semibold text-emerald-900">
            {totalRub.toLocaleString("ru-RU", { maximumFractionDigits: 2 })} ₽
          </div>
          <div className="mt-0.5 text-xs text-emerald-700">
            Автоматически создастся платёж (PACKAGING) на эту сумму при создании заказа
          </div>
        </div>
      )}

      {/* Параметры */}
      <Section title="Параметры">
        <Field label="Поставщик / фабрика">
          <select
            value={form.factoryId}
            onChange={(e) => setForm({ ...form, factoryId: e.target.value })}
            className={inputCls}
          >
            <option value="">— из справочника —</option>
            {factories.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Или вручную">
          <input
            value={form.supplierName}
            onChange={(e) => setForm({ ...form, supplierName: e.target.value })}
            placeholder="ИП Иванов / Pinhao Tags"
            className={inputCls}
          />
        </Field>
        <Field label="Ответственный">
          <select
            value={form.ownerId}
            onChange={(e) => setForm({ ...form, ownerId: e.target.value })}
            className={inputCls}
          >
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Способ доставки">
          <select
            value={form.deliveryMethod}
            onChange={(e) =>
              setForm({ ...form, deliveryMethod: e.target.value as DeliveryMethod | "" })
            }
            className={inputCls}
          >
            <option value="">— не задан —</option>
            {(Object.entries(DELIVERY_METHOD_LABELS) as [DeliveryMethod, string][]).map(
              ([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ),
            )}
          </select>
        </Field>
        <Field label="Дедлайн поставки">
          <input
            type="date"
            value={form.expectedDate}
            onChange={(e) => setForm({ ...form, expectedDate: e.target.value })}
            className={inputCls}
          />
        </Field>
      </Section>

      {/* Гант: Производство → Доставка. Дедлайн тащится мышкой. */}
      <Section title="График заказа упаковки">
        <div className="md:col-span-2">
          <PackagingOrderTimeline
            orderedDate={(() => {
              const t = new Date();
              const y = t.getFullYear();
              const m = String(t.getMonth() + 1).padStart(2, "0");
              const d = String(t.getDate()).padStart(2, "0");
              return `${y}-${m}-${d}`;
            })()}
            expectedDate={form.expectedDate}
            onChangeExpected={(value) => setForm({ ...form, expectedDate: value })}
          />
          <p className="mt-2 text-xs text-slate-500">
            Перетащите правый край, чтобы поставить дедлайн прибытия. Полоса разделится на «Производство» (60%) и «Доставка» (40%) автоматически.
          </p>
        </div>
      </Section>

      {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      <FormErrorBanner error={apiErr} />

      <div className="sticky bottom-0 flex justify-end gap-2 border-t border-slate-200 bg-white pt-4">
        <button
          type="button"
          onClick={() => router.back()}
          className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700"
        >
          Отмена
        </button>
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {saving ? "Сохранение…" : initial?.id ? "Сохранить" : "Создать заказ"}
        </button>
      </div>
    </form>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="space-y-3">
      <legend className="text-sm font-semibold uppercase tracking-wide text-slate-500">
        {title}
      </legend>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">{children}</div>
    </fieldset>
  );
}

function Field({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <label className={`block ${full ? "md:col-span-2" : ""}`}>
      <span className="mb-1 block text-sm text-slate-700">{label}</span>
      {children}
    </label>
  );
}
