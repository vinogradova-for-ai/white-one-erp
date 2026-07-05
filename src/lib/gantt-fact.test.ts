import { describe, it, expect } from "vitest";
import { alignBarsToStatus, recomputeBarRisks } from "./gantt-fact";

// Гант показывает факт: «сегодня» всегда в плашке активной по статусу фазы.
// Кейс из жалобы команды 05.07: по плану заказ в ОТК, по факту ещё «В пошиве».

type B = { start: string; end: string; lagDays?: number };

const chain = (): B[] => [
  { start: "2026-05-01", end: "2026-05-10" }, // Разработка
  { start: "2026-05-10", end: "2026-06-30" }, // Производство
  { start: "2026-06-30", end: "2026-07-05" }, // ОТК
  { start: "2026-07-05", end: "2026-07-20" }, // Доставка
];

describe("alignBarsToStatus", () => {
  it("заказ отстал от плана: активная фаза тянется до сегодня, будущие едут вправо с сохранением длительностей", () => {
    const bars = chain();
    // Статус «В пошиве» (active=1), а по плану производство кончилось 30.06.
    alignBarsToStatus(bars, 1, "2026-07-06");
    expect(bars[1].end).toBe("2026-07-06");
    expect(bars[1].lagDays).toBe(6);
    // ОТК уехал на 6 дней, длительность 5 дн сохранена.
    expect(bars[2].start).toBe("2026-07-06");
    expect(bars[2].end).toBe("2026-07-11");
    // Доставка тоже +6, длительность 15 дн сохранена.
    expect(bars[3].start).toBe("2026-07-11");
    expect(bars[3].end).toBe("2026-07-26");
    // Прошлое не тронуто.
    expect(bars[0]).toEqual({ start: "2026-05-01", end: "2026-05-10" });
  });

  it("заказ опережает план: активная фаза начинается сегодня, прошедшие обрезаются по сегодня", () => {
    const bars = chain();
    // Статус уже «Доставка» (active=3), а по плану она начнётся только 05.07... нет:
    // возьмём наглядно — сегодня 01.06, статус ОТК (active=2), план ОТК с 30.06.
    alignBarsToStatus(bars, 2, "2026-06-01");
    expect(bars[2].start).toBe("2026-06-01");
    expect(bars[2].end).toBe("2026-07-05"); // плановый конец не тронут
    // Производство обрезано по сегодня.
    expect(bars[1].end).toBe("2026-06-01");
    // Разработка целиком в прошлом — не тронута.
    expect(bars[0].end).toBe("2026-05-10");
  });

  it("сегодня уже внутри активной фазы или заказ завершён — ничего не меняем", () => {
    const inRange = chain();
    alignBarsToStatus(inRange, 1, "2026-06-15");
    expect(inRange).toEqual(chain());

    const done = chain();
    alignBarsToStatus(done, -1, "2026-07-06");
    expect(done).toEqual(chain());
  });
});

describe("recomputeBarRisks", () => {
  it("после выравнивания: дотянутая фаза просрочена через lagDays, сдвинутые будущие — нет", () => {
    const today = "2026-07-06";
    const bars = chain().map((b, i) => ({
      ...b,
      state: (i < 1 ? "done" : i === 1 ? "active" : "future") as "done" | "active" | "future",
      overdue: undefined as boolean | undefined,
      nearlyDue: undefined as boolean | undefined,
    }));
    alignBarsToStatus(bars, 1, today);
    recomputeBarRisks(bars, today, 5);

    expect(bars[0].overdue).toBe(false);       // done — не риск
    expect(bars[1].overdue).toBe(true);        // активная с хвостом просрочки
    expect(bars[2].overdue).toBe(false);       // ОТК уехал за сегодня — больше не «просрочен»
    expect(bars[2].nearlyDue).toBe(true);      // но кончается через 5 дн — горит
    expect(bars[3].overdue).toBe(false);
    expect(bars[3].nearlyDue).toBe(false);
  });
});
