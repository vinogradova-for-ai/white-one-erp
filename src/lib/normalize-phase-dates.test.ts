import { describe, it, expect } from "vitest";
import {
  normalizeOrderDates,
  normalizePackagingDates,
  orderDatesChanged,
  packagingDatesChanged,
  NORMALIZE_DEFAULTS,
  type OrderDateFields,
  type PackagingDateFields,
} from "@/lib/normalize-phase-dates";

// Хелперы для фиксированных дат (всё в UTC, без привязки к системному времени).
const d = (iso: string): Date => new Date(iso);
const TODAY = d("2026-06-02T12:00:00Z");

// Базовый заказ: только дата решения, остальные фазы считаются дефолтами.
function baseOrder(overrides: Partial<OrderDateFields> = {}): OrderDateFields {
  return {
    decisionDate: d("2026-01-01T00:00:00Z"),
    handedToFactoryDate: null,
    readyAtFactoryDate: null,
    qcDate: null,
    arrivalPlannedDate: null,
    createdAt: d("2025-12-01T00:00:00Z"),
    ...overrides,
  };
}

function basePackaging(overrides: Partial<PackagingDateFields> = {}): PackagingDateFields {
  return {
    decisionDate: d("2026-02-01T00:00:00Z"),
    orderedDate: null,
    productionEndDate: null,
    expectedDate: null,
    createdAt: d("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

describe("normalizeOrderDates — дефолтные длительности и последовательность фаз", () => {
  it("строит строгую последовательность Разработка→Производство→ОТК→Доставка от даты решения", () => {
    const n = normalizeOrderDates(baseOrder(), TODAY);

    // decision 2026-01-01 → +14 → +35 → +5 → +30
    expect(n.decisionDate.toISOString()).toBe("2026-01-01T00:00:00.000Z");
    expect(n.handedToFactoryDate.toISOString()).toBe("2026-01-15T00:00:00.000Z");
    expect(n.readyAtFactoryDate.toISOString()).toBe("2026-02-19T00:00:00.000Z");
    expect(n.qcDate.toISOString()).toBe("2026-02-24T00:00:00.000Z");
    expect(n.arrivalPlannedDate.toISOString()).toBe("2026-03-26T00:00:00.000Z");
  });

  it("использует дефолтные длительности DEV14/PROD35/QC5/SHIP30 (зазоры между фазами)", () => {
    const n = normalizeOrderDates(baseOrder(), TODAY);
    const day = 86400000;

    expect((n.handedToFactoryDate.getTime() - n.decisionDate.getTime()) / day).toBe(14);
    expect((n.readyAtFactoryDate.getTime() - n.handedToFactoryDate.getTime()) / day).toBe(35);
    expect((n.qcDate.getTime() - n.readyAtFactoryDate.getTime()) / day).toBe(5);
    expect((n.arrivalPlannedDate.getTime() - n.qcDate.getTime()) / day).toBe(30);
  });

  it("фазы не пересекаются и идут по возрастанию", () => {
    const n = normalizeOrderDates(baseOrder(), TODAY);
    expect(n.decisionDate.getTime()).toBeLessThan(n.handedToFactoryDate.getTime());
    expect(n.handedToFactoryDate.getTime()).toBeLessThan(n.readyAtFactoryDate.getTime());
    expect(n.readyAtFactoryDate.getTime()).toBeLessThan(n.qcDate.getTime());
    expect(n.qcDate.getTime()).toBeLessThan(n.arrivalPlannedDate.getTime());
  });
});

describe("normalizeOrderDates — startOfDay обнуляет время", () => {
  it("дата решения с временем суток нормализуется к полуночи UTC", () => {
    const n = normalizeOrderDates(
      baseOrder({ decisionDate: d("2026-01-01T15:30:45.123Z") }),
      TODAY,
    );
    expect(n.decisionDate.toISOString()).toBe("2026-01-01T00:00:00.000Z");
    // расчётные фазы тоже на полуночи
    expect(n.handedToFactoryDate.toISOString()).toBe("2026-01-15T00:00:00.000Z");
  });

  it("принятая из БД более поздняя дата фазы обнуляется по времени (startOfDay)", () => {
    // 2026-03-10T08:00 позже расчётного handed (2026-01-15) → уважается, но обнуляется
    const n = normalizeOrderDates(
      baseOrder({ handedToFactoryDate: d("2026-03-10T08:00:00Z") }),
      TODAY,
    );
    expect(n.handedToFactoryDate.toISOString()).toBe("2026-03-10T00:00:00.000Z");
  });
});

describe("normalizeOrderDates — уважение более поздних дат из БД и каскад", () => {
  it("если handedToFactoryDate в БД позже расчётной — она уважается и сдвигает все последующие фазы", () => {
    const n = normalizeOrderDates(
      baseOrder({ handedToFactoryDate: d("2026-03-01T00:00:00Z") }),
      TODAY,
    );
    expect(n.handedToFactoryDate.toISOString()).toBe("2026-03-01T00:00:00.000Z");
    // каскад: ready = handed + 35
    expect(n.readyAtFactoryDate.toISOString()).toBe("2026-04-05T00:00:00.000Z");
    // qc = ready + 5
    expect(n.qcDate.toISOString()).toBe("2026-04-10T00:00:00.000Z");
    // arrival = qc + 30
    expect(n.arrivalPlannedDate.toISOString()).toBe("2026-05-10T00:00:00.000Z");
  });

  it("дата из БД РАНЬШЕ расчётной игнорируется — берётся расчётная (expected)", () => {
    // handed в БД 2026-01-10 < expected 2026-01-15 → используется expected
    const n = normalizeOrderDates(
      baseOrder({ handedToFactoryDate: d("2026-01-10T00:00:00Z") }),
      TODAY,
    );
    expect(n.handedToFactoryDate.toISOString()).toBe("2026-01-15T00:00:00.000Z");
  });

  it("дата из БД РОВНО равна расчётной полуночи — уважается (сравнение >= включительно)", () => {
    const n = normalizeOrderDates(
      baseOrder({ handedToFactoryDate: d("2026-01-15T00:00:00Z") }),
      TODAY,
    );
    expect(n.handedToFactoryDate.toISOString()).toBe("2026-01-15T00:00:00.000Z");
  });

  it("поздняя arrivalPlannedDate из БД уважается без влияния на ранние фазы", () => {
    const n = normalizeOrderDates(
      baseOrder({ arrivalPlannedDate: d("2026-12-31T00:00:00Z") }),
      TODAY,
    );
    expect(n.arrivalPlannedDate.toISOString()).toBe("2026-12-31T00:00:00.000Z");
    expect(n.qcDate.toISOString()).toBe("2026-02-24T00:00:00.000Z");
  });

  it("каждая поздняя дата фазы независимо уважается, сохраняя последовательность", () => {
    const n = normalizeOrderDates(
      baseOrder({
        handedToFactoryDate: d("2026-02-01T00:00:00Z"),
        readyAtFactoryDate: d("2026-06-01T00:00:00Z"),
        qcDate: d("2026-07-01T00:00:00Z"),
        arrivalPlannedDate: d("2026-09-01T00:00:00Z"),
      }),
      TODAY,
    );
    expect(n.handedToFactoryDate.toISOString()).toBe("2026-02-01T00:00:00.000Z");
    expect(n.readyAtFactoryDate.toISOString()).toBe("2026-06-01T00:00:00.000Z");
    expect(n.qcDate.toISOString()).toBe("2026-07-01T00:00:00.000Z");
    expect(n.arrivalPlannedDate.toISOString()).toBe("2026-09-01T00:00:00.000Z");
    // строгая монотонность сохранена
    expect(n.handedToFactoryDate.getTime()).toBeLessThan(n.readyAtFactoryDate.getTime());
    expect(n.readyAtFactoryDate.getTime()).toBeLessThan(n.qcDate.getTime());
    expect(n.qcDate.getTime()).toBeLessThan(n.arrivalPlannedDate.getTime());
  });
});

describe("normalizeOrderDates — fallback даты решения", () => {
  it("при decisionDate === null берётся createdAt (нормализованный к полуночи)", () => {
    const n = normalizeOrderDates(
      baseOrder({ decisionDate: null, createdAt: d("2025-12-20T18:00:00Z") }),
      TODAY,
    );
    expect(n.decisionDate.toISOString()).toBe("2025-12-20T00:00:00.000Z");
    expect(n.handedToFactoryDate.toISOString()).toBe("2026-01-03T00:00:00.000Z");
  });

  it("при decisionDate === null и createdAt == null (рантайм) берётся today", () => {
    // createdAt типизирован как Date, но проверяем рантайм-fallback ?? todayStart
    const n = normalizeOrderDates(
      baseOrder({ decisionDate: null, createdAt: null as unknown as Date }),
      TODAY,
    );
    // today = 2026-06-02T12:00 → startOfDay → 2026-06-02
    expect(n.decisionDate.toISOString()).toBe("2026-06-02T00:00:00.000Z");
  });

  it("today по умолчанию (без явной передачи) не влияет, если decisionDate задана", () => {
    const n = normalizeOrderDates(baseOrder());
    expect(n.decisionDate.toISOString()).toBe("2026-01-01T00:00:00.000Z");
    expect(n.arrivalPlannedDate.toISOString()).toBe("2026-03-26T00:00:00.000Z");
  });
});

describe("normalizeOrderDates — переходы через границы месяца/года и високосный год", () => {
  it("корректно перешагивает Новый год", () => {
    const n = normalizeOrderDates(
      baseOrder({ decisionDate: d("2025-12-25T00:00:00Z") }),
      TODAY,
    );
    expect(n.decisionDate.toISOString()).toBe("2025-12-25T00:00:00.000Z");
    // +14 → 2026-01-08
    expect(n.handedToFactoryDate.toISOString()).toBe("2026-01-08T00:00:00.000Z");
  });

  it("учитывает 29 февраля (2028 — високосный)", () => {
    // decision 2028-02-15 +14 = 2028-02-29 (високосный)
    const n = normalizeOrderDates(
      baseOrder({ decisionDate: d("2028-02-15T00:00:00Z") }),
      TODAY,
    );
    expect(n.handedToFactoryDate.toISOString()).toBe("2028-02-29T00:00:00.000Z");
  });
});

describe("orderDatesChanged", () => {
  it("возвращает false, когда все входные даты уже совпадают с нормализованными (полночь)", () => {
    const o = baseOrder({
      decisionDate: d("2026-01-01T00:00:00Z"),
      handedToFactoryDate: d("2026-01-15T00:00:00Z"),
      readyAtFactoryDate: d("2026-02-19T00:00:00Z"),
      qcDate: d("2026-02-24T00:00:00Z"),
      arrivalPlannedDate: d("2026-03-26T00:00:00Z"),
    });
    const n = normalizeOrderDates(o, TODAY);
    expect(orderDatesChanged(o, n)).toBe(false);
  });

  it("возвращает true, когда расчёт сдвинул дату относительно входной (null → расчётная)", () => {
    const o = baseOrder(); // фазы null
    const n = normalizeOrderDates(o, TODAY);
    expect(orderDatesChanged(o, n)).toBe(true);
  });

  it("возвращает true, если входная дата на верном дне, но с ненулевым временем (сравнение по getTime)", () => {
    // TODO: выглядит как баг — изменение детектится только из-за времени суток, хотя календарный день тот же.
    const o = baseOrder({
      decisionDate: d("2026-01-01T09:00:00Z"),
      handedToFactoryDate: d("2026-01-15T00:00:00Z"),
      readyAtFactoryDate: d("2026-02-19T00:00:00Z"),
      qcDate: d("2026-02-24T00:00:00Z"),
      arrivalPlannedDate: d("2026-03-26T00:00:00Z"),
    });
    const n = normalizeOrderDates(o, TODAY);
    expect(orderDatesChanged(o, n)).toBe(true);
  });

  it("null входная фаза против рассчитанной даты считается изменением", () => {
    const o = baseOrder({
      decisionDate: d("2026-01-01T00:00:00Z"),
      handedToFactoryDate: null,
      readyAtFactoryDate: d("2026-02-19T00:00:00Z"),
      qcDate: d("2026-02-24T00:00:00Z"),
      arrivalPlannedDate: d("2026-03-26T00:00:00Z"),
    });
    const n = normalizeOrderDates(o, TODAY);
    expect(orderDatesChanged(o, n)).toBe(true);
  });
});

describe("normalizePackagingDates — дефолты и последовательность (3 фазы)", () => {
  it("строит Разработка→Производство→Доставка с дефолтами PACK_DEV7/PROD21/SHIP14", () => {
    const n = normalizePackagingDates(basePackaging(), TODAY);
    expect(n.decisionDate.toISOString()).toBe("2026-02-01T00:00:00.000Z");
    expect(n.orderedDate.toISOString()).toBe("2026-02-08T00:00:00.000Z");
    expect(n.productionEndDate.toISOString()).toBe("2026-03-01T00:00:00.000Z");
    expect(n.expectedDate.toISOString()).toBe("2026-03-15T00:00:00.000Z");
  });

  it("зазоры между фазами равны дефолтным длительностям", () => {
    const n = normalizePackagingDates(basePackaging(), TODAY);
    const day = 86400000;
    expect((n.orderedDate.getTime() - n.decisionDate.getTime()) / day).toBe(7);
    expect((n.productionEndDate.getTime() - n.orderedDate.getTime()) / day).toBe(21);
    expect((n.expectedDate.getTime() - n.productionEndDate.getTime()) / day).toBe(14);
  });

  it("уважает более позднюю orderedDate из БД и каскадирует", () => {
    const n = normalizePackagingDates(
      basePackaging({ orderedDate: d("2026-04-01T00:00:00Z") }),
      TODAY,
    );
    expect(n.orderedDate.toISOString()).toBe("2026-04-01T00:00:00.000Z");
    expect(n.productionEndDate.toISOString()).toBe("2026-04-22T00:00:00.000Z");
    expect(n.expectedDate.toISOString()).toBe("2026-05-06T00:00:00.000Z");
  });

  it("игнорирует более раннюю productionEndDate из БД", () => {
    const n = normalizePackagingDates(
      basePackaging({ productionEndDate: d("2026-02-10T00:00:00Z") }),
      TODAY,
    );
    // expected production = ordered(2026-02-08)+21 = 2026-03-01; БД 2026-02-10 раньше → expected
    expect(n.productionEndDate.toISOString()).toBe("2026-03-01T00:00:00.000Z");
  });

  it("startOfDay обнуляет время и для упаковки", () => {
    const n = normalizePackagingDates(
      basePackaging({ decisionDate: d("2026-02-01T23:59:59Z") }),
      TODAY,
    );
    expect(n.decisionDate.toISOString()).toBe("2026-02-01T00:00:00.000Z");
  });

  it("при decisionDate === null берётся createdAt", () => {
    const n = normalizePackagingDates(
      basePackaging({ decisionDate: null, createdAt: d("2026-01-10T08:00:00Z") }),
      TODAY,
    );
    expect(n.decisionDate.toISOString()).toBe("2026-01-10T00:00:00.000Z");
  });

  it("при decisionDate === null и createdAt == null (рантайм) берётся today", () => {
    const n = normalizePackagingDates(
      basePackaging({ decisionDate: null, createdAt: null as unknown as Date }),
      TODAY,
    );
    expect(n.decisionDate.toISOString()).toBe("2026-06-02T00:00:00.000Z");
  });
});

describe("packagingDatesChanged", () => {
  it("false когда все даты уже на расчётных полуночах", () => {
    const p = basePackaging({
      decisionDate: d("2026-02-01T00:00:00Z"),
      orderedDate: d("2026-02-08T00:00:00Z"),
      productionEndDate: d("2026-03-01T00:00:00Z"),
      expectedDate: d("2026-03-15T00:00:00Z"),
    });
    const n = normalizePackagingDates(p, TODAY);
    expect(packagingDatesChanged(p, n)).toBe(false);
  });

  it("true когда фазы были null", () => {
    const p = basePackaging();
    const n = normalizePackagingDates(p, TODAY);
    expect(packagingDatesChanged(p, n)).toBe(true);
  });

  it("true когда входная дата на верном дне, но с ненулевым временем", () => {
    // TODO: выглядит как баг — то же поведение, что и в orderDatesChanged.
    const p = basePackaging({
      decisionDate: d("2026-02-01T10:00:00Z"),
      orderedDate: d("2026-02-08T00:00:00Z"),
      productionEndDate: d("2026-03-01T00:00:00Z"),
      expectedDate: d("2026-03-15T00:00:00Z"),
    });
    const n = normalizePackagingDates(p, TODAY);
    expect(packagingDatesChanged(p, n)).toBe(true);
  });
});

describe("NORMALIZE_DEFAULTS — экспорт дефолтных длительностей", () => {
  it("значения для заказа зафиксированы", () => {
    expect(NORMALIZE_DEFAULTS.order).toEqual({
      development: 14,
      production: 35,
      qc: 5,
      shipping: 30,
    });
  });

  it("значения для упаковки зафиксированы", () => {
    expect(NORMALIZE_DEFAULTS.packaging).toEqual({
      development: 7,
      production: 21,
      shipping: 14,
    });
  });
});
