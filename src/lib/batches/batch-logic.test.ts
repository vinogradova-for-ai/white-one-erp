import { describe, it, expect } from "vitest";
import {
  buildFullBatchItems,
  aggregateReceipt,
  allBatchesReceived,
  allBatchesShippedOrReceived,
  splitBatchPlan,
} from "./batch-logic";

describe("buildFullBatchItems", () => {
  it("разворачивает размерную матрицу в строку на размер", () => {
    const items = buildFullBatchItems([
      { productVariantId: "v1", colorName: "шоколад", quantity: 170, sizeDistribution: { "42": 50, "44": 120 } },
    ]);
    expect(items).toEqual([
      { variantId: "v1", colorName: "шоколад", size: "42", plannedQty: 50 },
      { variantId: "v1", colorName: "шоколад", size: "44", plannedQty: 120 },
    ]);
  });

  it("без матрицы — одна строка с size '—' и полным количеством", () => {
    const items = buildFullBatchItems([
      { productVariantId: "v1", colorName: "чёрный", quantity: 100, sizeDistribution: null },
    ]);
    expect(items).toEqual([{ variantId: "v1", colorName: "чёрный", size: "—", plannedQty: 100 }]);
  });

  it("пропускает нулевые размеры и нулевые линии", () => {
    const items = buildFullBatchItems([
      { productVariantId: "v1", colorName: "с", quantity: 50, sizeDistribution: { "42": 50, "44": 0 } },
      { productVariantId: "v2", colorName: "б", quantity: 0, sizeDistribution: null },
    ]);
    expect(items).toEqual([{ variantId: "v1", colorName: "с", size: "42", plannedQty: 50 }]);
  });
});

describe("aggregateReceipt", () => {
  it("считает план/принято/брак/недостачу/годных", () => {
    const t = aggregateReceipt([
      { plannedQty: 50, factQty: 48, defectQty: 2 },
      { plannedQty: 120, factQty: 120, defectQty: 0 },
    ]);
    expect(t.planned).toBe(170);
    expect(t.received).toBe(168);
    expect(t.defect).toBe(2);
    expect(t.shortage).toBe(2); // 170 − 168
    expect(t.good).toBe(166); // 168 − 2
  });

  it("null факт трактует как 0, недостача не уходит в минус", () => {
    const t = aggregateReceipt([{ plannedQty: 10, factQty: null, defectQty: null }]);
    expect(t.received).toBe(0);
    expect(t.shortage).toBe(10);
    expect(t.good).toBe(0);
  });

  it("перепоставка (факт больше плана) — недостача 0", () => {
    const t = aggregateReceipt([{ plannedQty: 10, factQty: 12, defectQty: 1 }]);
    expect(t.shortage).toBe(0);
    expect(t.good).toBe(11);
  });
});

describe("allBatchesReceived", () => {
  it("true когда у всех проставлен receivedAt", () => {
    expect(allBatchesReceived([{ receivedAt: new Date() }, { receivedAt: new Date() }])).toBe(true);
  });
  it("false если хоть одна не принята", () => {
    expect(allBatchesReceived([{ receivedAt: new Date() }, { receivedAt: null }])).toBe(false);
  });
  it("false для пустого списка партий", () => {
    expect(allBatchesReceived([])).toBe(false);
  });
});

describe("allBatchesShippedOrReceived", () => {
  it("true когда все уехали или приняты", () => {
    expect(
      allBatchesShippedOrReceived([
        { receivedAt: null, shipmentDeparted: true },
        { receivedAt: new Date(), shipmentDeparted: false },
      ]),
    ).toBe(true);
  });
  it("false если партия ещё не в уехавшей поставке и не принята", () => {
    expect(
      allBatchesShippedOrReceived([{ receivedAt: null, shipmentDeparted: false }]),
    ).toBe(false);
  });
});

describe("splitBatchPlan", () => {
  it("делит по позициям: move уезжает, keep остаётся", () => {
    const { keep, move } = splitBatchPlan(
      [
        { id: "a", plannedQty: 50 },
        { id: "b", plannedQty: 120 },
      ],
      { a: 20 },
    );
    expect(move).toEqual({ a: 20, b: 0 });
    expect(keep).toEqual({ a: 30, b: 120 });
  });

  it("клампит move до planned и не даёт отрицательных", () => {
    const { keep, move } = splitBatchPlan([{ id: "a", plannedQty: 10 }], { a: 999 });
    expect(move.a).toBe(10);
    expect(keep.a).toBe(0);
  });
});
