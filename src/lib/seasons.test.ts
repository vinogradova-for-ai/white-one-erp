import { describe, it, expect } from "vitest";
import { matchSeasonCategory, resolveSeasonCategory, SEASONS } from "./seasons";

describe("matchSeasonCategory — точный матч без задвоения", () => {
  const autumn = SEASONS.find((s) => s.key === "autumn-2026")!.categories; // Пальто, Полупальто, …

  it("«Полупальто» матчится ТОЛЬКО с «Полупальто», НЕ с «Пальто»", () => {
    expect(matchSeasonCategory("Полупальто", "Полупальто", autumn)).toBe(true);
    expect(matchSeasonCategory("Полупальто", "Пальто", autumn)).toBe(false);
  });

  it("«Пальто» матчится с «Пальто», НЕ с «Полупальто»", () => {
    expect(matchSeasonCategory("Пальто", "Пальто", autumn)).toBe(true);
    expect(matchSeasonCategory("Пальто", "Полупальто", autumn)).toBe(false);
  });

  const summer = SEASONS.find((s) => s.key === "summer-2026")!.categories; // Летние платья, Летние костюмы, Блузки

  it("«Летний костюм» → «Летние костюмы», НЕ «Летние платья» (не двоится по «летние»)", () => {
    expect(matchSeasonCategory("Летний костюм", "Летние костюмы", summer)).toBe(true);
    expect(matchSeasonCategory("Летний костюм", "Летние платья", summer)).toBe(false);
  });

  it("категория ни к чему не относящаяся — ни один чип не матчится", () => {
    for (const cat of summer) {
      expect(matchSeasonCategory("Новые товары", cat, summer)).toBe(false);
    }
  });

  it("каждая модель попадает МАКСИМУМ в один чип сезона", () => {
    for (const model of ["Пальто", "Полупальто", "Джинсы", "Брюки", "Летний костюм", "Блузка"]) {
      const season = SEASONS.flatMap((s) => s.categories);
      // Считаем в скольких чипах ОСЕНИ модель засчиталась.
      const hits = autumn.filter((cat) => matchSeasonCategory(model, cat, autumn)).length;
      expect(hits).toBeLessThanOrEqual(1);
      void season;
    }
  });

  it("resolveSeasonCategory возвращает индекс лучшей категории или -1", () => {
    expect(autumn[resolveSeasonCategory("Полупальто", autumn)]).toBe("Полупальто");
    expect(resolveSeasonCategory("Новые товары", autumn)).toBe(-1);
  });
});
