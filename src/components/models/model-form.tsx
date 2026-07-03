"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { CATEGORIES, BRAND_LABELS, DEFAULT_CNY_RUB_RATE } from "@/lib/constants";
import { isLatinCategory, buildLatinBase, styleCandidates, colorCode, PREFIX_CYR, TYPE_LAT, translit, findBannedBrand } from "@/lib/artikul";
import { PackagingType } from "@prisma/client";
import { DropzonePhotos } from "@/components/common/dropzone-photos";
import { SizeGridPicker } from "@/components/common/size-grid-picker";
import { PackagingPicker } from "@/components/common/packaging-picker";
import { parseApiError, type ApiErrorResult } from "@/lib/api-error";
import { FormErrorBanner, FieldError } from "@/components/common/form-errors";

type Option = { id: string; name: string; country?: string };
type SizeGridOption = { id: string; name: string; sizes: string[] };
type PackagingOption = { id: string; name: string; type: PackagingType; photoUrl?: string | null };

type PackagingPick = { packagingItemId: string };

// Форма создания фасона. Минимум, что нужно на момент заведения:
// название, бренд, категория, ткань, страна/фабрика, размерная сетка, документы, фото.
// Экономика (закупка, WB-цена, комиссия и т.п.) — заполняется на странице редактирования,
// когда уже согласовано с фабрикой.
// Размерная пропорция тоже не здесь — штуки по размерам раскладываются только при создании заказа.
export function ModelForm({
  users,
  factories,
  sizeGrids,
  packagingItems,
  defaultOwnerId,
  defaultTargetCostCny = "",
  defaultTargetCostRub = "",
}: {
  users: Option[];
  factories: Option[];
  sizeGrids: SizeGridOption[];
  packagingItems: PackagingOption[];
  defaultOwnerId?: string | null;
  defaultTargetCostCny?: string;
  defaultTargetCostRub?: string;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [apiErr, setApiErr] = useState<ApiErrorResult | null>(null);
  // Метка артикула: предлагаем из названия; «Перегенерировать» перебирает варианты;
  // как только пользователь правит руками — фиксируем его ввод (touched).
  const [artikulStyleTouched, setArtikulStyleTouched] = useState(false);
  const [styleIdx, setStyleIdx] = useState(0);
  // Реальный следующий номер для пальто/полупальто (П_052) — тянем с сервера для превью.
  const [russiaBase, setRussiaBase] = useState<string | null>(null);
  const [latinNum, setLatinNum] = useState<number | null>(null);

  const [form, setForm] = useState({
    name: "",
    brand: "WHITE_ONE" as "WHITE_ONE" | "SERDCEBIENIE",
    category: "Пальто",
    subcategory: "",
    artikulStyle: "", // метка для латинского артикула (kimono/halter/atlas); пусто = из названия
    countryOfOrigin: "Китай",
    preferredFactoryId: factories.find((f) => f.country === "Китай")?.id ?? "",
    sizeGridId: sizeGrids[0]?.id ?? "",
    developmentType: "OWN" as "OWN" | "REPEAT",
    isRepeat: false,
    fabricName: "",
    fabricComposition: "",
    fabricConsumption: "",
    fabricPricePerMeter: "",
    fabricCurrency: "CNY" as "RUB" | "CNY",
    // Себестоимость изделия (закуп у фабрики)
    purchaseCurrency: "CNY" as "RUB" | "CNY",
    purchasePriceRub: "",
    purchasePriceCny: "",
    cnyRubRate: "",
    patternsUrl: "",
    photoUrls: [] as string[],
    ownerId: (defaultOwnerId && users.some((u) => u.id === defaultOwnerId)) ? defaultOwnerId : (users[0]?.id ?? ""),
    notes: "",
    hsCode: "",
    // Себестоимость теперь хранится в purchasePriceRub/Cny — одно из двух полей
    // (по выбору пользователя). targetCost* оставлены legacy, не используются в UI.
    targetCostCny: defaultTargetCostCny,
    targetCostRub: defaultTargetCostRub,
    targetCostNote: "",
    packagingPicks: [] as PackagingPick[],
  });

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    if (key === "countryOfOrigin") {
      const country = value as string;
      // П6 UX-аудита: при смене страны фабрику НЕ подменяем молча —
      // несоответствие подсвечивается под селектом фабрики.
      setForm((f) => ({ ...f, fabricCurrency: country === "Россия" ? "RUB" : "CNY" }));
    }
  }

  // Фабрика выбрана, но не из страны производства — честная подсветка вместо тихой подмены.
  const selectedFactory = factories.find((f) => f.id === form.preferredFactoryId);
  const factoryCountryMismatch =
    !!selectedFactory && !!selectedFactory.country && selectedFactory.country !== form.countryOfOrigin;
  const factoriesInCountry = factories.filter((f) => f.country === form.countryOfOrigin);
  const factoriesElsewhere = factories.filter((f) => f.country !== form.countryOfOrigin);

  // Варианты метки артикула из названия+особенностей и текущая выбранная метка.
  const styleVariants = styleCandidates(form.name, form.category, form.subcategory);
  const autoStyle = styleVariants.length ? styleVariants[styleIdx % styleVariants.length] : "";
  const styleUsed = artikulStyleTouched ? form.artikulStyle.trim() : autoStyle;
  function regenerateStyle() {
    setArtikulStyleTouched(false); // вернуться к авто-предложениям
    setStyleIdx((i) => (styleVariants.length ? (i + 1) % styleVariants.length : 0));
  }

  // Тянем реальный следующий номер для превью: кириллица → база П_052, латиница → номер (8 → trs08…).
  useEffect(() => {
    let cancelled = false;
    setRussiaBase(null);
    setLatinNum(null);
    fetch(`/api/models/next-artikul?category=${encodeURIComponent(form.category)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled || !d) return;
        if (d.base) setRussiaBase(d.base);
        if (typeof d.number === "number") setLatinNum(d.number);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [form.category]);

  // --- Комплект упаковки ---
  function addPackagingPick() {
    setForm((f) => ({
      ...f,
      packagingPicks: [...f.packagingPicks, { packagingItemId: "" }],
    }));
  }
  function removePackagingPick(idx: number) {
    setForm((f) => ({ ...f, packagingPicks: f.packagingPicks.filter((_, i) => i !== idx) }));
  }
  function updatePackagingPick(idx: number, patch: Partial<PackagingPick>) {
    setForm((f) => ({
      ...f,
      packagingPicks: f.packagingPicks.map((p, i) => (i === idx ? { ...p, ...patch } : p)),
    }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setApiErr(null);
    try {
      const payload = {
        name: form.name,
        brand: form.brand,
        category: form.category,
        subcategory: form.subcategory || null,
        artikulStyle: styleUsed || null, // метка для артикула (латиница)
        countryOfOrigin: form.countryOfOrigin,
        preferredFactoryId: form.preferredFactoryId || null,
        sizeGridId: form.sizeGridId || null,
        developmentType: form.developmentType,
        isRepeat: form.isRepeat,
        fabricName: form.fabricName || null,
        fabricComposition: form.fabricComposition || null,
        fabricPricePerMeter: form.fabricPricePerMeter ? Number(form.fabricPricePerMeter) : null,
        fabricCurrency: form.fabricPricePerMeter ? form.fabricCurrency : null,
        // Курс ¥→₽ сохраняем, если цена закупки ИЛИ цена ткани в юанях.
        // Раньше учитывалась только ткань (fabricCurrency), из-за чего курс к
        // закупочной цене в ¥ не доезжал в БД и себестоимость не считалась (аудит п.8).
        cnyRubRate:
          (form.purchasePriceCny || form.fabricCurrency === "CNY") && form.cnyRubRate
            ? Number(form.cnyRubRate)
            : null,
        patternsUrl: form.patternsUrl || null,
        photoUrls: form.photoUrls,
        ownerId: form.ownerId,
        notes: form.notes || null,
        hsCode: form.hsCode || null,
        targetCostCny: form.targetCostCny ? Number(form.targetCostCny) : null,
        targetCostRub: form.targetCostRub ? Number(form.targetCostRub) : null,
        targetCostNote: form.targetCostNote || null,
        purchasePriceRub: form.purchasePriceRub ? Number(form.purchasePriceRub) : null,
        purchasePriceCny: form.purchasePriceCny ? Number(form.purchasePriceCny) : null,
      };
      const res = await fetch("/api/models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        setApiErr(await parseApiError(res));
        return;
      }
      const model = await res.json();

      // Сохраним комплект упаковки, если выбран
      const validPicks = form.packagingPicks.filter((p) => p.packagingItemId);
      for (const p of validPicks) {
        await fetch(`/api/models/${model.id}/packaging`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            packagingItemId: p.packagingItemId,
            quantityPerUnit: 1,
          }),
        });
      }

      router.push(`/models/${model.id}`);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  const usedPackagingIds = new Set(form.packagingPicks.map((p) => p.packagingItemId).filter(Boolean));

  // --- Превью артикула (vendorCode на WB) ---
  // Алфавит решает КАТЕГОРИЯ: латиница для всего, кроме пальто/полупальто.
  const latin = isLatinCategory(form.category);
  const cyrBase = russiaBase ?? `${PREFIX_CYR[form.category] ?? "?"}_…`;
  // Латиница: номер двухзначный из БД. Пока не подгрузился — показываем плейсхолдер «NN».
  const latBase = latinNum != null
    ? buildLatinBase(form.category, latinNum, styleUsed)
    : `${TYPE_LAT[form.category] ?? "?"}NN${styleUsed ? "_" + translit(styleUsed) : ""}`;
  const basePreview = latin ? latBase : cyrBase;
  const skuExample = latin ? `${latBase}_${colorCode("шоколад", true)}` : `${cyrBase}_шоколад`;
  // Чужой бренд в артикуле запрещён (товарный знак, WB блокирует).
  const bannedBrand = findBannedBrand(styleUsed) || findBannedBrand(form.name);

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <Section title="Основное">
        <Field label="Название фасона *" full>
          <input required value={form.name} onChange={(e) => update("name", e.target.value)} className={inputCls} placeholder="Пальто Классика Двубортное Миди" />
          <FieldError error={apiErr} field="name" />
        </Field>
        <Field label="Бренд *">
          <select value={form.brand} onChange={(e) => update("brand", e.target.value as "WHITE_ONE" | "SERDCEBIENIE")} className={inputCls}>
            {Object.entries(BRAND_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
        <Field label="Категория *">
          <select value={form.category} onChange={(e) => update("category", e.target.value)} className={inputCls}>
            {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
          </select>
        </Field>
        <Field label="Тип разработки">
          <select value={form.developmentType} onChange={(e) => update("developmentType", e.target.value as "OWN" | "REPEAT")} className={inputCls}>
            <option value="OWN">Собственный дизайн</option>
            <option value="REPEAT">Повтор</option>
          </select>
        </Field>
        <Field label="Ответственный *">
          <select value={form.ownerId} onChange={(e) => update("ownerId", e.target.value)} className={inputCls}>
            {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </Field>
      </Section>

      <Section title="Производство">
        <Field label="Страна *">
          <select value={form.countryOfOrigin} onChange={(e) => update("countryOfOrigin", e.target.value)} className={inputCls}>
            <option>Россия</option>
            <option>Китай</option>
            <option>Кыргызстан</option>
          </select>
        </Field>
        <Field label="Фабрика (по умолчанию)">
          <select value={form.preferredFactoryId} onChange={(e) => update("preferredFactoryId", e.target.value)} className={inputCls}>
            <option value="">—</option>
            <optgroup label={form.countryOfOrigin}>
              {factoriesInCountry.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </optgroup>
            {factoriesElsewhere.length > 0 && (
              <optgroup label="Другие страны">
                {factoriesElsewhere.map((f) => <option key={f.id} value={f.id}>{f.name} · {f.country}</option>)}
              </optgroup>
            )}
          </select>
          {factoryCountryMismatch && (
            <p className="mt-1 text-xs font-medium text-amber-700 dark:text-amber-300">
              ⚠ Фабрика «{selectedFactory!.name}» из {selectedFactory!.country}, а страна производства — {form.countryOfOrigin}. Проверьте.
            </p>
          )}
        </Field>
        <Field label="Размерная сетка">
          <SizeGridPicker
            value={form.sizeGridId}
            onChange={(id) => update("sizeGridId", id)}
            grids={sizeGrids}
          />
          <span className="mt-1 block text-xs text-slate-500">
            Штуки по размерам раскладываются позже, при создании заказа.
          </span>
        </Field>
      </Section>

      <Section title="Артикул (vendorCode на WB)">
        {latin && (
          <Field label="Метка фасона (англ.)">
            <div className="flex items-stretch gap-2">
              <input
                value={styleUsed}
                onChange={(e) => { setArtikulStyleTouched(true); update("artikulStyle", e.target.value); }}
                className={`${inputCls} flex-1`}
                placeholder="kimono / halter / atlas"
              />
              <button
                type="button"
                onClick={regenerateStyle}
                disabled={styleVariants.length < 2}
                title="Предложить другой вариант метки из названия"
                className="shrink-0 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-40"
              >
                🔄 Перегенерировать
              </button>
            </div>
            <span className="mt-1 block text-xs text-slate-500">
              {styleVariants.length > 1 && !artikulStyleTouched
                ? `Предложено из названия (вариант ${(styleIdx % styleVariants.length) + 1} из ${styleVariants.length}). Не нравится — «Перегенерировать» или впишите своё.`
                : "Вторая часть артикула. Предлагаем из названия — можно поправить руками."}
            </span>
          </Field>
        )}
        <Field label="Превью артикула" full={!latin}>
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-sm text-slate-800">
            {basePreview}
            <span className="text-slate-400">_цвет</span>
          </div>
          <span className="mt-1 block text-xs text-slate-500">
            {latin ? (
              <>Латиница (словами). Пример: <b>{skuExample}</b></>
            ) : (
              <>Кириллица-номер (пальто/полупальто). Номер присвоится при сохранении. Пример: <b>{skuExample}</b></>
            )}
          </span>
          {bannedBrand && (
            <span className="mt-2 block rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-400/20 dark:bg-red-400/10 dark:text-red-300">
              ⛔ В артикуле нельзя использовать чужой бренд: <b>«{bannedBrand}»</b>. Поменяйте метку или название — иначе WB заблокирует карточку.
            </span>
          )}
        </Field>
      </Section>

      <Section title="Ткань (опционально)">
        <Field label="Название ткани">
          <input value={form.fabricName} onChange={(e) => update("fabricName", e.target.value)} className={inputCls} placeholder="Диагональ" />
        </Field>
        <Field label="Состав">
          <input value={form.fabricComposition} onChange={(e) => update("fabricComposition", e.target.value)} className={inputCls} placeholder="70% шерсть, 30% полиэстер" />
        </Field>
      </Section>

      <Section title="Себестоимость">
        <Field label="Цена за единицу" full>
          <div className="flex items-stretch gap-2">
            <input
              type="number"
              inputMode="decimal"
              step="0.01"
              value={form.purchasePriceRub || form.purchasePriceCny}
              onChange={(e) => {
                const v = e.target.value;
                if (form.purchasePriceCny && !form.purchasePriceRub) {
                  setForm((f) => ({ ...f, purchasePriceCny: v, purchasePriceRub: "" }));
                } else {
                  setForm((f) => ({ ...f, purchasePriceRub: v, purchasePriceCny: "" }));
                }
              }}
              className={`${inputCls} flex-1`}
              placeholder="например, 920"
            />
            <select
              value={form.purchasePriceCny ? "CNY" : "RUB"}
              onChange={(e) => {
                const cur = e.target.value;
                const num = form.purchasePriceRub || form.purchasePriceCny;
                if (cur === "CNY")
                  setForm((f) => ({
                    ...f,
                    purchasePriceCny: num,
                    purchasePriceRub: "",
                    cnyRubRate: f.cnyRubRate || String(DEFAULT_CNY_RUB_RATE),
                  }));
                else setForm((f) => ({ ...f, purchasePriceRub: num, purchasePriceCny: "" }));
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

        {/* Курс ¥→₽ — виден только когда цена в юанях (аудит п.8). */}
        {form.purchasePriceCny ? (
          <Field label="Курс ¥→₽" full>
            <input
              type="number"
              inputMode="decimal"
              step="0.0001"
              value={form.cnyRubRate}
              onChange={(e) => update("cnyRubRate", e.target.value)}
              className={inputCls}
              placeholder={String(DEFAULT_CNY_RUB_RATE)}
            />
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

      <Section title="Фото фасона">
        <div className="md:col-span-2">
          <DropzonePhotos value={form.photoUrls} onChange={(urls) => setForm((f) => ({ ...f, photoUrls: urls }))} />
          <p className="mt-1 text-xs text-slate-500">
            Фото можно добавить позже. Но для перехода фасона в статус «Образец» минимум одно фото обязательно.
          </p>
        </div>
      </Section>

      <Section title="Документация (Google Drive / Яндекс.Диск)">
        <Field label="Ссылка на папку с материалами" full>
          <input
            type="url"
            value={form.patternsUrl}
            onChange={(e) => update("patternsUrl", e.target.value)}
            className={inputCls}
            placeholder="https://drive.google.com/… или https://disk.yandex.ru/…"
          />
          <span className="mt-1 block text-xs text-slate-500">
            Одна общая ссылка на папку, где лежат лекала, тех. пакет, фото образцов и всё остальное.
          </span>
        </Field>
      </Section>

      <Section title="Комплект упаковки">
        <div className="md:col-span-2 space-y-2">
          {form.packagingPicks.length > 0 ? (
            <div className="space-y-2">
              {form.packagingPicks.map((p, idx) => {
                const options = packagingItems.filter(
                  (opt) => opt.id === p.packagingItemId || !usedPackagingIds.has(opt.id),
                );
                return (
                  <div key={idx} className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 sm:flex-row">
                    <div className="flex-1">
                      <PackagingPicker
                        value={p.packagingItemId}
                        options={options}
                        onChange={(id) => updatePackagingPick(idx, { packagingItemId: id })}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => removePackagingPick(idx)}
                      className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                    >
                      Убрать
                    </button>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-xs text-slate-500">
              Пока не выбрано. Добавьте бирки, размерники, полибэги и т.п. — этот комплект автоматически применится при создании заказа на любой цвет этого фасона.
            </p>
          )}
          <button
            type="button"
            onClick={addPackagingPick}
            disabled={packagingItems.length === 0}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            + Добавить упаковку
          </button>
          {packagingItems.length === 0 && (
            <p className="text-xs text-slate-400">
              Справочник упаковки пуст — сначала создайте карточки в разделе «Упаковка».
            </p>
          )}
        </div>
      </Section>

      <FormErrorBanner error={apiErr} ignoreFields={["name"]} />

      <div className="pb-safe-4 sticky bottom-16 z-30 -mx-4 flex gap-3 border-t border-slate-200 bg-white px-4 pt-4 md:bottom-0 md:mx-0 md:flex-wrap md:justify-end md:px-0">
        <button type="button" onClick={() => router.back()} className="flex h-11 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 text-sm text-slate-700">
          Отмена
        </button>
        <button type="submit" disabled={saving || !!bannedBrand} className="flex h-11 flex-1 items-center justify-center rounded-lg bg-slate-900 px-4 text-sm font-medium text-white disabled:opacity-50 md:flex-none">
          {saving ? "Сохранение…" : bannedBrand ? "Уберите чужой бренд" : "Создать фасон"}
        </button>
      </div>
    </form>
  );
}

const inputCls = "min-h-[44px] w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-900 focus:ring-1 focus:ring-slate-900";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="space-y-3">
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
