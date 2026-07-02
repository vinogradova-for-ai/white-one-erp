import { describe, it, expect } from "vitest";
import {
  toKopecks,
  kopecksToRubString,
  autoAllocate,
  paymentFactStatus,
  paymentRemainingKopecks,
  type OpenPaymentInput,
} from "@/lib/payments/allocate-payout";

describe("toKopecks / kopecksToRubString — копейки без float-погрешности", () => {
  it("число с дробью в копейки", () => {
    expect(toKopecks(450000.5)).toBe(45000050);
    expect(toKopecks(0.1 + 0.2)).toBe(30); // классическая float-ловушка — должно быть ровно 30 коп
  });
  it("строка с запятой и пробелами", () => {
    expect(toKopecks("36 500,25")).toBe(3650025);
    expect(toKopecks("120000")).toBe(12000000);
  });
  it("режем/добиваем дробную часть до 2 знаков", () => {
    expect(toKopecks("10.9")).toBe(1090);
    expect(toKopecks("10.999")).toBe(1099); // лишнее отбрасываем (не округляем вверх)
  });
  it("обратно в рубли-строку с двумя знаками", () => {
    expect(kopecksToRubString(45000050)).toBe("450000.50");
    expect(kopecksToRubString(1090)).toBe("10.90");
    expect(kopecksToRubString(0)).toBe("0.00");
    expect(kopecksToRubString(5)).toBe("0.05");
  });
});

describe("autoAllocate — раскидывание сверху вниз", () => {
  const p = (id: string, amount: number, allocated = 0): OpenPaymentInput => ({
    id,
    amountKopecks: amount,
    allocatedKopecks: allocated,
  });

  it("сумма меньше первого остатка — всё в первый", () => {
    const r = autoAllocate(10000, [p("a", 50000), p("b", 30000)]);
    expect(r.rows).toEqual([{ paymentId: "a", amountKopecks: 10000 }]);
    expect(r.allocatedKopecks).toBe(10000);
    expect(r.leftoverKopecks).toBe(0);
  });

  it("сумма закрывает первый и часть второго", () => {
    const r = autoAllocate(60000, [p("a", 50000), p("b", 30000)]);
    expect(r.rows).toEqual([
      { paymentId: "a", amountKopecks: 50000 },
      { paymentId: "b", amountKopecks: 10000 },
    ]);
    expect(r.leftoverKopecks).toBe(0);
  });

  it("сумма больше всех остатков — остаётся нераспределённый leftover", () => {
    const r = autoAllocate(100000, [p("a", 50000), p("b", 30000)]);
    expect(r.rows).toEqual([
      { paymentId: "a", amountKopecks: 50000 },
      { paymentId: "b", amountKopecks: 30000 },
    ]);
    expect(r.allocatedKopecks).toBe(80000);
    expect(r.leftoverKopecks).toBe(20000);
  });

  it("уже частично разнесённый платёж берёт только свой остаток", () => {
    // у 'a' план 50000, уже разнесено 40000 → остаток 10000
    const r = autoAllocate(25000, [p("a", 50000, 40000), p("b", 30000)]);
    expect(r.rows).toEqual([
      { paymentId: "a", amountKopecks: 10000 },
      { paymentId: "b", amountKopecks: 15000 },
    ]);
    expect(r.leftoverKopecks).toBe(0);
  });

  it("полностью закрытые платежи пропускаются", () => {
    const r = autoAllocate(20000, [p("a", 50000, 50000), p("b", 30000)]);
    expect(r.rows).toEqual([{ paymentId: "b", amountKopecks: 20000 }]);
  });

  it("нулевая сумма — ничего не разносим", () => {
    const r = autoAllocate(0, [p("a", 50000)]);
    expect(r.rows).toEqual([]);
    expect(r.leftoverKopecks).toBe(0);
  });

  it("копейки: 100.01 ₽ по двум платежам", () => {
    const r = autoAllocate(toKopecks("100.01"), [
      p("a", toKopecks("100.00")),
      p("b", toKopecks("50.00")),
    ]);
    expect(r.rows).toEqual([
      { paymentId: "a", amountKopecks: 10000 },
      { paymentId: "b", amountKopecks: 1 },
    ]);
    expect(kopecksToRubString(r.rows[1].amountKopecks)).toBe("0.01");
  });
});

describe("paymentFactStatus — статус планового платежа по факту", () => {
  it("нет разнесений, не legacy → не оплачен", () => {
    expect(paymentFactStatus({ amountKopecks: 12000000, allocatedKopecks: 0, legacyPaid: false })).toBe("unpaid");
  });
  it("нет разнесений, legacy paid → старая запись", () => {
    expect(paymentFactStatus({ amountKopecks: 12000000, allocatedKopecks: 0, legacyPaid: true })).toBe("legacy-paid");
  });
  it("разнесено меньше суммы → частично (даже если legacy=true, факт главнее)", () => {
    expect(paymentFactStatus({ amountKopecks: 12000000, allocatedKopecks: 5000000, legacyPaid: true })).toBe("partial");
  });
  it("разнесено >= суммы → оплачен", () => {
    expect(paymentFactStatus({ amountKopecks: 12000000, allocatedKopecks: 12000000, legacyPaid: false })).toBe("paid");
    expect(paymentFactStatus({ amountKopecks: 12000000, allocatedKopecks: 12000001, legacyPaid: false })).toBe("paid");
  });
});

describe("paymentRemainingKopecks — остаток к оплате", () => {
  it("legacy-оплаченный без разнесений закрыт (0)", () => {
    expect(paymentRemainingKopecks({ amountKopecks: 12000000, allocatedKopecks: 0, legacyPaid: true })).toBe(0);
  });
  it("обычный открытый — полная сумма", () => {
    expect(paymentRemainingKopecks({ amountKopecks: 12000000, allocatedKopecks: 0, legacyPaid: false })).toBe(12000000);
  });
  it("частично разнесённый — остаток", () => {
    expect(paymentRemainingKopecks({ amountKopecks: 12000000, allocatedKopecks: 5000000, legacyPaid: false })).toBe(7000000);
  });
  it("переразнесённый не уходит в минус", () => {
    expect(paymentRemainingKopecks({ amountKopecks: 12000000, allocatedKopecks: 13000000, legacyPaid: false })).toBe(0);
  });
});
