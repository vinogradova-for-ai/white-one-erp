import { describe, it, expect } from "vitest";
import { Prisma } from "@prisma/client";
import { generatePaymentsForOrder } from "@/lib/payments/generate-for-order";

// Хелпер для сборки минимального заказа под сигнатуру OrderForPayments.
function makeOrder(overrides: Partial<Parameters<typeof generatePaymentsForOrder>[0]> = {}) {
  return {
    id: "ord-1",
    paymentTerms: "30/70",
    batchCost: new Prisma.Decimal("10000"),
    factoryId: "fac-1",
    createdAt: new Date("2026-01-01T00:00:00Z"),
    readyAtFactoryDate: new Date("2026-03-01T00:00:00Z"),
    launchMonth: 202604,
    ...overrides,
  };
}

describe("generatePaymentsForOrder — нормальные условия оплаты", () => {
  it("30/70 даёт два платежа с суммами batchCost*share, округлёнными до 2 знаков", () => {
    const result = generatePaymentsForOrder(makeOrder({ paymentTerms: "30/70" }));

    expect(result).toHaveLength(2);
    expect(result[0].amount.toString()).toBe("3000");
    expect(result[1].amount.toString()).toBe("7000");
  });

  it("сумма платежей равна batchCost при делящихся долях", () => {
    const order = makeOrder({ paymentTerms: "50/30/20", batchCost: new Prisma.Decimal("10000") });
    const result = generatePaymentsForOrder(order);

    const total = result.reduce((acc, p) => acc.add(p.amount), new Prisma.Decimal(0));
    expect(total.toString()).toBe("10000");
    expect(total.eq(new Prisma.Decimal("10000"))).toBe(true);
  });

  it("50/30/20 — три платежа с корректными суммами", () => {
    const result = generatePaymentsForOrder(
      makeOrder({ paymentTerms: "50/30/20", batchCost: new Prisma.Decimal("10000") }),
    );

    expect(result.map((p) => p.amount.toString())).toEqual(["5000", "3000", "2000"]);
  });

  it("каждый платёж имеет type ORDER и notes=null при заполненной себестоимости", () => {
    const result = generatePaymentsForOrder(makeOrder({ paymentTerms: "30/70" }));

    for (const p of result) {
      expect(p.type).toBe("ORDER");
      expect(p.notes).toBeNull();
    }
  });

  it("проценты с пробелами и знаком % парсятся ('30 / 70 %')", () => {
    const result = generatePaymentsForOrder(
      makeOrder({ paymentTerms: "30 / 70 %", batchCost: new Prisma.Decimal("10000") }),
    );

    expect(result).toHaveLength(2);
    expect(result.map((p) => p.amount.toString())).toEqual(["3000", "7000"]);
  });

  it("доли в формате ~1.0 ('0.4/0.6') трактуются как доли", () => {
    const result = generatePaymentsForOrder(
      makeOrder({ paymentTerms: "0.4/0.6", batchCost: new Prisma.Decimal("10000") }),
    );

    expect(result).toHaveLength(2);
    expect(result.map((p) => p.amount.toString())).toEqual(["4000", "6000"]);
  });

  it("дробная себестоимость округляется до 2 знаков (ROUND_HALF_UP)", () => {
    // 1000.50 * 0.5 = 500.25
    const result = generatePaymentsForOrder(
      makeOrder({ paymentTerms: "50/50", batchCost: new Prisma.Decimal("1000.50") }),
    );

    expect(result.map((p) => p.amount.toString())).toEqual(["500.25", "500.25"]);
  });
});

describe("generatePaymentsForOrder — лейблы платежей", () => {
  it("два платежа маркируются как Предоплата/Постоплата", () => {
    const result = generatePaymentsForOrder(makeOrder({ paymentTerms: "30/70" }));

    expect(result[0].label).toBe("Предоплата 30%");
    expect(result[1].label).toBe("Постоплата 70%");
  });

  it("три платежа: Предоплата / промежуточный / Постоплата", () => {
    const result = generatePaymentsForOrder(makeOrder({ paymentTerms: "50/30/20" }));

    expect(result[0].label).toBe("Предоплата 50%");
    expect(result[1].label).toBe("Платёж 2/3 — 30%");
    expect(result[2].label).toBe("Постоплата 20%");
  });

  it("один платёж '100' маркируется как Полная оплата 100%", () => {
    const result = generatePaymentsForOrder(makeOrder({ paymentTerms: "100" }));

    expect(result).toHaveLength(1);
    expect(result[0].label).toBe("Полная оплата 100%");
  });
});

describe("generatePaymentsForOrder — даты платежей (allocatePaymentDates)", () => {
  it("первый платёж привязан к createdAt (opening), последний — к readyAtFactoryDate (closing)", () => {
    const order = makeOrder({
      paymentTerms: "50/30/20",
      createdAt: new Date("2026-01-01T00:00:00Z"),
      readyAtFactoryDate: new Date("2026-03-01T00:00:00Z"),
    });
    const result = generatePaymentsForOrder(order);

    expect(result[0].plannedDate.toISOString()).toBe("2026-01-01T00:00:00.000Z");
    expect(result[2].plannedDate.toISOString()).toBe("2026-03-01T00:00:00.000Z");
  });

  it("промежуточный платёж из трёх стоит ровно посередине opening↔closing", () => {
    const order = makeOrder({
      paymentTerms: "50/30/20",
      createdAt: new Date("2026-01-01T00:00:00Z"),
      readyAtFactoryDate: new Date("2026-03-01T00:00:00Z"),
    });
    const result = generatePaymentsForOrder(order);

    expect(result[1].plannedDate.toISOString()).toBe("2026-01-30T12:00:00.000Z");
  });

  it("единственный платёж '100' получает дату opening (createdAt)", () => {
    const order = makeOrder({
      paymentTerms: "100",
      createdAt: new Date("2026-01-01T00:00:00Z"),
      readyAtFactoryDate: new Date("2026-03-01T00:00:00Z"),
    });
    const result = generatePaymentsForOrder(order);

    expect(result[0].plannedDate.toISOString()).toBe("2026-01-01T00:00:00.000Z");
  });

  it("без readyAtFactoryDate closing оценивается от launchMonth: 1-е число месяца минус 45 дней", () => {
    // launchMonth=202604 → 2026-04-01 минус 45 дней = 2026-02-15
    const order = makeOrder({
      paymentTerms: "30/70",
      readyAtFactoryDate: null,
      launchMonth: 202604,
      createdAt: new Date("2026-01-01T00:00:00Z"),
    });
    const result = generatePaymentsForOrder(order);

    expect(result[1].plannedDate.toISOString()).toBe("2026-02-15T00:00:00.000Z");
  });
});

describe("generatePaymentsForOrder — нераспарсенные условия оплаты", () => {
  it("неразборчивый текст → один платёж 100% с подсказкой и оригиналом строки в notes", () => {
    const order = makeOrder({ paymentTerms: "как договоримся", batchCost: new Prisma.Decimal("10000") });
    const result = generatePaymentsForOrder(order);

    expect(result).toHaveLength(1);
    expect(result[0].amount.toString()).toBe("10000");
    expect(result[0].label).toBe("Оплата по заказу");
    expect(result[0].notes).toBe(
      "Не удалось распознать условия оплаты «как договоримся». Проверьте график и суммы.",
    );
  });

  it("суммы долей не похожи ни на проценты, ни на доли ('10/20') → не парсится, один платёж 100%", () => {
    const order = makeOrder({ paymentTerms: "10/20", batchCost: new Prisma.Decimal("10000") });
    const result = generatePaymentsForOrder(order);

    expect(result).toHaveLength(1);
    expect(result[0].label).toBe("Оплата по заказу");
    expect(result[0].notes).toContain("Не удалось распознать условия оплаты «10/20»");
  });

  it("paymentTerms = null → один платёж 100% с подсказкой «не заполнены»", () => {
    const order = makeOrder({ paymentTerms: null, batchCost: new Prisma.Decimal("10000") });
    const result = generatePaymentsForOrder(order);

    expect(result).toHaveLength(1);
    expect(result[0].amount.toString()).toBe("10000");
    expect(result[0].notes).toBe("Условия оплаты не заполнены. Проверьте график и суммы.");
  });

  it("paymentTerms = пустая строка → трактуется как незаполненные (notes без кавычек)", () => {
    const order = makeOrder({ paymentTerms: "", batchCost: new Prisma.Decimal("10000") });
    const result = generatePaymentsForOrder(order);

    expect(result).toHaveLength(1);
    expect(result[0].notes).toBe("Условия оплаты не заполнены. Проверьте график и суммы.");
  });

  it("нераспарсенный платёж получает дату closing (readyAtFactoryDate)", () => {
    const order = makeOrder({
      paymentTerms: "abc",
      readyAtFactoryDate: new Date("2026-03-01T00:00:00Z"),
    });
    const result = generatePaymentsForOrder(order);

    expect(result[0].plannedDate.toISOString()).toBe("2026-03-01T00:00:00.000Z");
  });

  it("нераспарсенный платёж без readyAtFactoryDate получает closing от launchMonth", () => {
    const order = makeOrder({
      paymentTerms: "abc",
      readyAtFactoryDate: null,
      launchMonth: 202604,
    });
    const result = generatePaymentsForOrder(order);

    expect(result[0].plannedDate.toISOString()).toBe("2026-02-15T00:00:00.000Z");
  });
});

describe("generatePaymentsForOrder — пустая/нулевая себестоимость", () => {
  it("batchCost = null → суммы 0 + подсказка заполнить экономику (при валидных terms)", () => {
    const order = makeOrder({ paymentTerms: "30/70", batchCost: null });
    const result = generatePaymentsForOrder(order);

    expect(result).toHaveLength(2);
    expect(result[0].amount.toString()).toBe("0");
    expect(result[1].amount.toString()).toBe("0");
    expect(result[0].notes).toBe(
      "Себестоимость партии ещё не посчитана — заполните экономику фасона, затем пересчитайте платежи.",
    );
    expect(result[1].notes).toContain("Себестоимость партии ещё не посчитана");
  });

  it("batchCost = Decimal(0) ведёт себя как null: суммы 0 + подсказка", () => {
    const order = makeOrder({ paymentTerms: "30/70", batchCost: new Prisma.Decimal(0) });
    const result = generatePaymentsForOrder(order);

    expect(result.every((p) => p.amount.toString() === "0")).toBe(true);
    expect(result[0].notes).toContain("Себестоимость партии ещё не посчитана");
  });

  it("batchCost = null с нераспарсенными terms → один платёж amount 0 и подсказка про условия (не про экономику)", () => {
    const order = makeOrder({ paymentTerms: null, batchCost: null });
    const result = generatePaymentsForOrder(order);

    expect(result).toHaveLength(1);
    expect(result[0].amount.toString()).toBe("0");
    // В ветке «не распарсили» notes всегда про условия оплаты, даже если себестоимость пустая.
    expect(result[0].notes).toBe("Условия оплаты не заполнены. Проверьте график и суммы.");
  });
});

describe("generatePaymentsForOrder — протекание полей заказа", () => {
  it("factoryId протекает во все платежи (валидные terms)", () => {
    const order = makeOrder({ paymentTerms: "50/30/20", factoryId: "fac-777" });
    const result = generatePaymentsForOrder(order);

    expect(result.every((p) => p.factoryId === "fac-777")).toBe(true);
  });

  it("factoryId = null протекает как null", () => {
    const order = makeOrder({ paymentTerms: "30/70", factoryId: null });
    const result = generatePaymentsForOrder(order);

    expect(result.every((p) => p.factoryId === null)).toBe(true);
  });

  it("factoryId протекает и в нераспарсенный одиночный платёж", () => {
    const order = makeOrder({ paymentTerms: "xyz", factoryId: "fac-9" });
    const result = generatePaymentsForOrder(order);

    expect(result).toHaveLength(1);
    expect(result[0].factoryId).toBe("fac-9");
  });

  it("orderId протекает во все платежи", () => {
    const order = makeOrder({ id: "ORD-555", paymentTerms: "50/30/20" });
    const result = generatePaymentsForOrder(order);

    expect(result.every((p) => p.orderId === "ORD-555")).toBe(true);
  });
});

describe("generatePaymentsForOrder — сумма платежей точно равна batchCost (остаток на последнем)", () => {
  it("33/33/34 от 100.01: последний платёж добирает остаток → сумма ровно 100.01", () => {
    const order = makeOrder({ paymentTerms: "33/33/34", batchCost: new Prisma.Decimal("100.01") });
    const result = generatePaymentsForOrder(order);

    // Первые доли округляются как обычно, последний платёж = остаток.
    expect(result.map((p) => p.amount.toString())).toEqual(["33", "33", "34.01"]);

    const total = result.reduce((acc, p) => acc.add(p.amount), new Prisma.Decimal(0));
    expect(total.eq(new Prisma.Decimal("100.01"))).toBe(true);
  });

  it("сумма платежей == batchCost для разных долей и сумм (нет потери копеек)", () => {
    const cases = [
      { terms: "30/70", cost: "1000.00" },
      { terms: "50/30/20", cost: "99999.99" },
      { terms: "33/33/34", cost: "1.00" },
      { terms: "10/20/30/40", cost: "777.77" },
    ];
    for (const c of cases) {
      const r = generatePaymentsForOrder(makeOrder({ paymentTerms: c.terms, batchCost: new Prisma.Decimal(c.cost) }));
      const total = r.reduce((acc, p) => acc.add(p.amount), new Prisma.Decimal(0));
      expect(total.eq(new Prisma.Decimal(c.cost))).toBe(true);
    }
  });
});
