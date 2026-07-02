import { describe, it, expect } from "vitest";
import {
  median,
  daysBetween,
  shiftYm,
  shortMonthLabel,
  orderTotalCost,
} from "./stats-page";

describe("median", () => {
  it("пустой массив → null", () => {
    expect(median([])).toBeNull();
  });
  it("нечётная длина → средний элемент", () => {
    expect(median([3, 1, 2])).toBe(2);
  });
  it("чётная длина → среднее двух центральных", () => {
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });
  it("не мутирует исходный массив", () => {
    const src = [5, 1, 3];
    median(src);
    expect(src).toEqual([5, 1, 3]);
  });
});

describe("daysBetween", () => {
  it("целые сутки между датами", () => {
    const a = new Date("2026-01-01T00:00:00.000Z");
    const b = new Date("2026-01-11T00:00:00.000Z");
    expect(daysBetween(a, b)).toBe(10);
  });
  it("отрицательное, если b раньше a", () => {
    const a = new Date("2026-01-11T00:00:00.000Z");
    const b = new Date("2026-01-01T00:00:00.000Z");
    expect(daysBetween(a, b)).toBe(-10);
  });
  it("округление вниз по неполным суткам", () => {
    const a = new Date("2026-01-01T00:00:00.000Z");
    const b = new Date("2026-01-02T23:00:00.000Z");
    expect(daysBetween(a, b)).toBe(1);
  });
});

describe("shiftYm", () => {
  it("сдвиг вперёд через границу года", () => {
    expect(shiftYm(202612, 1)).toBe(202701);
  });
  it("сдвиг назад через границу года", () => {
    expect(shiftYm(202601, -1)).toBe(202512);
  });
  it("нулевой сдвиг", () => {
    expect(shiftYm(202607, 0)).toBe(202607);
  });
  it("сдвиг на 5 месяцев назад", () => {
    expect(shiftYm(202603, -5)).toBe(202510);
  });
});

describe("shortMonthLabel", () => {
  it("январь → янв", () => {
    expect(shortMonthLabel(202601)).toBe("янв");
  });
  it("декабрь → дек", () => {
    expect(shortMonthLabel(202612)).toBe("дек");
  });
});

describe("orderTotalCost", () => {
  const model = {}; // без себестоимости фасона
  it("Σ batchCost позиций, когда он задан", () => {
    const lines = [
      { batchCost: 1000, snapshotFullCost: null, quantity: 10 },
      { batchCost: 2000, snapshotFullCost: null, quantity: 5 },
    ];
    expect(orderTotalCost(lines, model)).toBe(3000);
  });
  it("fallback на snapshotFullCost × qty, если batchCost пуст", () => {
    const lines = [{ batchCost: null, snapshotFullCost: 300, quantity: 10 }];
    expect(orderTotalCost(lines, model)).toBe(3000);
  });
  it("fallback на себестоимость фасона × qty, если и снимка нет", () => {
    const lines = [{ batchCost: null, snapshotFullCost: null, quantity: 4 }];
    expect(orderTotalCost(lines, { purchasePriceRub: 500 })).toBe(2000);
  });
  it("нулевой batchCost не считается заданным — уходит в fallback", () => {
    const lines = [{ batchCost: 0, snapshotFullCost: 100, quantity: 2 }];
    expect(orderTotalCost(lines, model)).toBe(200);
  });
});
