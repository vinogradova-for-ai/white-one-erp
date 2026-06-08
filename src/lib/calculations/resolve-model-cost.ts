/**
 * Единая логика подтяга «эффективной себестоимости» фасона.
 *
 * Источник в порядке приоритета (ручной ввод важнее расчёта):
 *   1) purchasePriceRub                    — точная закупка в ₽
 *   2) purchasePriceCny × cnyRubRate       — точная закупка в ¥
 *   3) fullCost                            — legacy расчёт со всеми составляющими
 *   4) targetCostRub                       — legacy «Таргет» в ₽
 *   5) targetCostCny × cnyRubRate          — legacy «Таргет» в ¥
 *
 * Используется одинаково в трёх местах:
 *   - страница заказа (display)
 *   - форма создания заказа (autofill)
 *   - бэкфилл линий (snapshot в БД)
 */
type Numeric = { toString(): string } | number | string | null | undefined;

function n(v: Numeric): number | null {
  if (v === null || v === undefined || v === "") return null;
  const x = typeof v === "number" ? v : Number(v.toString());
  return Number.isFinite(x) ? x : null;
}

export type ModelCostInput = {
  fullCost?: Numeric;
  purchasePriceRub?: Numeric;
  purchasePriceCny?: Numeric;
  cnyRubRate?: Numeric;
  targetCostRub?: Numeric;
  targetCostCny?: Numeric;
};

export function resolveModelCost(m: ModelCostInput): number | null {
  const rub = n(m.purchasePriceRub);
  if (rub != null) return rub;

  // Курс ¥→₽ должен быть положительным: 0 или отрицательный курс — ошибка ввода,
  // а не «бесплатно». При невалидном курсе ¥-источники пропускаем (откат дальше).
  const rateRaw = n(m.cnyRubRate);
  const rate = rateRaw != null && rateRaw > 0 ? rateRaw : null;

  const cny = n(m.purchasePriceCny);
  if (cny != null && rate != null) return cny * rate;

  const full = n(m.fullCost);
  if (full != null) return full;

  const tRub = n(m.targetCostRub);
  if (tRub != null) return tRub;

  const tCny = n(m.targetCostCny);
  if (tCny != null && rate != null) return tCny * rate;

  return null;
}

/**
 * Эффективная цена единицы для ЗАКАЗА: ручной override (стоимость единицы,
 * введённая в форме заказа) важнее всего; иначе — resolveModelCost(фасон).
 *
 * ВАЖНО: этим значением надо считать И snapshotFullCost (что кладём в БД),
 * И batchCost (сумму партии) — из ОДНОГО числа. Раньше snapshot брал override,
 * а batchCost шёл через resolveModelCost, который игнорировал override
 * (отдавал purchasePriceRub) → сумма заказа в БД расходилась с показанной.
 */
export function effectiveOrderUnitCost(
  m: ModelCostInput,
  override?: Numeric,
): number | null {
  const o = n(override);
  if (o != null) return o;
  return resolveModelCost(m);
}
