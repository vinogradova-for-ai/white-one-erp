import { describe, it, expect } from "vitest";
import {
  isForwardOrderStatus,
  canMoveOrderStatus,
  ORDER_STATUS_SEQUENCE,
} from "@/lib/status-machine/order-statuses";

describe("isForwardOrderStatus — авто-статус двигает только вперёд", () => {
  it("вперёд по ленте → true", () => {
    expect(isForwardOrderStatus("PREPARATION", "SEWING")).toBe(true);
    expect(isForwardOrderStatus("SEWING", "QC")).toBe(true);
    expect(isForwardOrderStatus("QC", "WAREHOUSE_MSK")).toBe(true);
  });

  it("назад по ленте → false (не откатываем вручную продвинутый заказ)", () => {
    expect(isForwardOrderStatus("WAREHOUSE_MSK", "SEWING")).toBe(false);
    expect(isForwardOrderStatus("QC", "PREPARATION")).toBe(false);
    expect(isForwardOrderStatus("ON_SALE", "PACKING")).toBe(false);
  });

  it("тот же статус → false (нет движения)", () => {
    expect(isForwardOrderStatus("QC", "QC")).toBe(false);
  });

  it("мусорный статус → false, без краша", () => {
    expect(isForwardOrderStatus("NONSENSE" as never, "QC")).toBe(false);
    expect(isForwardOrderStatus("QC", "NONSENSE" as never)).toBe(false);
  });

  it("последовательность покрывает все шаги ленты", () => {
    for (let i = 0; i < ORDER_STATUS_SEQUENCE.length - 1; i++) {
      expect(isForwardOrderStatus(ORDER_STATUS_SEQUENCE[i], ORDER_STATUS_SEQUENCE[i + 1])).toBe(true);
    }
  });
});

describe("canMoveOrderStatus — защита от мусорного from", () => {
  it("неизвестный from → мягкий отказ, а не TypeError", () => {
    const r = canMoveOrderStatus("GARBAGE" as never, "QC", "OWNER");
    expect(r.ok).toBe(false);
  });
});
