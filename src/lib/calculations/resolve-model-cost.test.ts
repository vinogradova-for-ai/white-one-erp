import { describe, it, expect } from "vitest";
import { Prisma } from "@prisma/client";
import { resolveModelCost } from "@/lib/calculations/resolve-model-cost";

/**
 * Regression-набор для resolveModelCost.
 *
 * Фиксирует ТЕКУЩЕЕ поведение единой логики «эффективной себестоимости»:
 *   приоритет purchasePriceRub > purchasePriceCny*rate > fullCost
 *            > targetCostRub > targetCostCny*rate > null.
 *
 * Деньги. Любой регресс здесь = неправильная цена в заказе / снапшоте БД.
 */
describe("resolveModelCost — приоритет источников", () => {
  it("берёт purchasePriceRub в первую очередь, игнорируя все остальные поля", () => {
    expect(
      resolveModelCost({
        purchasePriceRub: 1200,
        purchasePriceCny: 999,
        cnyRubRate: 12,
        fullCost: 888,
        targetCostRub: 777,
        targetCostCny: 666,
      }),
    ).toBe(1200);
  });

  it("при отсутствии purchasePriceRub пересчитывает закупку в ¥ по курсу", () => {
    expect(resolveModelCost({ purchasePriceCny: 100, cnyRubRate: 12 })).toBe(1200);
  });

  it("¥-закупка важнее fullCost / targetCost", () => {
    expect(
      resolveModelCost({
        purchasePriceCny: 100,
        cnyRubRate: 12,
        fullCost: 5000,
        targetCostRub: 6000,
      }),
    ).toBe(1200);
  });

  it("откатывается на fullCost (legacy), когда нет точной закупки", () => {
    expect(resolveModelCost({ fullCost: 850 })).toBe(850);
  });

  it("fullCost важнее targetCostRub и targetCostCny", () => {
    expect(
      resolveModelCost({
        fullCost: 850,
        targetCostRub: 700,
        targetCostCny: 50,
        cnyRubRate: 12,
      }),
    ).toBe(850);
  });

  it("откатывается на targetCostRub, когда нет закупки и fullCost", () => {
    expect(resolveModelCost({ targetCostRub: 700 })).toBe(700);
  });

  it("targetCostRub важнее targetCostCny", () => {
    expect(
      resolveModelCost({
        targetCostRub: 700,
        targetCostCny: 50,
        cnyRubRate: 12,
      }),
    ).toBe(700);
  });

  it("самый последний приоритет — targetCostCny × курс", () => {
    expect(resolveModelCost({ targetCostCny: 50, cnyRubRate: 12 })).toBe(600);
  });

  it("возвращает null, когда нет ни одного источника", () => {
    expect(resolveModelCost({})).toBeNull();
  });
});

describe("resolveModelCost — курс ¥ обязателен для ¥-источников", () => {
  it("purchasePriceCny без курса пропускается и проваливается дальше (на fullCost)", () => {
    expect(resolveModelCost({ purchasePriceCny: 100, fullCost: 333 })).toBe(333);
  });

  it("purchasePriceCny без курса и без других источников → null", () => {
    expect(resolveModelCost({ purchasePriceCny: 100 })).toBeNull();
  });

  it("курс без ¥-закупки не мешает — берётся следующий источник", () => {
    expect(resolveModelCost({ cnyRubRate: 12, fullCost: 333 })).toBe(333);
  });

  it("targetCostCny без курса пропускается → null", () => {
    expect(resolveModelCost({ targetCostCny: 50 })).toBeNull();
  });

  it("один и тот же rate применяется и к purchasePriceCny, и к targetCostCny (общий курс)", () => {
    // purchasePriceCny отсутствует → доходим до targetCostCny с тем же rate
    expect(resolveModelCost({ targetCostCny: 50, cnyRubRate: 10 })).toBe(500);
  });
});

describe("resolveModelCost — null / undefined / пустая строка", () => {
  it("null-значения трактуются как отсутствующие", () => {
    expect(
      resolveModelCost({
        purchasePriceRub: null,
        purchasePriceCny: null,
        cnyRubRate: null,
        fullCost: null,
        targetCostRub: null,
        targetCostCny: null,
      }),
    ).toBeNull();
  });

  it("undefined-значения трактуются как отсутствующие", () => {
    expect(
      resolveModelCost({
        purchasePriceRub: undefined,
        fullCost: undefined,
      }),
    ).toBeNull();
  });

  it("пустая строка трактуется как отсутствующее значение", () => {
    expect(resolveModelCost({ purchasePriceRub: "", fullCost: "" })).toBeNull();
  });

  it("пустая строка в purchasePriceRub → проваливается на fullCost", () => {
    expect(resolveModelCost({ purchasePriceRub: "", fullCost: 500 })).toBe(500);
  });

  it("null в purchasePriceRub → проваливается на ¥-закупку", () => {
    expect(
      resolveModelCost({ purchasePriceRub: null, purchasePriceCny: 100, cnyRubRate: 5 }),
    ).toBe(500);
  });

  it("пустая строка в курсе блокирует ¥-источник как отсутствие курса", () => {
    expect(
      resolveModelCost({ purchasePriceCny: 100, cnyRubRate: "", fullCost: 333 }),
    ).toBe(333);
  });
});

describe("resolveModelCost — ноль и граничные числа", () => {
  it("purchasePriceRub === 0 возвращается как 0 (ноль — валидное значение, != null)", () => {
    expect(resolveModelCost({ purchasePriceRub: 0, fullCost: 999 })).toBe(0);
  });

  it("purchasePriceCny === 0 при наличии курса даёт 0 и не проваливается дальше", () => {
    expect(resolveModelCost({ purchasePriceCny: 0, cnyRubRate: 12, fullCost: 999 })).toBe(0);
  });

  it("курс === 0 НЕвалиден: ¥-источник пропускается, откат на fullCost", () => {
    // Нулевой курс — ошибка ввода, а не «бесплатно». Не обнуляем себестоимость.
    expect(resolveModelCost({ purchasePriceCny: 100, cnyRubRate: 0, fullCost: 999 })).toBe(999);
  });

  it("курс отрицательный → ¥-источник пропускается, откат дальше", () => {
    expect(resolveModelCost({ purchasePriceCny: 100, cnyRubRate: -5, fullCost: 777 })).toBe(777);
  });

  it("fullCost === 0 возвращается как 0", () => {
    expect(resolveModelCost({ fullCost: 0, targetCostRub: 700 })).toBe(0);
  });

  it("targetCostRub === 0 возвращается как 0", () => {
    expect(resolveModelCost({ targetCostRub: 0 })).toBe(0);
  });

  it("отрицательная закупка возвращается как есть (валидация не предусмотрена)", () => {
    expect(resolveModelCost({ purchasePriceRub: -100 })).toBe(-100);
  });
});

describe("resolveModelCost — строковые числа и парсинг", () => {
  it("строковое число в purchasePriceRub парсится", () => {
    expect(resolveModelCost({ purchasePriceRub: "1200" })).toBe(1200);
  });

  it("строковые ¥ и курс перемножаются", () => {
    expect(resolveModelCost({ purchasePriceCny: "100", cnyRubRate: "12.5" })).toBe(1250);
  });

  it("дробное строковое число парсится", () => {
    expect(resolveModelCost({ fullCost: "850.75" })).toBe(850.75);
  });

  it("нечисловая строка → не finite → источник пропускается (фоллбэк дальше)", () => {
    expect(resolveModelCost({ purchasePriceRub: "abc", fullCost: 500 })).toBe(500);
  });

  it("нечисловая строка без фоллбэка → null", () => {
    expect(resolveModelCost({ purchasePriceRub: "abc" })).toBeNull();
  });

  it("строка с пробелами вокруг числа парсится через Number()", () => {
    // Number("  120  ") === 120
    expect(resolveModelCost({ purchasePriceRub: "  120  " })).toBe(120);
  });
});

describe("resolveModelCost — нефинитные значения", () => {
  it("Infinity не finite → источник пропускается", () => {
    expect(resolveModelCost({ purchasePriceRub: Infinity, fullCost: 500 })).toBe(500);
  });

  it("-Infinity не finite → источник пропускается", () => {
    expect(resolveModelCost({ purchasePriceRub: -Infinity, fullCost: 500 })).toBe(500);
  });

  it("NaN не finite → источник пропускается", () => {
    expect(resolveModelCost({ purchasePriceRub: NaN, fullCost: 500 })).toBe(500);
  });

  it("¥ конечный, но курс Infinity → курс не finite → ¥-источник пропускается", () => {
    expect(
      resolveModelCost({ purchasePriceCny: 100, cnyRubRate: Infinity, fullCost: 333 }),
    ).toBe(333);
  });
});

describe("resolveModelCost — Prisma.Decimal", () => {
  it("Decimal в purchasePriceRub читается через toString()", () => {
    expect(resolveModelCost({ purchasePriceRub: new Prisma.Decimal("1234.56") })).toBe(1234.56);
  });

  it("Decimal ¥ × Decimal курс перемножаются как числа", () => {
    const res = resolveModelCost({
      purchasePriceCny: new Prisma.Decimal("100"),
      cnyRubRate: new Prisma.Decimal("12.5"),
    });
    expect(res).toBe(1250);
  });

  it("Decimal('0') в purchasePriceRub возвращается как 0, а не проваливается", () => {
    expect(
      resolveModelCost({ purchasePriceRub: new Prisma.Decimal("0"), fullCost: 999 }),
    ).toBe(0);
  });

  it("Decimal в fullCost-фоллбэке", () => {
    expect(resolveModelCost({ fullCost: new Prisma.Decimal("850.00") })).toBe(850);
  });

  it("Decimal в targetCostCny × числовой курс", () => {
    expect(
      resolveModelCost({ targetCostCny: new Prisma.Decimal("50"), cnyRubRate: 12 }),
    ).toBe(600);
  });
});

describe("resolveModelCost — округление и точность float", () => {
  it("умножение даёт ровный результат для целых", () => {
    expect(resolveModelCost({ purchasePriceCny: 7, cnyRubRate: 13 })).toBe(91);
  });

  it("результат умножения НЕ округляется — возвращается сырой float", () => {
    // 0.1 * 3 = 0.30000000000000004 в IEEE-754; функция не округляет
    expect(resolveModelCost({ purchasePriceCny: 0.1, cnyRubRate: 3 })).toBeCloseTo(0.3, 10);
    expect(resolveModelCost({ purchasePriceCny: 0.1, cnyRubRate: 3 })).not.toBe(0.3);
  });

  it("дробный курс на дробную закупку даёт сырое значение float", () => {
    expect(resolveModelCost({ purchasePriceCny: 99.99, cnyRubRate: 11.5 })).toBeCloseTo(1149.885, 6);
  });
});
