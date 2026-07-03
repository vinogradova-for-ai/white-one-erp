"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CATEGORIES, BRAND_LABELS, DEFAULT_CNY_RUB_RATE } from "@/lib/constants";
import { Brand } from "@prisma/client";
import { DropzonePhotos } from "@/components/common/dropzone-photos";
import { SizeGridPicker } from "@/components/common/size-grid-picker";
import { FormProgressNav } from "@/components/common/form-progress-nav";

type Option = { id: string; name: string; country?: string };
type SizeGridOption = { id: string; name: string; sizes: string[] };

export function ModelEditForm({
  model,
  users,
  factories,
  sizeGrids,
}: {
  model: {
    id: string;
    name: string;
    brand: Brand;
    category: string;
    subcategory: string;
    sizeGridId: string;
    countryOfOrigin: string;
    tnvedCode: string;
    preferredFactoryId: string;
    developmentType: "OWN" | "REPEAT";
    isRepeat: boolean;
    fabricName: string;
    fabricComposition: string;
    fabricConsumption: string;
    fabricPricePerMeter: string;
    fabricCurrency: "RUB" | "CNY";
    patternsUrl: string;
    photoUrls: string[];
    ownerId: string;
    notes: string;
    purchasePriceCny: string;
    purchasePriceRub: string;
    cnyRubRate: string;
    packagingCost: string;
    wbLogisticsCost: string;
    wbPrice: string;
    customerPrice: string;
    wbCommissionPct: string;
    drrPct: string;
    plannedRedemptionPct: string;
    targetCostCny: string;
    targetCostRub: string;
    targetCostNote: string;
    patternsDate: string;
    sampleDate: string;
    approvedDate: string;
    productionStartDate: string;
    plannedLaunchMonth: number | null;
  };
  users: Option[];
  factories: Option[];
  sizeGrids: SizeGridOption[];
}) {
  const router = useRouter();
  // При первой загрузке мигрируем legacy targetCost* в purchasePrice* —
  // если новое поле пустое, а старое заполнено. Так Алёна сразу видит
  // свою цену в едином поле «Себестоимость», а при сохранении она
  // запишется в правильное поле БД.
  const [form, setForm] = useState(() => {
    const next = { ...model };
    if (!next.purchasePriceRub && !next.purchasePriceCny) {
      if (model.targetCostRub) next.purchasePriceRub = model.targetCostRub;
      else if (model.targetCostCny) next.purchasePriceCny = model.targetCostCny;
    }
    return next;
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isChina = form.countryOfOrigin === "Китай";
  const currentSizes = sizeGrids.find((g) => g.id === form.sizeGridId)?.sizes ?? [];

  function changeSizeGrid(id: string) {
    setForm({ ...form, sizeGridId: id });
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const payload = {
        name: form.name,
        brand: form.brand,
        category: form.category,
        subcategory: form.subcategory || null,
        countryOfOrigin: form.countryOfOrigin,
        tnvedCode: form.tnvedCode || null,
        preferredFactoryId: form.preferredFactoryId || null,
        sizeGridId: form.sizeGridId || null,
        developmentType: form.developmentType,
        isRepeat: form.isRepeat,
        fabricName: form.fabricName || null,
        fabricComposition: form.fabricComposition || null,
        fabricPricePerMeter: form.fabricPricePerMeter ? Number(form.fabricPricePerMeter) : null,
        fabricCurrency: form.fabricPricePerMeter ? form.fabricCurrency : null,
        patternsUrl: form.patternsUrl || null,
        photoUrls: form.photoUrls,
        ownerId: form.ownerId,
        notes: form.notes || null,
        // Валюта себестоимости — по тому, какое поле заполнил пользователь
        // (а не по стране производства, как было раньше).
        purchasePriceCny: form.purchasePriceCny ? Number(form.purchasePriceCny) : null,
        purchasePriceRub: form.purchasePriceRub ? Number(form.purchasePriceRub) : null,
        cnyRubRate: form.cnyRubRate ? Number(form.cnyRubRate) : null,
        // wbPrice, customerPrice, wbCommissionPct, drrPct, plannedRedemptionPct,
        // packagingCost, wbLogisticsCost — больше не редактируются в UI.
        // Алёна явно убрала расчёт маржи из скоупа. Поля остаются в БД для
        // исторических данных, но новые фасоны их не пишут.
        targetCostCny: form.targetCostCny ? Number(form.targetCostCny) : null,
        targetCostRub: form.targetCostRub ? Number(form.targetCostRub) : null,
        targetCostNote: form.targetCostNote || null,
        patternsDate: form.patternsDate || null,
        sampleDate: form.sampleDate || null,
        approvedDate: form.approvedDate || null,
        productionStartDate: form.productionStartDate || null,
        plannedLaunchMonth: form.plannedLaunchMonth ?? null,
      };
      const res = await fetch(`/api/models/${model.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const j = await res.json();
        setError(j?.error?.message ?? "Ошибка");
        return;
      }
      router.push(`/models/${model.id}`);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  // §4 UX-аудита: якоря-прогресс по секциям (закон «длинная форма с прогрессом»).
  const navSections = [
    { id: "mesec-main", title: "Основное", filled: form.name.trim().length > 0 },
    { id: "mesec-production", title: "Производство", filled: !!form.preferredFactoryId && !!form.sizeGridId },
    { id: "mesec-cost", title: "Себестоимость", filled: !!(form.purchasePriceRub || form.purchasePriceCny) },
    { id: "mesec-fabric", title: "Ткань", filled: !!(form.fabricName.trim() || form.fabricComposition.trim()) },
    { id: "mesec-photos", title: "Фото", filled: form.photoUrls.length > 0 },
    { id: "mesec-docs", title: "Документация", filled: form.patternsUrl.trim().length > 0 },
  ];

  return (
    <form id="model-edit-form" onSubmit={onSubmit} className="space-y-6">
      <FormProgressNav sections={navSections} />
      <Section id="mesec-main" title="Основное">
        <Field label="Название *" full>
          <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputCls} />
        </Field>
        <Field label="Бренд *">
          <select value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value as Brand })} className={inputCls}>
            {Object.entries(BRAND_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
        <Field label="Категория *">
          <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className={inputCls}>
            {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
          </select>
        </Field>
        <Field label="Тип разработки">
          <select value={form.developmentType} onChange={(e) => setForm({ ...form, developmentType: e.target.value as "OWN" | "REPEAT" })} className={inputCls}>
            <option value="OWN">Собственный дизайн</option>
            <option value="REPEAT">Повтор</option>
          </select>
        </Field>
        <Field label="Ответственный *">
          <select value={form.ownerId} onChange={(e) => setForm({ ...form, ownerId: e.target.value })} className={inputCls}>
            {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </Field>
      </Section>

      <Section id="mesec-production" title="Производство">
        <Field label="Страна *">
          <select value={form.countryOfOrigin} onChange={(e) => setForm({ ...form, countryOfOrigin: e.target.value })} className={inputCls}>
            <option>Россия</option>
            <option>Китай</option>
            <option>Кыргызстан</option>
          </select>
        </Field>
        <Field label="Фабрика (по умолчанию)">
          <select value={form.preferredFactoryId} onChange={(e) => setForm({ ...form, preferredFactoryId: e.target.value })} className={inputCls}>
            <option value="">—</option>
            <optgroup label={form.countryOfOrigin}>
              {factories.filter((f) => f.country === form.countryOfOrigin).map((f) => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </optgroup>
            {factories.some((f) => f.country !== form.countryOfOrigin) && (
              <optgroup label="Другие страны">
                {factories.filter((f) => f.country !== form.countryOfOrigin).map((f) => (
                  <option key={f.id} value={f.id}>{f.name} · {f.country}</option>
                ))}
              </optgroup>
            )}
          </select>
          {(() => {
            // П6: фабрика не из страны производства — подсветка, не тихая подмена.
            const sel = factories.find((f) => f.id === form.preferredFactoryId);
            return sel && sel.country && sel.country !== form.countryOfOrigin ? (
              <span className="mt-1 block text-xs font-medium text-amber-700 dark:text-amber-300">
                ⚠ Фабрика «{sel.name}» из {sel.country}, а страна производства — {form.countryOfOrigin}. Проверьте.
              </span>
            ) : null;
          })()}
          <span className="mt-1 block text-xs text-slate-500">
            Предлагается при создании заказов, в каждом заказе можно поменять.
          </span>
        </Field>
        <Field label="Размерная сетка">
          <SizeGridPicker
            value={form.sizeGridId}
            onChange={changeSizeGrid}
            grids={sizeGrids}
          />
        </Field>
      </Section>

      <Section id="mesec-cost" title="Себестоимость">
        <Field label="Цена за единицу" full>
          <div className="flex items-stretch gap-2">
            <input
              type="number"
              inputMode="decimal"
              step="0.01"
              value={form.purchasePriceRub || form.purchasePriceCny}
              onChange={(e) => {
                const v = e.target.value;
                // Какое поле сейчас активно — то и пишем, второе очищаем.
                if (form.purchasePriceCny && !form.purchasePriceRub) {
                  setForm({ ...form, purchasePriceCny: v, purchasePriceRub: "" });
                } else {
                  setForm({ ...form, purchasePriceRub: v, purchasePriceCny: "" });
                }
              }}
              className={`${inputCls} flex-1`}
              placeholder="например, 920"
            />
            <select
              value={form.purchasePriceCny ? "CNY" : "RUB"}
              onChange={(e) => {
                const cur = e.target.value;
                // Переключение валюты: переносим текущее число в другое поле.
                const num = form.purchasePriceRub || form.purchasePriceCny;
                if (cur === "CNY") {
                  // Переходим в юани — подставляем дефолтный курс, если ещё не задан.
                  setForm({
                    ...form,
                    purchasePriceCny: num,
                    purchasePriceRub: "",
                    cnyRubRate: form.cnyRubRate || String(DEFAULT_CNY_RUB_RATE),
                  });
                } else {
                  setForm({ ...form, purchasePriceRub: num, purchasePriceCny: "" });
                }
              }}
              className={inputCls}
              style={{ flexBasis: "5.5rem", flexGrow: 0 }}
            >
              <option value="RUB">₽</option>
              <option value="CNY">¥</option>
            </select>
          </div>
          <span className="mt-1 block text-xs text-slate-500">
            Закупочная цена у фабрики. При создании заказа автоматически подтянется в стоимость единицы (можно поправить под конкретный заказ).
          </span>
        </Field>

        {/* Курс ¥→₽ — виден только когда цена в юанях. Аудит п.8: раньше курс
            был зашит 13.5 и невидим, теперь его вводит человек и он хранится
            в фасоне. Пересчёт в ₽ показываем сразу. */}
        {form.purchasePriceCny ? (
          <Field label="Курс ¥→₽" full>
            <div className="flex items-stretch gap-2">
              <input
                type="number"
                inputMode="decimal"
                step="0.0001"
                value={form.cnyRubRate}
                onChange={(e) => setForm({ ...form, cnyRubRate: e.target.value })}
                className={`${inputCls} flex-1`}
                placeholder={String(DEFAULT_CNY_RUB_RATE)}
              />
            </div>
            <span className="mt-1 block text-xs text-slate-500">
              {(() => {
                const cny = Number(form.purchasePriceCny);
                const rate = Number(form.cnyRubRate);
                if (cny > 0 && rate > 0) {
                  return `≈ ${(cny * rate).toLocaleString("ru-RU", { maximumFractionDigits: 0 })} ₽ за единицу по этому курсу.`;
                }
                return `Дефолт ${DEFAULT_CNY_RUB_RATE}. Введите фактический курс — по нему считается себестоимость в ₽.`;
              })()}
            </span>
          </Field>
        ) : null}
      </Section>

      <Section id="mesec-fabric" title="Ткань (опционально)">
        <Field label="Название ткани">
          <input value={form.fabricName} onChange={(e) => setForm({ ...form, fabricName: e.target.value })} className={inputCls} placeholder="Диагональ" />
        </Field>
        <Field label="Состав">
          <input value={form.fabricComposition} onChange={(e) => setForm({ ...form, fabricComposition: e.target.value })} className={inputCls} placeholder="70% шерсть, 30% полиэстер" />
        </Field>
      </Section>

      {/* Маркировка «Честный знак» — свёрнутый необязательный блок.
          Состав и страна берутся из полей выше; здесь — только ТНВЭД,
          которого раньше не было ни в БД, ни в форме («поле-фантом» из аудита).
          Всё это уходит на вкладку «Честный знак» для копирования в Нацкаталог. */}
      <details className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
        <summary className="cursor-pointer text-sm font-semibold uppercase tracking-wide text-slate-500">
          Маркировка / ЧЗ (опционально)
        </summary>
        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
          <Field label="Код ТНВЭД ЕАЭС">
            <input
              value={form.tnvedCode}
              onChange={(e) => setForm({ ...form, tnvedCode: e.target.value })}
              className={inputCls}
              placeholder="6201400000"
            />
            <span className="mt-1 block text-xs text-slate-500">
              10-значный код ТН ВЭД для карточки в Национальном каталоге «Честный знак».
              Общий для всех цветов фасона. Состав и страна берутся из полей выше.
            </span>
          </Field>
        </div>
      </details>

      <Section id="mesec-photos" title="Фото фасона">
        <div className="md:col-span-2">
          <DropzonePhotos value={form.photoUrls} onChange={(urls) => setForm({ ...form, photoUrls: urls })} />
        </div>
      </Section>

      <Section id="mesec-docs" title="Документация (Google Drive / Яндекс.Диск)">
        <Field label="Ссылка на папку с материалами" full>
          <input
            type="url"
            value={form.patternsUrl}
            onChange={(e) => setForm({ ...form, patternsUrl: e.target.value })}
            className={inputCls}
            placeholder="https://drive.google.com/… или https://disk.yandex.ru/…"
          />
          <span className="mt-1 block text-xs text-slate-500">
            Одна общая ссылка на папку, где лежат лекала, тех. пакет, фото образцов и всё остальное.
          </span>
        </Field>
      </Section>

      {/* Секция «Этапы разработки» убрана: даты этапов фасона теперь
          отслеживаются через статус на канбане (колонки Идея → Образец →
          Идеал. образец → Размерная сетка). Поля patternsDate/sampleDate/
          approvedDate/productionStartDate/plannedLaunchMonth остаются в БД
          и в payload (значения сохраняются как есть, без UI). */}

      {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-400/10 dark:text-red-300">{error}</div>}
    </form>
  );
}

const inputCls = "min-h-[44px] w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-900 focus:ring-1 focus:ring-slate-900";

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
