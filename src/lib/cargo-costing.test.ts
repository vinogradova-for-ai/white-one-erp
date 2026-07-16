import { describe, it, expect } from "vitest";
import { computeCargoAllocation, cargoTotalUsd } from "./cargo-costing";

describe("cargoTotalUsd", () => {
  it("суммирует фрахт+страховку+упаковку (накладная 3244+78+120=3442$)", () => {
    expect(
      cargoTotalUsd({ freightUsd: 3244, insuranceUsd: 78, packingFeeUsd: 120 }),
    ).toBe(3442);
  });

  it("если компоненты не разнесены — берёт amountUsdt", () => {
    expect(cargoTotalUsd({ amountUsdt: 3088 })).toBe(3088);
  });

  it("компоненты побеждают amountUsdt", () => {
    expect(cargoTotalUsd({ freightUsd: 100, amountUsdt: 999 })).toBe(100);
  });

  it("пусто — 0", () => {
    expect(cargoTotalUsd({})).toBe(0);
  });
});

describe("computeCargoAllocation", () => {
  const money = { freightUsd: 3244, insuranceUsd: 78, packingFeeUsd: 120 }; // 3442$

  it("раскидывает по весу пропорционально и считает ₽/шт", () => {
    const a = computeCargoAllocation({
      money,
      rate: 80,
      rateIsFixed: false,
      waybillWeightKg: 1622,
      lines: [
        { key: "b1", kind: "batch", label: "брюки", qty: 1000, autoWeightKg: 1200, overrideWeightKg: null },
        { key: "p1", kind: "packaging", label: "мешочки", qty: 20000, autoWeightKg: 400, overrideWeightKg: null },
      ],
    });
    expect(a.totalUsd).toBe(3442);
    expect(a.totalRub).toBe(275360);
    // доли: 1200/1600 и 400/1600
    expect(a.lines[0].amountRub).toBeCloseTo(275360 * 0.75, 0);
    expect(a.lines[1].amountRub).toBeCloseTo(275360 * 0.25, 0);
    expect(a.lines[0].perUnitRub).toBeCloseTo((275360 * 0.75) / 1000, 1);
    expect(a.unallocatedRub).toBeCloseTo(0, 1);
    // расхождение с брутто накладной: 1622 − 1600 = 22 кг
    expect(a.weightMismatchKg).toBeCloseTo(22, 1);
  });

  it("ручная поправка веса побеждает автоматический", () => {
    const a = computeCargoAllocation({
      money: { amountUsdt: 100 },
      rate: 100,
      rateIsFixed: true,
      waybillWeightKg: null,
      lines: [
        { key: "b1", kind: "batch", label: "а", qty: 10, autoWeightKg: 10, overrideWeightKg: 30 },
        { key: "b2", kind: "batch", label: "б", qty: 10, autoWeightKg: 10, overrideWeightKg: null },
      ],
    });
    expect(a.lines[0].amountRub).toBe(7500); // 30/40 от 10 000 ₽
    expect(a.lines[1].amountRub).toBe(2500);
  });

  it("строка без веса подсвечивается; веса её доли мы не знаем, поэтому взвешенные строки делят всю сумму (UI обязан показать предупреждение)", () => {
    const a = computeCargoAllocation({
      money: { amountUsdt: 100 },
      rate: 100,
      rateIsFixed: false,
      waybillWeightKg: 100,
      lines: [
        { key: "b1", kind: "batch", label: "а", qty: 10, autoWeightKg: 50, overrideWeightKg: null },
        { key: "x", kind: "packaging", label: "без веса", qty: 5, autoWeightKg: null, overrideWeightKg: null },
      ],
    });
    expect(a.linesWithoutWeight).toEqual(["x"]);
    expect(a.lines[0].amountRub).toBe(10000);
    expect(a.unallocatedRub).toBe(0);
    // расхождение с брутто (100 кг в накладной vs 50 кг строк) тоже сигналит
    expect(a.weightMismatchKg).toBeCloseTo(50, 1);
  });

  it("нет весов вообще — ничего не раскидано, всё в нераспределено", () => {
    const a = computeCargoAllocation({
      money: { amountUsdt: 100 },
      rate: 100,
      rateIsFixed: false,
      waybillWeightKg: null,
      lines: [
        { key: "x", kind: "batch", label: "а", qty: 10, autoWeightKg: null, overrideWeightKg: null },
      ],
    });
    expect(a.allocatedRub).toBe(0);
    expect(a.unallocatedRub).toBe(10000);
    expect(a.linesWithoutWeight).toEqual(["x"]);
  });

  it("единственная строка без веса берёт вес всей накладной", () => {
    const a = computeCargoAllocation({
      money: { amountUsdt: 100 },
      rate: 100,
      rateIsFixed: true,
      waybillWeightKg: 4385,
      lines: [
        { key: "b1", kind: "batch", label: "палаццо", qty: 5000, autoWeightKg: null, overrideWeightKg: null },
      ],
    });
    expect(a.lines[0].effectiveWeightKg).toBe(4385);
    expect(a.lines[0].amountRub).toBe(10000);
    expect(a.lines[0].perUnitRub).toBe(2);
    expect(a.linesWithoutWeight).toEqual([]);
  });

  it("qty=0 — рубли на строку есть, ₽/шт нет", () => {
    const a = computeCargoAllocation({
      money: { amountUsdt: 10 },
      rate: 100,
      rateIsFixed: false,
      waybillWeightKg: null,
      lines: [
        { key: "b", kind: "batch", label: "а", qty: 0, autoWeightKg: 5, overrideWeightKg: null },
      ],
    });
    expect(a.lines[0].amountRub).toBe(1000);
    expect(a.lines[0].perUnitRub).toBeNull();
  });
});
