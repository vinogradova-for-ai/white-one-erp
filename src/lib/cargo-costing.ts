/**
 * Раскидка стоимости карго по весу содержимого (Алёна, прожарка 15-16.07.2026).
 *
 * Правила:
 *  - Раскидываем ВЕСЬ итог накладной (фрахт + страховка + упаковка груза) —
 *    всё это цена доставки партии.
 *  - Строка содержимого = партия заказа ИЛИ заказ упаковки. Вес строки
 *    считается сам: штуки × вес штуки из справочника (цветомодель/упаковка),
 *    ручная поправка weightKgOverride побеждает.
 *  - Доля строки = вес строки ÷ сумма весов строк. Пропорционально доле
 *    строка получает рубли, дальше ₽/шт = рубли строки ÷ штуки строки.
 *  - Курс: до оплаты — курс ЦБ на сегодня («предварительно»), после оплаты —
 *    зафиксированный usdRubRate (фиксация в момент оплаты, курс того дня).
 *  - Строки без веса (нет веса штуки в справочнике и нет поправки) в раскидке
 *    не участвуют и честно подсвечиваются (linesWithoutWeight): их доля
 *    неизвестна, поэтому раскидка считается НЕПОЛНОЙ, пока веса не заполнены —
 *    UI обязан показывать предупреждение, а не молча делить всё между
 *    взвешенными строками как будто так и надо.
 */

export type CargoLineInput = {
  key: string;                       // id партии/заказа упаковки
  kind: "batch" | "packaging";
  label: string;                     // подпись для UI («ORD-2026-0048 · партия 1»)
  qty: number;                       // штук в строке
  autoWeightKg: number | null;       // штуки × вес штуки; null = веса штуки нет
  overrideWeightKg: number | null;   // ручная поправка (побеждает)
};

export type CargoLineAllocation = CargoLineInput & {
  effectiveWeightKg: number | null;  // override ?? auto
  shareOfWeight: number | null;      // 0..1
  amountRub: number | null;          // доля строки в рублях
  perUnitRub: number | null;         // ₽/шт
};

export type CargoAllocation = {
  lines: CargoLineAllocation[];
  totalUsd: number;                  // итог накладной
  rate: number;                      // применённый курс USD→RUB
  rateIsFixed: boolean;              // true = курс оплаты, false = предварительный
  totalRub: number;
  allocatedRub: number;              // сколько реально раскидано (без строк-без-веса)
  unallocatedRub: number;            // доля строк без веса — «нераспределено»
  sumLinesWeightKg: number;          // сумма весов строк
  waybillWeightKg: number | null;    // вес брутто из накладной
  weightMismatchKg: number | null;   // |сумма строк − накладная|, null если нет брутто
  linesWithoutWeight: string[];      // key строк без веса (подсветка)
};

export type CargoMoney = {
  freightUsd?: number | null;
  insuranceUsd?: number | null;
  packingFeeUsd?: number | null;
  amountUsdt?: number | null;        // итог, если компоненты не разнесены
};

/** Итог накладной: сумма компонентов; если ни одного нет — amountUsdt. */
export function cargoTotalUsd(m: CargoMoney): number {
  const parts = [m.freightUsd, m.insuranceUsd, m.packingFeeUsd].filter(
    (v): v is number => v != null && Number.isFinite(v),
  );
  if (parts.length > 0) return round2(parts.reduce((a, b) => a + b, 0));
  return m.amountUsdt != null && Number.isFinite(m.amountUsdt) ? round2(m.amountUsdt) : 0;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function computeCargoAllocation(opts: {
  money: CargoMoney;
  rate: number;
  rateIsFixed: boolean;
  waybillWeightKg: number | null;
  lines: CargoLineInput[];
}): CargoAllocation {
  const totalUsd = cargoTotalUsd(opts.money);
  const totalRub = round2(totalUsd * opts.rate);

  const withWeight = opts.lines.map((l) => {
    let effectiveWeightKg =
      l.overrideWeightKg != null ? l.overrideWeightKg : l.autoWeightKg;
    // Единственная строка в карго без веса штуки: её вес = вес всей накладной
    // (он известен с накладной) — раскидка честно работает без справочника.
    if (
      effectiveWeightKg == null &&
      opts.lines.length === 1 &&
      opts.waybillWeightKg != null &&
      opts.waybillWeightKg > 0
    ) {
      effectiveWeightKg = opts.waybillWeightKg;
    }
    return { ...l, effectiveWeightKg };
  });

  const sumLinesWeightKg = round2(
    withWeight.reduce((a, l) => a + (l.effectiveWeightKg ?? 0), 0),
  );

  const lines: CargoLineAllocation[] = withWeight.map((l) => {
    if (l.effectiveWeightKg == null || l.effectiveWeightKg <= 0 || sumLinesWeightKg <= 0) {
      return { ...l, shareOfWeight: null, amountRub: null, perUnitRub: null };
    }
    const share = l.effectiveWeightKg / sumLinesWeightKg;
    const amountRub = round2(totalRub * share);
    const perUnitRub = l.qty > 0 ? round2(amountRub / l.qty) : null;
    return { ...l, shareOfWeight: share, amountRub, perUnitRub };
  });

  const allocatedRub = round2(
    lines.reduce((a, l) => a + (l.amountRub ?? 0), 0),
  );

  return {
    lines,
    totalUsd,
    rate: opts.rate,
    rateIsFixed: opts.rateIsFixed,
    totalRub,
    allocatedRub,
    unallocatedRub: round2(totalRub - allocatedRub),
    sumLinesWeightKg,
    waybillWeightKg: opts.waybillWeightKg,
    weightMismatchKg:
      opts.waybillWeightKg != null
        ? round2(Math.abs(sumLinesWeightKg - opts.waybillWeightKg))
        : null,
    linesWithoutWeight: lines
      .filter((l) => l.effectiveWeightKg == null || l.effectiveWeightKg <= 0)
      .map((l) => l.key),
  };
}
