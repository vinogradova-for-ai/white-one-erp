"use client";

import { useEffect, useMemo, useState } from "react";
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

type PaymentRow = {
  id: string;
  plannedDate: string;
  amount: number;
  label: string;
  paid: boolean;
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
  payments?: PaymentRow[];
};

const inputCls =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-900 focus:ring-1 focus:ring-slate-900";

// По умолчанию курс юаня — 12 ₽/¥. Можно переопределить в форме.
const DEFAULT_CNY_RATE = "12";

function makeEmptyLine(): LineInput {
  return {
    packagingItemId: "",
    quantity: 1000,
    unitPriceRub: "",
    unitPriceCny: "",
    priceCurrency: "CNY",
    cnyRubRate: DEFAULT_CNY_RATE,
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
      deliveryMethod: "CARGO_CN",
    },
  );
  const [payments, setPayments] = useState<PaymentRow[]>(
    initial?.payments ?? [],
  );
  const [paymentsTouched, setPaymentsTouched] = useState(!!initial?.payments?.length);
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
      priceCurrency: (p?.priceCurrency ?? "CNY") as "RUB" | "CNY",
      cnyRubRate: p?.cnyRubRate ?? DEFAULT_CNY_RATE,
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

  // Авто-генерация графика 30/70, пока пользователь не правил вручную
  useEffect(() => {
    if (paymentsTouched) return;
    if (totalRub <= 0) return;
    const today = new Date().toISOString().slice(0, 10);
    const arrival = form.expectedDate || today;
    setPayments([
      { id: "p1", plannedDate: today, amount: Math.round(totalRub * 0.3), label: "Предоплата 30%", paid: false },
      { id: "p2", plannedDate: arrival, amount: Math.round(totalRub * 0.7), label: "Постоплата 70%", paid: false },
    ]);
  }, [totalRub, form.expectedDate, paymentsTouched]);

  function updatePayment(idx: number, patch: Partial<PaymentRow>) {
    setPaymentsTouched(true);
    setPayments(payments.map((p, i) => (i === idx ? { ...p, ...patch } : p)));
  }
  function addPayment() {
    setPaymentsTouched(true);
    setPayments([...payments, {
      id: `pay-${Date.now()}`,
      plannedDate: new Date().toISOString().slice(0, 10),
      amount: 0,
      label: "Платёж",
      paid: false,
    }]);
  }
  function removePayment(idx: number) {
    setPaymentsTouched(true);
    setPayments(payments.filter((_, i) => i !== idx));
  }
  const paymentsTotal = payments.reduce((a, p) => a + (Number(p.amount) || 0), 0);
  const paymentsMismatch = totalRub > 0 && Math.abs(paymentsTotal - totalRub) > 1;

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
      const payload: Record<string, unknown> = {
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
      if (payments.length > 0) {
        payload.payments = payments.map((p) => ({
          plannedDate: p.plannedDate,
          amount: p.amount,
          label: p.label,
          paid: p.paid,
        }));
      }
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
        </div>
      )}

      {/* График платежей */}
      {totalRub > 0 && (
        <Section title="График платежей">
          <div className="md:col-span-2 space-y-2">
            <div className="flex flex-wrap gap-1.5">
              <span className="text-xs uppercase tracking-wide text-slate-400 mr-1 self-center">Шаблон:</span>
              <button
                type="button"
                onClick={() => {
                  setPaymentsTouched(true);
                  const today = new Date().toISOString().slice(0, 10);
                  const arrival = form.expectedDate || today;
                  setPayments([
                    { id: `pre-${Date.now()}-1`, plannedDate: today, amount: Math.round(totalRub * 0.3), label: "Предоплата 30%", paid: false },
                    { id: `pre-${Date.now()}-2`, plannedDate: arrival, amount: totalRub - Math.round(totalRub * 0.3), label: "Постоплата 70%", paid: false },
                  ]);
                }}
                className="rounded-full border border-slate-300 bg-white px-3 py-1 text-xs hover:bg-slate-50"
              >Предоплата 30/70</button>
              <button
                type="button"
                onClick={() => {
                  setPaymentsTouched(true);
                  setPayments([{ id: `pre-${Date.now()}`, plannedDate: new Date().toISOString().slice(0, 10), amount: totalRub, label: "Предоплата 100%", paid: false }]);
                }}
                className="rounded-full border border-slate-300 bg-white px-3 py-1 text-xs hover:bg-slate-50"
              >Предоплата 100%</button>
              <button
                type="button"
                onClick={() => {
                  setPaymentsTouched(true);
                  const arrival = form.expectedDate || new Date().toISOString().slice(0, 10);
                  setPayments([{ id: `pre-${Date.now()}`, plannedDate: arrival, amount: totalRub, label: "Постоплата 100% (после производства)", paid: false }]);
                }}
                className="rounded-full border border-slate-300 bg-white px-3 py-1 text-xs hover:bg-slate-50"
              >Постоплата 100%</button>
            </div>
            {payments.length === 0 && (
              <p className="text-sm text-slate-500">График пуст. Выберите шаблон выше или добавьте платежи вручную.</p>
            )}
            {payments.map((p, idx) => (
              <div key={p.id} className="grid grid-cols-[140px_1fr_140px_auto_auto] gap-2 items-center">
                <input
                  type="date"
                  value={p.plannedDate}
                  onChange={(e) => updatePayment(idx, { plannedDate: e.target.value })}
                  className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm"
                />
                <input
                  type="text"
                  value={p.label}
                  onChange={(e) => updatePayment(idx, { label: e.target.value })}
                  placeholder="Название"
                  className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm"
                />
                <input
                  type="number"
                  value={p.amount}
                  onChange={(e) => updatePayment(idx, { amount: Number(e.target.value) || 0 })}
                  className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-right text-sm"
                />
                <label className="flex items-center gap-1 text-xs text-slate-600 whitespace-nowrap">
                  <input
                    type="checkbox"
                    checked={p.paid}
                    onChange={(e) => updatePayment(idx, { paid: e.target.checked })}
                  />
                  Оплачено
                </label>
                <button
                  type="button"
                  onClick={() => removePayment(idx)}
                  className="rounded-lg border border-slate-300 bg-white px-2 text-xs text-red-600 hover:bg-red-50"
                >
                  ×
                </button>
              </div>
            ))}
            <div className="flex items-center justify-between pt-1">
              <button
                type="button"
                onClick={addPayment}
                className="text-sm text-slate-600 hover:text-slate-900 underline"
              >
                + Добавить платёж
              </button>
              <div className="text-sm">
                <span className="text-slate-500">Итого:</span>{" "}
                <span className={paymentsMismatch ? "font-semibold text-red-600" : "font-semibold text-slate-900"}>
                  {paymentsTotal.toLocaleString("ru-RU")} ₽
                </span>
                {paymentsMismatch && (
                  <span className="ml-2 text-xs text-red-600">
                    расхождение: {(paymentsTotal - totalRub).toLocaleString("ru-RU")} ₽
                  </span>
                )}
              </div>
            </div>
          </div>
        </Section>
      )}

      {/* Параметры */}
      <Section title="Параметры">
        <Field label="Поставщик / фабрика из справочника">
          <select
            value={form.factoryId}
            onChange={(e) =>
              setForm({
                ...form,
                factoryId: e.target.value,
                // выбрали из справочника — стираем ручное имя
                supplierName: e.target.value ? "" : form.supplierName,
              })
            }
            className={inputCls}
          >
            <option value="">— не выбрано —</option>
            {factories.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Или ввести имя поставщика вручную">
          <input
            value={form.supplierName}
            onChange={(e) =>
              setForm({
                ...form,
                supplierName: e.target.value,
                // ввели руками — снимаем выбор из справочника
                factoryId: e.target.value ? "" : form.factoryId,
              })
            }
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
      </Section>

      {/* Гант: Производство → Доставка. Каждую плашку можно тащить отдельно. */}
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
            deliveryMethod={form.deliveryMethod || null}
          />
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
