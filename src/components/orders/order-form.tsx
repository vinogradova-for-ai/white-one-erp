"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ORDER_TYPE_LABELS, DELIVERY_METHOD_LABELS } from "@/lib/constants";
import { ORDER_CREATE_STAGES } from "@/lib/order-stage";
import { formatCurrency } from "@/lib/format";
import { PhotoThumb } from "@/components/common/photo-thumb";
import { VariantVisual } from "@/components/common/variant-visual";
import { VariantPicker } from "@/components/common/variant-picker";
import { parsePaymentTerms, allocatePaymentDates, paymentLabel } from "@/lib/payments/parse-terms";
import { OrderTimeline } from "@/components/orders/order-timeline";
import type { DeliveryMethod } from "@prisma/client";
import { parseApiError, type ApiErrorResult } from "@/lib/api-error";
import { FormErrorBanner } from "@/components/common/form-errors";
import { resolveModelCost } from "@/lib/calculations/resolve-model-cost";

type VariantOption = {
  id: string;
  sku: string;
  colorName: string;
  photoUrl: string | null;
  defaultSizeProportion: Record<string, number> | null;
};

type PackagingItem = {
  id: string;
  name: string;
  photoUrl: string | null;
  quantityPerUnit: number;
  stock: number;
  inProductionQty: number;
};

type ModelOption = {
  id: string;
  name: string;
  photoUrl: string | null;
  countryOfOrigin: string | null;
  preferredFactoryId: string | null;
  customerPrice: string | null;
  fullCost: string | null;
  purchasePriceRub: string | null;
  purchasePriceCny: string | null;
  cnyRubRate: string | null;
  targetCostRub: string | null;
  targetCostCny: string | null;
  plannedRedemptionPct: string | null;
  sizes: string[];
  defaultSizeProportion: Record<string, number> | null;
  variants: VariantOption[];
  packaging: PackagingItem[];
};

type Option = { id: string; name: string; country?: string };

type LineInput = {
  variantId: string;
  sizeDistribution: Record<string, number>;
};

// Сумма штук по размерам = «количество» строки
function sumSizes(dist: Record<string, number>): number {
  return Object.values(dist).reduce((a, b) => a + (Number(b) || 0), 0);
}

// Дефолтная себестоимость в рублях из фасона.
// Приоритет — в общем хелпере resolveModelCost (тот же, что в backfill и на странице заказа).
function modelDefaultUnitCost(m: {
  purchasePriceRub: string | null;
  purchasePriceCny: string | null;
  cnyRubRate: string | null;
  fullCost: string | null;
  targetCostRub: string | null;
  targetCostCny: string | null;
}): string {
  const c = resolveModelCost(m);
  return c != null ? c.toString() : "";
}

// Пустое распределение — все размеры по нулю, чтобы Алёна заполняла вручную
function emptyDistribution(sizes: string[]): Record<string, number> {
  const result: Record<string, number> = {};
  sizes.forEach((s) => (result[s] = 0));
  return result;
}

export function OrderForm({
  models,
  factories,
  users,
  preselectedModelId,
  preselectedVariantId,
  preselectedStage,
  defaultOwnerId,
}: {
  models: ModelOption[];
  factories: Option[];
  users: Option[];
  preselectedModelId?: string;
  preselectedVariantId?: string;
  preselectedStage?: string;
  defaultOwnerId?: string | null;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [apiErr, setApiErr] = useState<ApiErrorResult | null>(null);

  // Фасон НЕ предвыбран (топ-4 UX-аудита): раньше подставлялся первый по
  // алфавиту — риск заказа «не туда». Теперь дефолт «— выберите —».
  const [modelId, setModelId] = useState(preselectedModelId ?? "");
  const model = useMemo(() => models.find((m) => m.id === modelId) ?? null, [models, modelId]);
  // Поиск по списку фасонов (их 42+, глазами листать долго).
  const [modelQuery, setModelQuery] = useState("");
  const filteredModels = useMemo(() => {
    const q = modelQuery.trim().toLowerCase();
    if (!q) return models;
    // Выбранный фасон оставляем в списке всегда, иначе select его «теряет».
    return models.filter((m) => m.id === modelId || m.name.toLowerCase().includes(q));
  }, [models, modelQuery, modelId]);

  const [lines, setLines] = useState<LineInput[]>(() => {
    const m = models.find((x) => x.id === preselectedModelId);
    const sizes = m?.sizes ?? [];
    if (preselectedVariantId && m?.variants.some((v) => v.id === preselectedVariantId)) {
      return [{ variantId: preselectedVariantId, sizeDistribution: emptyDistribution(sizes) }];
    }
    if (m?.variants[0]) {
      return [{ variantId: m.variants[0].id, sizeDistribution: emptyDistribution(sizes) }];
    }
    return [];
  });

  // Месяц продаж по умолчанию: +5 месяцев от сегодня. Редактируется ползунками на Гант-таймлайне
  // (sale start date), а поле в UI убрано — оно лишнее, когда есть визуальный график.
  const defaultLaunchMonth = (() => {
    const d = new Date();
    d.setMonth(d.getMonth() + 5);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  })();
  // Фабрика по умолчанию — preferredFactoryId фасона. Алёна может перевыбрать
  // другую фабрику в форме (например, тестово размещаем на другой) —
  // переопределение действует только для этого заказа.
  const initialFactoryId = (() => {
    const pref = models.find((m) => m.id === preselectedModelId)?.preferredFactoryId;
    return pref && factories.some((f) => f.id === pref) ? pref : "";
  })();
  // Этап, на который встанет заказ (= колонка канбана). По умолчанию «Разработка»,
  // либо предвыбранный (например, когда тащим фасон на колонку «Производство»).
  const initialStage = ORDER_CREATE_STAGES.some((s) => s.value === preselectedStage)
    ? (preselectedStage as string)
    : "PREPARATION";
  const [common, setCommon] = useState({
    orderType: "SEASONAL",
    stage: initialStage,
    launchMonth: defaultLaunchMonth,
    factoryId: initialFactoryId,
    ownerId: (defaultOwnerId && users.some((u) => u.id === defaultOwnerId)) ? defaultOwnerId : (users[0]?.id ?? ""),
    deliveryMethod: "CARGO_CN",
    paymentTerms: "30/70",
    notes: "",
  });

  // Стоимость единицы: по умолчанию подтягивается из «Себестоимости» фасона
  // (purchasePriceRub > purchasePriceCny × курс > fullCost). Алёна может
  // отредактировать в форме — это переопределение действует только для этого заказа.
  const [unitCost, setUnitCost] = useState<string>(model ? modelDefaultUnitCost(model) : "");

  // Платежи — массив строк, пересчитывается из paymentTerms пока юзер не правил вручную
  type PaymentRow = { id: string; plannedDate: string; amount: number; label: string; paid: boolean };
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [paymentsTouched, setPaymentsTouched] = useState(false);

  // Таймлайн — 4 этапа: разработка, производство, ОТК, доставка
  type Timeline = {
    decisionDate: string;
    handedToFactoryDate: string;
    readyAtFactoryDate: string;
    qcDate: string;
    arrivalPlannedDate: string;
  };
  const [timeline, setTimeline] = useState<Timeline>({
    decisionDate: "",
    handedToFactoryDate: "",
    readyAtFactoryDate: "",
    qcDate: "",
    arrivalPlannedDate: "",
  });

  // Когда меняется модель — сбрасываем строки, подтягиваем фабрику фасона по умолчанию
  function onModelChange(newId: string) {
    setModelId(newId);
    const m = models.find((x) => x.id === newId);
    if (m && m.variants.length > 0) {
      setLines([{
        variantId: m.variants[0].id,
        sizeDistribution: emptyDistribution(m.sizes),
      }]);
    } else {
      setLines([]);
    }
    // Если у новой модели есть preferredFactoryId и эта фабрика доступна —
    // подставляем её, чтобы пользователю не приходилось выбирать вручную.
    const pref = m?.preferredFactoryId;
    if (pref && factories.some((f) => f.id === pref)) {
      setCommon((c) => ({ ...c, factoryId: pref }));
    }
  }

  function addLine() {
    if (!model) return;
    const used = new Set(lines.map((l) => l.variantId));
    const next = model.variants.find((v) => !used.has(v.id));
    if (!next) return;
    setLines([...lines, {
      variantId: next.id,
      sizeDistribution: emptyDistribution(model.sizes),
    }]);
  }

  function updateLine(idx: number, patch: Partial<LineInput>) {
    setLines(lines.map((l, i) => i === idx ? { ...l, ...patch } : l));
  }

  function changeLineVariant(idx: number, variantId: string) {
    updateLine(idx, { variantId });
  }

  function removeLine(idx: number) {
    setLines(lines.filter((_, i) => i !== idx));
  }

  const totalQty = lines.reduce((a, l) => a + sumSizes(l.sizeDistribution), 0);
  const unitCostNum = Number(unitCost.replace(",", ".")) || 0;
  const totalBatchCost = unitCostNum * totalQty;
  const availableVariants = model?.variants.filter((v) => !lines.some((l) => l.variantId === v.id)) ?? [];

  // Автогенерация графика платежей — пока юзер не тронул
  useEffect(() => {
    if (paymentsTouched) return;
    const shares = parsePaymentTerms(common.paymentTerms);
    if (!shares || shares.length === 0) {
      // Один платёж на всё
      setPayments(totalBatchCost > 0 ? [{
        id: "pay-1",
        plannedDate: estimateCloseDate(common.launchMonth).toISOString().slice(0, 10),
        amount: Math.round(totalBatchCost),
        label: "Оплата по заказу",
        paid: false,
      }] : []);
      return;
    }
    const today = new Date();
    const closing = estimateCloseDate(common.launchMonth);
    const dates = allocatePaymentDates(shares, today, closing);
    setPayments(shares.map((share, i) => ({
      id: `pay-${i}`,
      plannedDate: dates[i].toISOString().slice(0, 10),
      amount: Math.round(totalBatchCost * share),
      label: paymentLabel(i, shares.length, share * 100),
      paid: false,
    })));
  }, [common.paymentTerms, common.launchMonth, totalBatchCost, paymentsTouched]);

  // При СМЕНЕ модели (по id) — подтягиваем unitCost с фасона.
  // Аудит п.8: раньше в deps была вся модель (новая ссылка каждый рендер) +
  // её ценовые поля, из-за чего эффект срабатывал постоянно и ЗАТИРАЛ цену,
  // которую менеджер ввёл руками под конкретный заказ. Теперь зависим ТОЛЬКО
  // от id модели: сменили фасон — подставили его цену; печатаешь свою — не трогаем.
  useEffect(() => {
    setUnitCost(model ? modelDefaultUnitCost(model) : "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model?.id]);

  // Синхронизируем launchMonth с датой прибытия партии (= месяц старта продаж).
  useEffect(() => {
    if (!timeline.arrivalPlannedDate) return;
    const [y, m] = timeline.arrivalPlannedDate.split("-");
    if (!y || !m) return;
    const next = `${y}-${m}`;
    if (next !== common.launchMonth) {
      setCommon((c) => ({ ...c, launchMonth: next }));
    }
  }, [timeline.arrivalPlannedDate, common.launchMonth]);

  function updatePayment(idx: number, patch: Partial<PaymentRow>) {
    setPaymentsTouched(true);
    setPayments(payments.map((p, i) => i === idx ? { ...p, ...patch } : p));
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
  function resetPayments() {
    setPaymentsTouched(false);
  }

  const paymentsTotal = payments.reduce((a, p) => a + (Number(p.amount) || 0), 0);
  const paymentsMismatch = totalBatchCost > 0 && Math.abs(paymentsTotal - totalBatchCost) > 1;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setApiErr(null);
    try {
      if (lines.length === 0) {
        setError("Добавьте хотя бы одну позицию");
        return;
      }
      const payload: Record<string, unknown> = {
        productModelId: modelId,
        lines: lines.map((l) => ({
          productVariantId: l.variantId,
          quantity: sumSizes(l.sizeDistribution),
          sizeDistribution: Object.keys(l.sizeDistribution).length > 0 ? l.sizeDistribution : null,
        })),
        orderType: common.orderType,
        status: common.stage,
        launchMonth: Number(common.launchMonth.replace("-", "")),
        factoryId: common.factoryId || null,
        ownerId: common.ownerId,
        deliveryMethod: common.deliveryMethod || null,
        paymentTerms: common.paymentTerms || null,
        notes: common.notes || null,
      };
      if (unitCostNum > 0) payload.unitCost = unitCostNum;
      if (payments.length > 0) {
        payload.payments = payments.map((p) => ({
          plannedDate: p.plannedDate,
          amount: p.amount,
          label: p.label,
          paid: p.paid,
        }));
      }
      // Таймлайн — даты этапов
      if (timeline.decisionDate) payload.decisionDate = timeline.decisionDate;
      if (timeline.handedToFactoryDate) payload.handedToFactoryDate = timeline.handedToFactoryDate;
      if (timeline.readyAtFactoryDate) payload.readyAtFactoryDate = timeline.readyAtFactoryDate;
      if (timeline.qcDate) payload.qcDate = timeline.qcDate;
      if (timeline.arrivalPlannedDate) payload.arrivalPlannedDate = timeline.arrivalPlannedDate;
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        setApiErr(await parseApiError(res));
        return;
      }
      const order = await res.json();
      router.push(`/orders/${order.id}`);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <Section id="sec-model" title="Фасон">
        <Field label="Фасон *" full>
          <div className="space-y-2">
            <input
              type="search"
              value={modelQuery}
              onChange={(e) => setModelQuery(e.target.value)}
              placeholder="Поиск по фасонам…"
              className={inputCls}
            />
            <select
              required
              value={modelId}
              onChange={(e) => onModelChange(e.target.value)}
              className={inputCls}
              size={modelQuery.trim() ? Math.min(8, Math.max(2, filteredModels.length)) : undefined}
            >
              <option value="">— выберите —</option>
              {filteredModels.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
            {modelQuery.trim() && filteredModels.length === 0 && (
              <p className="text-xs text-slate-500">Ничего не найдено по «{modelQuery}».</p>
            )}
          </div>
        </Field>
      </Section>

      {model && (
        <Section id="sec-lines" title={`Позиции (${lines.length}) · ${totalQty} шт`}>
          <div className="md:col-span-2 space-y-3">
            {lines.map((line, idx) => {
              const variant = model.variants.find((v) => v.id === line.variantId);
              const sizeSum = Object.values(line.sizeDistribution).reduce((a, b) => a + b, 0);
              return (
                <div key={idx} className="rounded-xl border border-slate-200 bg-white p-3">
                  <div className="flex items-start gap-3">
                    <VariantVisual
                      variantPhotoUrl={variant?.photoUrl ?? null}
                      modelPhotoUrl={model.photoUrl}
                      colorName={variant?.colorName ?? null}
                      size={48}
                    />
                    <div className="flex-1 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <VariantPicker
                          className="flex-1 min-w-[180px]"
                          value={line.variantId}
                          onChange={(id) => changeLineVariant(idx, id)}
                          options={model.variants.map((v) => {
                            const used = lines.some((l, i) => i !== idx && l.variantId === v.id);
                            return {
                              id: v.id,
                              sku: v.sku,
                              colorName: v.colorName,
                              photoUrl: v.photoUrl,
                              disabled: used,
                              disabledHint: used ? "уже в заказе" : undefined,
                            };
                          })}
                        />
                        <div className="flex items-baseline gap-1 rounded border border-slate-200 bg-slate-50 px-3 py-1.5">
                          <span className="text-base font-semibold text-slate-900">{sizeSum}</span>
                          <span className="text-xs text-slate-500">шт</span>
                        </div>
                        {lines.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeLine(idx)}
                            className="inline-flex min-h-[40px] items-center rounded-lg border border-slate-300 bg-white px-3 text-xs text-red-600 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-400/10 active:bg-red-50 dark:active:bg-red-400/10"
                          >
                            Удалить
                          </button>
                        )}
                      </div>
                      {model.sizes.length > 0 && (
                        <div>
                          <div className="text-xs text-slate-500">
                            Распределение по размерам
                          </div>
                          <div className="mt-1 grid grid-cols-4 gap-1 sm:grid-cols-6 md:grid-cols-8">
                            {model.sizes.map((s) => (
                              <label key={s} className="block">
                                <div className="text-center text-[10px] font-medium text-slate-600">{s}</div>
                                <input
                                  type="text"
                                  inputMode="numeric"
                                  value={line.sizeDistribution[s] ?? 0}
                                  onFocus={(e) => e.target.select()}
                                  onChange={(e) => {
                                    const digits = e.target.value.replace(/\D/g, "");
                                    const n = digits === "" ? 0 : Number(digits);
                                    updateLine(idx, {
                                      sizeDistribution: { ...line.sizeDistribution, [s]: n },
                                    });
                                  }}
                                  className="mt-0.5 w-full rounded border border-slate-300 bg-white px-1 py-1 text-center text-xs"
                                />
                              </label>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}

            {availableVariants.length > 0 && (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={addLine}
                  className="flex-1 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 py-3 text-sm text-slate-600 hover:border-slate-400"
                >
                  + Добавить цвет
                </button>
                {/* §4: заказ обычно на весь фасон — все цвета одной кнопкой */}
                {availableVariants.length > 1 && (
                  <button
                    type="button"
                    onClick={() => {
                      if (!model) return;
                      const used = new Set(lines.map((l) => l.variantId));
                      setLines([
                        ...lines,
                        ...model.variants
                          .filter((v) => !used.has(v.id))
                          .map((v) => ({ variantId: v.id, sizeDistribution: emptyDistribution(model.sizes) })),
                      ]);
                    }}
                    className="rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-600 hover:border-slate-400"
                  >
                    + все цвета ({availableVariants.length})
                  </button>
                )}
              </div>
            )}
            {model.variants.length === 0 && (
              <p className="text-sm text-slate-500">У фасона нет цветовых вариантов в статусе «Готов к заказу».</p>
            )}
          </div>
        </Section>
      )}

      <Section id="sec-production" title="Производство">
        <Field label="Фабрика">
          <select value={common.factoryId} onChange={(e) => setCommon({ ...common, factoryId: e.target.value })} className={inputCls}>
            <option value="">— как в фасоне —</option>
            {factories.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}{f.country ? ` · ${f.country}` : ""}
              </option>
            ))}
          </select>
          {(() => {
            // П6: фабрика не из страны производства фасона — подсветка.
            const sel = factories.find((f) => f.id === common.factoryId);
            const modelCountry = model?.countryOfOrigin;
            return sel?.country && modelCountry && sel.country !== modelCountry ? (
              <p className="mt-1 text-xs font-medium text-amber-700 dark:text-amber-300">
                ⚠ Фабрика «{sel.name}» из {sel.country}, а страна фасона — {modelCountry}. Проверьте.
              </p>
            ) : null;
          })()}
        </Field>
        <Field label="Ответственный *">
          <select value={common.ownerId} onChange={(e) => setCommon({ ...common, ownerId: e.target.value })} className={inputCls}>
            {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </Field>
        {/* §4: условия оплаты и ожидаемая готовность — прямо в форме,
            а не только через график/таймлайн ниже. */}
        <Field label="Условия оплаты">
          <input
            value={common.paymentTerms}
            onChange={(e) => setCommon({ ...common, paymentTerms: e.target.value })}
            placeholder="30/70"
            className={inputCls}
          />
        </Field>
        <Field label="Ожидаемая готовность на фабрике">
          <input
            type="date"
            value={timeline.readyAtFactoryDate}
            onChange={(e) => setTimeline({ ...timeline, readyAtFactoryDate: e.target.value })}
            className={inputCls}
          />
        </Field>
        <Field label="Способ доставки" full>
          <select value={common.deliveryMethod} onChange={(e) => setCommon({ ...common, deliveryMethod: e.target.value })} className={inputCls}>
            {Object.entries(DELIVERY_METHOD_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
      </Section>

      {model && totalQty > 0 && (
        <div id="sec-timeline" className="scroll-mt-24">
          <OrderTimeline
            launchMonth={common.launchMonth}
            onChange={setTimeline}
            initial={timeline}
            deliveryMethod={(common.deliveryMethod || null) as DeliveryMethod | null}
          />
        </div>
      )}

      {model && (
        <Section id="sec-cost" title="Стоимость и сумма заказа">
          <Field label="Стоимость единицы, ₽ *">
            <input
              type="text"
              inputMode="decimal"
              value={unitCost}
              onChange={(e) => setUnitCost(e.target.value.replace(/[^\d.,]/g, ""))}
              placeholder={modelDefaultUnitCost(model) || "0"}
              className={inputCls}
            />
            {(() => {
              const defaultCost = modelDefaultUnitCost(model);
              if (!defaultCost) {
                return (
                  <p className="mt-1 text-xs text-slate-500">
                    У фасона не задана себестоимость — введи цену вручную или поставь её на странице фасона.
                  </p>
                );
              }
              const diffsFromModel = Math.abs(unitCostNum - Number(defaultCost)) > 0.01;
              if (diffsFromModel) {
                return (
                  <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
                    Отличается от себестоимости фасона ({formatCurrency(Number(defaultCost))}). Изменение применится только к этому заказу.
                  </p>
                );
              }
              return (
                <p className="mt-1 text-xs text-slate-500">
                  Подтянуто из себестоимости фасона. Можно поправить под этот заказ.
                </p>
              );
            })()}
          </Field>
          <div className="md:col-span-1 flex flex-col justify-end">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-xs text-slate-500">Сумма заказа</div>
              <div className="mt-1 text-xl font-semibold text-slate-900">{formatCurrency(totalBatchCost)}</div>
              <div className="mt-0.5 text-xs text-slate-500">{formatCurrency(unitCostNum)} × {totalQty} шт</div>
            </div>
          </div>
        </Section>
      )}

      {model && totalBatchCost > 0 && (
        <Section id="sec-payments" title="График платежей">
          <div className="md:col-span-2 space-y-2">
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span>
                Рассчитано по условиям «{common.paymentTerms}».
                {paymentsTouched && " Вы изменили вручную."}
              </span>
              {paymentsTouched && (
                <button
                  type="button"
                  onClick={resetPayments}
                  className="text-slate-600 hover:text-slate-900 underline"
                >
                  Вернуть авто-расчёт
                </button>
              )}
            </div>
            {payments.map((p, idx) => (
              <div
                key={p.id}
                className="grid grid-cols-2 items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2 sm:grid-cols-[140px_1fr_140px_auto_auto] sm:border-0 sm:bg-transparent sm:p-0"
              >
                <input
                  type="date"
                  value={p.plannedDate}
                  onChange={(e) => updatePayment(idx, { plannedDate: e.target.value })}
                  className="h-11 rounded-lg border border-slate-300 bg-white px-2 text-sm sm:h-9"
                />
                <input
                  type="number"
                  inputMode="numeric"
                  value={p.amount}
                  onChange={(e) => updatePayment(idx, { amount: Number(e.target.value) || 0 })}
                  placeholder="сумма"
                  className="h-11 rounded-lg border border-slate-300 bg-white px-2 text-right text-sm sm:order-3 sm:h-9"
                />
                <input
                  type="text"
                  value={p.label}
                  onChange={(e) => updatePayment(idx, { label: e.target.value })}
                  placeholder="Название"
                  className="col-span-2 h-11 rounded-lg border border-slate-300 bg-white px-2 text-sm sm:order-2 sm:col-span-1 sm:h-9"
                />
                <label className="flex items-center gap-1.5 whitespace-nowrap text-xs text-slate-600 sm:order-4">
                  <input
                    type="checkbox"
                    checked={p.paid}
                    onChange={(e) => updatePayment(idx, { paid: e.target.checked })}
                    className="h-4 w-4"
                  />
                  Оплачено
                </label>
                <button
                  type="button"
                  onClick={() => removePayment(idx)}
                  aria-label="Удалить платёж"
                  className="ml-auto flex h-11 w-11 items-center justify-center rounded-lg border border-slate-300 bg-white text-base text-red-600 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-400/10 sm:order-5 sm:h-9 sm:w-9"
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
                <span className={paymentsMismatch ? "font-semibold text-red-600 dark:text-red-300" : "font-semibold text-slate-900"}>
                  {formatCurrency(paymentsTotal)}
                </span>
                {paymentsMismatch && (
                  <span className="ml-2 text-xs text-red-600 dark:text-red-300">
                    расхождение с суммой заказа: {formatCurrency(paymentsTotal - totalBatchCost)}
                  </span>
                )}
              </div>
            </div>
          </div>
        </Section>
      )}

      {model && model.packaging.length > 0 && (
        <Section id="sec-packaging" title="Упаковка на партию">
          <div className="md:col-span-2 space-y-2">
            {model.packaging.map((p) => {
              const needed = Math.ceil(p.quantityPerUnit * totalQty);
              const available = p.stock + p.inProductionQty;
              const shortage = needed - available;
              return (
                <div key={p.id} className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-3">
                  {p.photoUrl ? (
                    <PhotoThumb url={p.photoUrl} size={40} />
                  ) : (
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-[10px] text-slate-400">нет фото</div>
                  )}
                  <div className="flex-1 text-sm">
                    <div className="font-medium text-slate-900">{p.name}</div>
                    <div className="text-xs text-slate-500">
                      {p.quantityPerUnit} × {totalQty} шт = <span className="font-semibold text-slate-700">{needed} шт</span>
                      {" · "}В наличии: {p.stock} · В производстве: {p.inProductionQty}
                      {shortage > 0 && (
                        <span className="ml-2 font-medium text-red-600 dark:text-red-300">не хватает {shortage} шт</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </Section>
      )}

      <Section id="sec-params" title="Параметры заказа">
        <Field label="Тип заказа *">
          <select value={common.orderType} onChange={(e) => setCommon({ ...common, orderType: e.target.value })} className={inputCls}>
            {Object.entries(ORDER_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
        <Field label="Этап (колонка канбана) *">
          <select value={common.stage} onChange={(e) => setCommon({ ...common, stage: e.target.value })} className={inputCls}>
            {ORDER_CREATE_STAGES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
          <p className="mt-1 text-xs text-slate-500">
            На какую колонку встанет заказ. По умолчанию «Разработка» — поставь дальше, если заказ уже шьётся или в пути.
          </p>
        </Field>
      </Section>

      {error && <div className="rounded-lg bg-red-50 dark:bg-red-400/10 p-3 text-sm text-red-700 dark:text-red-300">{error}</div>}
      <FormErrorBanner error={apiErr} />

      <div className="pb-safe-4 sticky bottom-16 z-30 -mx-4 flex gap-3 border-t border-slate-200 bg-white px-4 pt-4 md:bottom-0 md:mx-0 md:flex-wrap md:justify-end md:px-0">
        <button type="button" onClick={() => router.back()} className="flex h-11 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 text-sm">
          Отмена
        </button>
        <button type="submit" disabled={saving || !modelId || lines.length === 0} className="flex h-11 flex-1 items-center justify-center rounded-lg bg-slate-900 px-4 text-sm font-medium text-white disabled:opacity-50 md:flex-none">
          {saving ? "Сохранение…" : "Создать заказ"}
        </button>
      </div>
    </form>
  );
}

const inputCls = "min-h-[44px] w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-900 focus:ring-1 focus:ring-slate-900";

// Оценка даты готовности партии для дефолтного графика платежей.
// Берём 1-е число месяца продаж (YYYY-MM) и вычитаем 45 дней.
function estimateCloseDate(yearMonth: string): Date {
  const [y, m] = yearMonth.split("-").map(Number);
  if (!y || !m) return new Date(Date.now() + 60 * 24 * 60 * 60 * 1000);
  const firstOfLaunch = new Date(Date.UTC(y, m - 1, 1));
  return new Date(firstOfLaunch.getTime() - 45 * 24 * 60 * 60 * 1000);
}

function Section({ title, children, id }: { title: string; children: React.ReactNode; id?: string }) {
  return (
    <fieldset id={id} className="space-y-3 scroll-mt-24">
      <legend className="text-sm font-semibold uppercase tracking-wide text-slate-500">{title}</legend>
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
