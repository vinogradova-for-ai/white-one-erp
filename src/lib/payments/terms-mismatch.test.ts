import { describe, it, expect } from "vitest";
import { checkTermsMismatch } from "./terms-mismatch";

describe("checkTermsMismatch", () => {
  it("совпадение 30/70 — match", () => {
    const r = checkTermsMismatch("30/70", [300_000, 700_000]);
    expect(r).not.toBeNull();
    expect(r!.match).toBe(true);
    expect(r!.expectedLabel).toBe("30/70");
  });

  it("баг из аудита: условия 30/70, график 50/50 — mismatch", () => {
    const r = checkTermsMismatch("30/70", [500_000, 500_000]);
    expect(r).not.toBeNull();
    expect(r!.match).toBe(false);
    expect(r!.actualLabel).toBe("50/50");
    expect(r!.expectedLabel).toBe("30/70");
  });

  it("допуск на округление копеек", () => {
    // 33/33/34 из 100 000: 33000, 33000, 34000
    const r = checkTermsMismatch("33/33/34", [33_000, 33_000, 34_000]);
    expect(r!.match).toBe(true);
  });

  it("разное число платежей — mismatch", () => {
    const r = checkTermsMismatch("30/70", [200_000, 300_000, 500_000]);
    expect(r!.match).toBe(false);
  });

  it("условия не парсятся — проверка неприменима", () => {
    expect(checkTermsMismatch("по договорённости", [100, 200])).toBeNull();
    expect(checkTermsMismatch(null, [100, 200])).toBeNull();
  });

  it("нет платежей или нулевая сумма — неприменима", () => {
    expect(checkTermsMismatch("30/70", [])).toBeNull();
    expect(checkTermsMismatch("30/70", [0, 0])).toBeNull();
  });

  it("100% одним платежом — match", () => {
    const r = checkTermsMismatch("100", [500_000]);
    expect(r!.match).toBe(true);
  });
});
