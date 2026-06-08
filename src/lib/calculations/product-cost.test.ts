import { describe, it, expect } from "vitest";
import { Prisma } from "@prisma/client";
import { calculateOrderEconomics, lineEconomicsFromSnapshot } from "@/lib/calculations/product-cost";
import { effectiveOrderUnitCost } from "@/lib/calculations/resolve-model-cost";

/**
 * REGRESSION-тест на calculateOrderEconomics.
 *
 * Фиксируем ТЕКУЩЕЕ поведение расчёта экономики заказа:
 *   - batchCost      = эффективная себестоимость (resolveModelCost) × quantity, округление до 2 знаков
 *   - plannedRevenue = customerPrice × (plannedRedemptionPct / 100) × quantity, округление до 2 знаков
 *   - plannedRevenue = null, если нет customerPrice ИЛИ redemption <= 0
 *   - batchCost      = null, если не удалось определить себестоимость
 *
 * Функция чистая, времени/БД/сети не трогает.
 */
describe("calculateOrderEconomics", () => {
  describe("batchCost — себестоимость × количество", () => {
    it("считает себестоимость партии по purchasePriceRub", () => {
      const r = calculateOrderEconomics({ purchasePriceRub: 1200 }, 10);
      expect(r.batchCost).toBe(12000);
    });

    it("приоритет источника себестоимости — purchasePriceRub важнее fullCost", () => {
      const r = calculateOrderEconomics(
        { purchasePriceRub: 1000, fullCost: 9999 },
        2,
      );
      expect(r.batchCost).toBe(2000);
    });

    it("пересчитывает закупку в ¥ по курсу, если рублёвой нет", () => {
      // purchasePriceCny × cnyRubRate = 100 × 12 = 1200; × qty 5 = 6000
      const r = calculateOrderEconomics(
        { purchasePriceCny: 100, cnyRubRate: 12 },
        5,
      );
      expect(r.batchCost).toBe(6000);
    });

    it("откатывается на fullCost (legacy), если нет закупочных цен", () => {
      const r = calculateOrderEconomics({ fullCost: 850 }, 4);
      expect(r.batchCost).toBe(3400);
    });

    it("откатывается на targetCostRub, если нет fullCost", () => {
      const r = calculateOrderEconomics({ targetCostRub: 500 }, 3);
      expect(r.batchCost).toBe(1500);
    });

    it("targetCostCny требует курс: без курса себестоимость не определяется → null", () => {
      const r = calculateOrderEconomics({ targetCostCny: 100 }, 5);
      expect(r.batchCost).toBeNull();
    });

    it("targetCostCny × cnyRubRate работает, если нет других источников", () => {
      // 80 × 13 = 1040; × qty 2 = 2080
      const r = calculateOrderEconomics(
        { targetCostCny: 80, cnyRubRate: 13 },
        2,
      );
      expect(r.batchCost).toBe(2080);
    });

    it("возвращает batchCost = null, когда себестоимость не определена", () => {
      const r = calculateOrderEconomics({}, 10);
      expect(r.batchCost).toBeNull();
    });

    it("пустая строка в источнике себестоимости трактуется как отсутствие → null", () => {
      const r = calculateOrderEconomics({ purchasePriceRub: "" }, 10);
      expect(r.batchCost).toBeNull();
    });

    it("округляет batchCost до 2 знаков", () => {
      // 33.333 × 3 = 99.999 → 100.00
      const r = calculateOrderEconomics({ purchasePriceRub: 33.333 }, 3);
      expect(r.batchCost).toBe(100);
    });

    it("округление вниз: 10.014 × 1 = 10.014 → 10.01", () => {
      const r = calculateOrderEconomics({ purchasePriceRub: 10.014 }, 1);
      expect(r.batchCost).toBe(10.01);
    });

    it("округление вверх: 10.015 × 1 → 10.02 (Math.round, half-up для положительных)", () => {
      const r = calculateOrderEconomics({ purchasePriceRub: 10.015 }, 1);
      expect(r.batchCost).toBe(10.02);
    });
  });

  describe("plannedRevenue — выручка по плану выкупа", () => {
    it("считает плановую выручку: price × redemption% × qty", () => {
      // 2000 × 0.30 × 10 = 6000
      const r = calculateOrderEconomics(
        { customerPrice: 2000, plannedRedemptionPct: 30 },
        10,
      );
      expect(r.plannedRevenue).toBe(6000);
    });

    it("redemption = 0 → plannedRevenue = null", () => {
      const r = calculateOrderEconomics(
        { customerPrice: 2000, plannedRedemptionPct: 0 },
        10,
      );
      expect(r.plannedRevenue).toBeNull();
    });

    it("plannedRedemptionPct отсутствует → redemption = 0 → plannedRevenue = null", () => {
      const r = calculateOrderEconomics({ customerPrice: 2000 }, 10);
      expect(r.plannedRevenue).toBeNull();
    });

    it("plannedRedemptionPct = null → plannedRevenue = null", () => {
      const r = calculateOrderEconomics(
        { customerPrice: 2000, plannedRedemptionPct: null },
        10,
      );
      expect(r.plannedRevenue).toBeNull();
    });

    it("plannedRedemptionPct = пустая строка → plannedRevenue = null", () => {
      const r = calculateOrderEconomics(
        { customerPrice: 2000, plannedRedemptionPct: "" },
        10,
      );
      expect(r.plannedRevenue).toBeNull();
    });

    it("нет customerPrice (но есть redemption) → plannedRevenue = null", () => {
      const r = calculateOrderEconomics({ plannedRedemptionPct: 50 }, 10);
      expect(r.plannedRevenue).toBeNull();
    });

    it("customerPrice = null → plannedRevenue = null", () => {
      const r = calculateOrderEconomics(
        { customerPrice: null, plannedRedemptionPct: 50 },
        10,
      );
      expect(r.plannedRevenue).toBeNull();
    });

    it("customerPrice = пустая строка → plannedRevenue = null", () => {
      const r = calculateOrderEconomics(
        { customerPrice: "", plannedRedemptionPct: 50 },
        10,
      );
      expect(r.plannedRevenue).toBeNull();
    });

    it("customerPrice = 0 трактуется как валидная цена (0 !== null) → plannedRevenue = 0", () => {
      // toNum(0) === 0 (не null), redemption > 0 → 0 × 0.5 × 10 = 0
      const r = calculateOrderEconomics(
        { customerPrice: 0, plannedRedemptionPct: 50 },
        10,
      );
      expect(r.plannedRevenue).toBe(0);
    });

    it("redemption 100% — выручка = price × qty", () => {
      const r = calculateOrderEconomics(
        { customerPrice: 1500, plannedRedemptionPct: 100 },
        4,
      );
      expect(r.plannedRevenue).toBe(6000);
    });

    it("округляет plannedRevenue до 2 знаков", () => {
      // 999.99 × 0.333 × 1 = 332.99667 → 333.00
      const r = calculateOrderEconomics(
        { customerPrice: 999.99, plannedRedemptionPct: 33.3 },
        1,
      );
      expect(r.plannedRevenue).toBe(333);
    });

    it("дробный процент выкупа: 33.5% от 2000 × 3 = 2010", () => {
      // 2000 × 0.335 × 3 = 2010
      const r = calculateOrderEconomics(
        { customerPrice: 2000, plannedRedemptionPct: 33.5 },
        3,
      );
      expect(r.plannedRevenue).toBe(2010);
    });
  });

  describe("Decimal / string / number входы", () => {
    it("принимает Prisma.Decimal для себестоимости", () => {
      const r = calculateOrderEconomics(
        { purchasePriceRub: new Prisma.Decimal("1234.56") },
        2,
      );
      expect(r.batchCost).toBe(2469.12);
    });

    it("принимает Prisma.Decimal для цены и процента выкупа", () => {
      // 1999.99 × 0.45 × 2 = 1799.991 → 1799.99
      const r = calculateOrderEconomics(
        {
          customerPrice: new Prisma.Decimal("1999.99"),
          plannedRedemptionPct: new Prisma.Decimal("45"),
        },
        2,
      );
      expect(r.plannedRevenue).toBe(1799.99);
    });

    it("принимает строковые числа", () => {
      const r = calculateOrderEconomics(
        { purchasePriceRub: "1000", customerPrice: "2000", plannedRedemptionPct: "25" },
        3,
      );
      expect(r.batchCost).toBe(3000);
      // 2000 × 0.25 × 3 = 1500
      expect(r.plannedRevenue).toBe(1500);
    });

    it("Decimal закупки в ¥ × Decimal курса", () => {
      // 100 × 12.5 = 1250; × qty 2 = 2500
      const r = calculateOrderEconomics(
        {
          purchasePriceCny: new Prisma.Decimal("100"),
          cnyRubRate: new Prisma.Decimal("12.5"),
        },
        2,
      );
      expect(r.batchCost).toBe(2500);
    });

    it("невалидная числовая строка в себестоимости → null", () => {
      const r = calculateOrderEconomics({ purchasePriceRub: "abc" }, 5);
      expect(r.batchCost).toBeNull();
    });

    it("невалидная числовая строка в проценте выкупа → redemption 0 → plannedRevenue null", () => {
      const r = calculateOrderEconomics(
        { customerPrice: 2000, plannedRedemptionPct: "abc" },
        5,
      );
      expect(r.plannedRevenue).toBeNull();
    });
  });

  describe("границы quantity", () => {
    it("quantity = 0 → batchCost 0 и plannedRevenue 0 (нет валидации количества)", () => {
      const r = calculateOrderEconomics(
        { purchasePriceRub: 1000, customerPrice: 2000, plannedRedemptionPct: 50 },
        0,
      );
      expect(r.batchCost).toBe(0);
      expect(r.plannedRevenue).toBe(0);
    });

    it("quantity = 1 — единичный заказ", () => {
      const r = calculateOrderEconomics(
        { purchasePriceRub: 777, customerPrice: 1500, plannedRedemptionPct: 40 },
        1,
      );
      expect(r.batchCost).toBe(777);
      expect(r.plannedRevenue).toBe(600);
    });

    it("дробное quantity не валидируется и считается как есть", () => {
      // 1000 × 2.5 = 2500
      const r = calculateOrderEconomics({ purchasePriceRub: 1000 }, 2.5);
      expect(r.batchCost).toBe(2500);
    });

    it("отрицательное quantity даёт отрицательный batchCost (нет защиты на знак) // TODO: выглядит как баг", () => {
      const r = calculateOrderEconomics({ purchasePriceRub: 1000 }, -3);
      expect(r.batchCost).toBe(-3000);
    });

    it("большое quantity без переполнения", () => {
      const r = calculateOrderEconomics({ purchasePriceRub: 1500 }, 100000);
      expect(r.batchCost).toBe(150000000);
    });
  });

  describe("отрицательные / нестандартные значения процента и цены", () => {
    it("отрицательный процент выкупа: redemption <= 0 → plannedRevenue null // TODO: выглядит как баг", () => {
      // redemption = -0.1, условие redemption > 0 ложно → null (а не отрицательная выручка)
      const r = calculateOrderEconomics(
        { customerPrice: 2000, plannedRedemptionPct: -10 },
        5,
      );
      expect(r.plannedRevenue).toBeNull();
    });

    it("процент выкупа > 100 не ограничивается сверху", () => {
      // 1000 × 1.5 × 2 = 3000
      const r = calculateOrderEconomics(
        { customerPrice: 1000, plannedRedemptionPct: 150 },
        2,
      );
      expect(r.plannedRevenue).toBe(3000);
    });

    it("отрицательная себестоимость пропускается как есть → отрицательный batchCost", () => {
      const r = calculateOrderEconomics({ purchasePriceRub: -500 }, 4);
      expect(r.batchCost).toBe(-2000);
    });

    it("Infinity в себестоимости (number) → отбрасывается toNum → null", () => {
      const r = calculateOrderEconomics({ purchasePriceRub: Infinity }, 5);
      expect(r.batchCost).toBeNull();
    });

    it("NaN в себестоимости (number) → отбрасывается toNum → null", () => {
      const r = calculateOrderEconomics({ purchasePriceRub: NaN }, 5);
      expect(r.batchCost).toBeNull();
    });
  });

  describe("комбинированные кейсы и форма результата", () => {
    it("оба поля считаются одновременно", () => {
      const r = calculateOrderEconomics(
        { purchasePriceRub: 800, customerPrice: 2500, plannedRedemptionPct: 28 },
        10,
      );
      expect(r.batchCost).toBe(8000);
      // 2500 × 0.28 × 10 = 7000
      expect(r.plannedRevenue).toBe(7000);
    });

    it("себестоимость есть, выручки нет — независимые ветки", () => {
      const r = calculateOrderEconomics({ purchasePriceRub: 800 }, 10);
      expect(r.batchCost).toBe(8000);
      expect(r.plannedRevenue).toBeNull();
    });

    it("выручка есть, себестоимости нет — независимые ветки", () => {
      const r = calculateOrderEconomics(
        { customerPrice: 2500, plannedRedemptionPct: 28 },
        10,
      );
      expect(r.batchCost).toBeNull();
      expect(r.plannedRevenue).toBe(7000);
    });

    it("полностью пустая модель → оба поля null", () => {
      const r = calculateOrderEconomics({}, 10);
      expect(r).toEqual({ batchCost: null, plannedRevenue: null });
    });

    it("возвращает объект ровно с ключами batchCost и plannedRevenue", () => {
      const r = calculateOrderEconomics({ purchasePriceRub: 100 }, 1);
      expect(Object.keys(r).sort()).toEqual(["batchCost", "plannedRevenue"]);
    });
  });
});

// === Override стоимости единицы (фикс рассинхрона snapshot ↔ batchCost) ===
describe("calculateOrderEconomics — override стоимости единицы (unitCost)", () => {
  it("override важнее purchasePriceRub: batchCost считается от override", () => {
    // Раньше purchasePriceRub перебивал переданную цену → сумма заказа была неверной.
    const r = calculateOrderEconomics({ purchasePriceRub: 1000, fullCost: 200 }, 3, 80);
    expect(r.batchCost).toBe(240); // 80 × 3, а НЕ 1000 × 3
  });

  it("без override поведение прежнее (purchasePriceRub приоритетнее)", () => {
    const r = calculateOrderEconomics({ purchasePriceRub: 1000, fullCost: 200 }, 2);
    expect(r.batchCost).toBe(2000);
  });

  it("override не влияет на plannedRevenue (та по customerPrice)", () => {
    const r = calculateOrderEconomics(
      { purchasePriceRub: 1000, customerPrice: 2000, plannedRedemptionPct: 50 },
      2,
      80,
    );
    expect(r.batchCost).toBe(160); // 80 × 2
    expect(r.plannedRevenue).toBe(2000); // 2000 × 0.5 × 2 — не зависит от override
  });

  it("override null / Infinity / NaN игнорируется → resolveModelCost", () => {
    expect(calculateOrderEconomics({ purchasePriceRub: 1000 }, 1, null).batchCost).toBe(1000);
    expect(calculateOrderEconomics({ purchasePriceRub: 1000 }, 1, Infinity).batchCost).toBe(1000);
    expect(calculateOrderEconomics({ purchasePriceRub: 1000 }, 1, NaN).batchCost).toBe(1000);
  });
});

describe("effectiveOrderUnitCost — единая цена для snapshot и batchCost", () => {
  it("override важнее всего", () => {
    expect(effectiveOrderUnitCost({ purchasePriceRub: 1000, fullCost: 200 }, 80)).toBe(80);
  });
  it("без override → resolveModelCost (purchasePriceRub приоритетнее fullCost)", () => {
    expect(effectiveOrderUnitCost({ purchasePriceRub: 1000, fullCost: 200 })).toBe(1000);
  });
  it("без override и без закупки → fullCost", () => {
    expect(effectiveOrderUnitCost({ fullCost: 200 })).toBe(200);
  });
  it("override = пустая строка → игнор, идём в resolveModelCost", () => {
    expect(effectiveOrderUnitCost({ fullCost: 200 }, "")).toBe(200);
  });
  it("ничего нет → null", () => {
    expect(effectiveOrderUnitCost({})).toBeNull();
  });
});

describe("lineEconomicsFromSnapshot — экономика линии из снимка цен", () => {
  it("batchCost = snapshotFullCost × qty (не от живого фасона)", () => {
    expect(lineEconomicsFromSnapshot({ snapshotFullCost: 800 }, 3).batchCost).toBe(2400);
  });
  it("plannedRevenue из снимка цены и выкупа", () => {
    const r = lineEconomicsFromSnapshot({ snapshotCustomerPrice: 2000, snapshotRedemptionPct: 30 }, 10);
    expect(r.plannedRevenue).toBe(6000); // 2000 × 0.3 × 10
  });
  it("нет snapshotFullCost → batchCost null", () => {
    expect(lineEconomicsFromSnapshot({}, 5).batchCost).toBeNull();
  });
  it("принимает Prisma.Decimal", () => {
    const r = lineEconomicsFromSnapshot({ snapshotFullCost: new Prisma.Decimal("123.45") }, 2);
    expect(r.batchCost).toBe(246.9);
  });
});
