import { describe, it, expect } from "vitest";
import { moscowTodayIso, moscowTodayStart, moscowYearMonth } from "./dates";

describe("moscowToday — единая МСК-дата (UTC+3)", () => {
  // ─── ГЛАВНЫЙ РЕГРЕСС: граница суток ──────────────────────────────────
  // На проде (Vercel UTC) в 00:00–03:00 МСК прежняя реализация платежей
  // (локальная полночь сервера) показывала «вчера» и не считала просрочку.
  it("01:30 МСК = 22:30 UTC предыдущего дня → это уже СЛЕДУЮЩИЙ день по МСК", () => {
    // 22:30 UTC 15 января → 01:30 МСК 16 января.
    const utc = new Date("2026-01-15T22:30:00.000Z");
    expect(moscowTodayIso(utc)).toBe("2026-01-16");
  });

  it("сразу после полуночи МСK (21:00 UTC ровно) → новый день", () => {
    // 21:00 UTC = 00:00 МСК следующих суток.
    const utc = new Date("2026-01-15T21:00:00.000Z");
    expect(moscowTodayIso(utc)).toBe("2026-01-16");
  });

  it("за минуту до полуночи МСК (20:59 UTC) → ещё прежний день", () => {
    const utc = new Date("2026-01-15T20:59:00.000Z");
    expect(moscowTodayIso(utc)).toBe("2026-01-15");
  });

  it("moscowTodayStart — UTC-полночь того же МСК-дня", () => {
    const utc = new Date("2026-01-15T22:30:00.000Z");
    expect(moscowTodayStart(utc).toISOString()).toBe("2026-01-16T00:00:00.000Z");
  });

  it("moscowYearMonth — YYYYMM по МСК, учитывает перескок дня на границе месяца", () => {
    // 31 января 22:30 UTC → 1 февраля МСК.
    const utc = new Date("2026-01-31T22:30:00.000Z");
    expect(moscowYearMonth(utc)).toBe(202602);
  });
});
