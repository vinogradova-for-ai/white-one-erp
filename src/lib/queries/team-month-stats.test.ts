import { describe, it, expect } from "vitest";
import type { OrderStatus } from "@prisma/client";
import {
  statusAtLeast,
  moscowMonth,
  monthBounds,
  inMonth,
  clampMonth,
  shippedInMonth,
} from "./team-month-stats";

describe("statusAtLeast — порядок цикла", () => {
  it("READY_SHIP считается прошедшим ОТК (≥ READY_SHIP)", () => {
    expect(statusAtLeast("READY_SHIP", "READY_SHIP")).toBe(true);
    expect(statusAtLeast("IN_TRANSIT", "READY_SHIP")).toBe(true);
    expect(statusAtLeast("ON_SALE", "READY_SHIP")).toBe(true);
  });
  it("QC ещё НЕ прошёл ОТК", () => {
    expect(statusAtLeast("QC", "READY_SHIP")).toBe(false);
    expect(statusAtLeast("PREPARATION", "READY_SHIP")).toBe(false);
  });
  it("получено: только со склада МСК и дальше", () => {
    expect(statusAtLeast("WAREHOUSE_MSK", "WAREHOUSE_MSK")).toBe(true);
    expect(statusAtLeast("PACKING", "WAREHOUSE_MSK")).toBe(true);
    expect(statusAtLeast("IN_TRANSIT", "WAREHOUSE_MSK")).toBe(false);
  });
});

describe("monthBounds / inMonth — границы месяца по МСК", () => {
  it("июль 2026: старт 30.06 21:00 UTC, конец 31.07 21:00 UTC", () => {
    const { start, next } = monthBounds(202607);
    expect(start.toISOString()).toBe("2026-06-30T21:00:00.000Z");
    expect(next.toISOString()).toBe("2026-07-31T21:00:00.000Z");
  });
  it("полночь 1 июля по МСК (21:00 UTC 30.06) — уже июль", () => {
    const { start, next } = monthBounds(202607);
    expect(inMonth(new Date("2026-06-30T21:00:00.000Z"), start, next)).toBe(true);
    // За минуту до — ещё июнь.
    expect(inMonth(new Date("2026-06-30T20:59:00.000Z"), start, next)).toBe(false);
  });
  it("null-дата не в месяце", () => {
    const { start, next } = monthBounds(202607);
    expect(inMonth(null, start, next)).toBe(false);
    expect(inMonth(undefined, start, next)).toBe(false);
  });
});

describe("clampMonth — не листаем вперёд текущего", () => {
  it("будущий месяц зажимается к текущему", () => {
    expect(clampMonth(202612, 202607)).toBe(202607);
  });
  it("прошлый месяц проходит как есть", () => {
    expect(clampMonth(202605, 202607)).toBe(202605);
  });
  it("пусто/невалид → текущий", () => {
    expect(clampMonth(undefined, 202607)).toBe(202607);
    expect(clampMonth(0, 202607)).toBe(202607);
    expect(clampMonth(NaN, 202607)).toBe(202607);
  });
});

describe("moscowMonth", () => {
  it("МСК опережает UTC — 1 января 00:30 МСК всё ещё январь", () => {
    // 31 дек 21:30 UTC = 1 янв 00:30 МСК.
    expect(moscowMonth(new Date("2026-12-31T21:30:00.000Z"))).toBe(202701);
  });
});

describe("shippedInMonth — закон честности", () => {
  const { start, next } = monthBounds(202607);
  const log = (toStatus: OrderStatus, iso: string) => ({ toStatus, changedAt: new Date(iso) });

  it("лог IN_TRANSIT в месяце → отправлено", () => {
    expect(
      shippedInMonth(
        { status: "IN_TRANSIT", qcDate: null, readyAtFactoryDate: null, statusLogs: [log("IN_TRANSIT", "2026-07-10T08:00:00Z")] },
        start,
        next,
      ),
    ).toBe(true);
  });

  it("лог IN_TRANSIT в ДРУГОМ месяце → не отправлено в этом", () => {
    expect(
      shippedInMonth(
        { status: "WAREHOUSE_MSK", qcDate: new Date("2026-07-05T08:00:00Z"), readyAtFactoryDate: null, statusLogs: [log("IN_TRANSIT", "2026-08-02T08:00:00Z")] },
        start,
        next,
      ),
    ).toBe(false);
  });

  it("fallback: лога нет, статус ≥ IN_TRANSIT, qcDate в месяце → отправлено", () => {
    expect(
      shippedInMonth(
        { status: "IN_TRANSIT", qcDate: new Date("2026-07-15T08:00:00Z"), readyAtFactoryDate: null, statusLogs: [] },
        start,
        next,
      ),
    ).toBe(true);
  });

  it("fallback без ОТК: qcDate=null, берём readyAtFactoryDate", () => {
    expect(
      shippedInMonth(
        { status: "IN_TRANSIT", qcDate: null, readyAtFactoryDate: new Date("2026-07-15T08:00:00Z"), statusLogs: [] },
        start,
        next,
      ),
    ).toBe(true);
  });

  it("закон честности: статус НЕ дошёл до IN_TRANSIT → не отправлено, даже если qcDate в месяце", () => {
    expect(
      shippedInMonth(
        { status: "READY_SHIP", qcDate: new Date("2026-07-15T08:00:00Z"), readyAtFactoryDate: null, statusLogs: [] },
        start,
        next,
      ),
    ).toBe(false);
  });
});
