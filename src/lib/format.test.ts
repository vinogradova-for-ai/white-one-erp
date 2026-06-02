import { describe, it, expect } from "vitest";
import dayjs from "dayjs";
import {
  formatDate,
  formatDateTime,
  formatRelative,
  formatCurrency,
  formatNumber,
  formatPercent,
  yearMonthToLabel,
  daysUntil,
} from "@/lib/format";

// Intl.NumberFormat("ru-RU") использует НЕРАЗРЫВНЫЙ пробел (U+00A0)
// как разделитель групп разрядов, перед символом валюты и перед знаком %.
// Минус — обычный ASCII-дефис (U+002D). Фиксируем это явно, чтобы
// регрессия по разделителям ловилась тестами.
const NBSP = String.fromCharCode(0x00a0);

describe("formatDate", () => {
  it("форматирует валидную дату в DD.MM.YYYY (МСК)", () => {
    expect(formatDate(new Date("2026-01-15T00:00:00Z"))).toBe("15.01.2026");
  });

  it("принимает ISO-строку", () => {
    expect(formatDate("2026-06-02T00:00:00Z")).toBe("02.06.2026");
  });

  it("сдвигает дату в МСК (+3): 22:30 UTC попадает на следующий день", () => {
    expect(formatDate(new Date("2026-01-15T22:30:00Z"))).toBe("16.01.2026");
  });

  it("возвращает «—» для null", () => {
    expect(formatDate(null)).toBe("—");
  });

  it("возвращает «—» для undefined", () => {
    expect(formatDate(undefined)).toBe("—");
  });

  it("возвращает «—» для пустой строки", () => {
    expect(formatDate("")).toBe("—");
  });

  it("для невалидной строки возвращает «—»", () => {
    expect(formatDate("not-a-date")).toBe("—");
  });
});

describe("formatDateTime", () => {
  it("форматирует дату и время в DD.MM.YYYY HH:mm (МСК +3)", () => {
    expect(formatDateTime(new Date("2026-01-15T07:05:00Z"))).toBe(
      "15.01.2026 10:05",
    );
  });

  it("полночь UTC отображается как 03:00 МСК", () => {
    expect(formatDateTime(new Date("2026-01-15T00:00:00Z"))).toBe(
      "15.01.2026 03:00",
    );
  });

  it("принимает ISO-строку", () => {
    expect(formatDateTime("2026-12-31T20:59:00Z")).toBe("31.12.2026 23:59");
  });

  it("возвращает «—» для null/undefined/пустой строки", () => {
    expect(formatDateTime(null)).toBe("—");
    expect(formatDateTime(undefined)).toBe("—");
    expect(formatDateTime("")).toBe("—");
  });

  it("для невалидной строки возвращает «—»", () => {
    expect(formatDateTime("xxx")).toBe("—");
  });
});

describe("formatRelative", () => {
  it("возвращает «—» для null/undefined/пустой строки", () => {
    expect(formatRelative(null)).toBe("—");
    expect(formatRelative(undefined)).toBe("—");
    expect(formatRelative("")).toBe("—");
  });

  it("давнее прошлое описывается через «назад»", () => {
    const farPast = dayjs().subtract(10, "year").toISOString();
    expect(formatRelative(farPast)).toContain("назад");
  });

  it("далёкое будущее описывается через «через»", () => {
    const farFuture = dayjs().add(10, "year").toISOString();
    expect(formatRelative(farFuture)).toContain("через");
  });

  it("для невалидной даты возвращает «—»", () => {
    expect(formatRelative("not-a-date")).toBe("—");
  });
});

describe("formatCurrency", () => {
  it("по умолчанию форматирует в рублях без дробной части", () => {
    expect(formatCurrency(1234567)).toBe(`1${NBSP}234${NBSP}567${NBSP}₽`);
  });

  it("ноль форматируется как «0 ₽»", () => {
    expect(formatCurrency(0)).toBe(`0${NBSP}₽`);
  });

  it("отрицательная сумма использует ASCII-минус", () => {
    expect(formatCurrency(-500)).toBe(`-500${NBSP}₽`);
  });

  it("большие числа разбиваются по разрядам", () => {
    expect(formatCurrency(1000000000)).toBe(
      `1${NBSP}000${NBSP}000${NBSP}000${NBSP}₽`,
    );
  });

  it("CNY даёт символ «CN¥»", () => {
    expect(formatCurrency(1000, { currency: "CNY" })).toBe(
      `1${NBSP}000${NBSP}CN¥`,
    );
  });

  it("уважает maximumFractionDigits и округляет (банковское округление Intl)", () => {
    expect(formatCurrency(1234.56, { maximumFractionDigits: 2 })).toBe(
      `1${NBSP}234,56${NBSP}₽`,
    );
  });

  it("по умолчанию (0 знаков) округляет дробь до целого", () => {
    expect(formatCurrency(1234.56)).toBe(`1${NBSP}235${NBSP}₽`);
  });

  it("принимает числовую строку", () => {
    expect(formatCurrency("2500")).toBe(`2${NBSP}500${NBSP}₽`);
  });

  it("возвращает «—» для null/undefined/пустой строки", () => {
    expect(formatCurrency(null)).toBe("—");
    expect(formatCurrency(undefined)).toBe("—");
    expect(formatCurrency("")).toBe("—");
  });

  it("возвращает «—» для нечисловой строки", () => {
    expect(formatCurrency("abc")).toBe("—");
  });

  it("возвращает «—» для NaN и Infinity", () => {
    expect(formatCurrency(NaN)).toBe("—");
    expect(formatCurrency(Infinity)).toBe("—");
  });
});

describe("formatNumber", () => {
  it("по умолчанию форматирует целое с разрядами без дробной части", () => {
    expect(formatNumber(1234567)).toBe(`1${NBSP}234${NBSP}567`);
  });

  it("ноль форматируется как «0»", () => {
    expect(formatNumber(0)).toBe("0");
  });

  it("отрицательное число", () => {
    expect(formatNumber(-42)).toBe("-42");
  });

  it("округляет до целого при digits=0 по умолчанию", () => {
    expect(formatNumber(1234.567)).toBe(`1${NBSP}235`);
  });

  it("уважает заданное число знаков после запятой", () => {
    expect(formatNumber(1234.567, 2)).toBe(`1${NBSP}234,57`);
  });

  it("принимает числовую строку", () => {
    expect(formatNumber("9999")).toBe(`9${NBSP}999`);
  });

  it("возвращает «—» для null/undefined/пустой строки", () => {
    expect(formatNumber(null)).toBe("—");
    expect(formatNumber(undefined)).toBe("—");
    expect(formatNumber("")).toBe("—");
  });

  it("возвращает «—» для нечисловой строки, NaN, Infinity", () => {
    expect(formatNumber("abc")).toBe("—");
    expect(formatNumber(NaN)).toBe("—");
    expect(formatNumber(Infinity)).toBe("—");
  });
});

describe("formatPercent", () => {
  it("делит на 100 и добавляет знак процента (1 знак по умолчанию)", () => {
    expect(formatPercent(26)).toBe(`26${NBSP}%`);
  });

  it("показывает один знак после запятой при необходимости", () => {
    expect(formatPercent(33.333)).toBe(`33,3${NBSP}%`);
  });

  it("ноль процентов", () => {
    expect(formatPercent(0)).toBe(`0${NBSP}%`);
  });

  it("KPI ДРР ≤4%", () => {
    expect(formatPercent(4)).toBe(`4${NBSP}%`);
  });

  it("округляет при digits=0", () => {
    expect(formatPercent(26.6, 0)).toBe(`27${NBSP}%`);
  });

  it("отрицательный процент", () => {
    expect(formatPercent(-5)).toBe(`-5${NBSP}%`);
  });

  it("принимает числовую строку", () => {
    expect(formatPercent("50")).toBe(`50${NBSP}%`);
  });

  it("возвращает «—» для null/undefined/пустой строки", () => {
    expect(formatPercent(null)).toBe("—");
    expect(formatPercent(undefined)).toBe("—");
    expect(formatPercent("")).toBe("—");
  });

  it("возвращает «—» для нечисловой строки, NaN, Infinity", () => {
    expect(formatPercent("abc")).toBe("—");
    expect(formatPercent(NaN)).toBe("—");
    expect(formatPercent(Infinity)).toBe("—");
  });
});

describe("yearMonthToLabel", () => {
  it("январь 2026 из 202601", () => {
    expect(yearMonthToLabel(202601)).toBe("январь 2026");
  });

  it("декабрь 2026 из 202612", () => {
    expect(yearMonthToLabel(202612)).toBe("декабрь 2026");
  });

  it("июнь 2026 из 202606", () => {
    expect(yearMonthToLabel(202606)).toBe("июнь 2026");
  });

  it("мусорный месяц (m=0 / m>12) возвращает «—», а не съезжает на другой год", () => {
    expect(yearMonthToLabel(202600)).toBe("—");
    expect(yearMonthToLabel(202613)).toBe("—");
  });
});

describe("daysUntil", () => {
  it("возвращает null для null/undefined/пустой строки", () => {
    expect(daysUntil(null)).toBeNull();
    expect(daysUntil(undefined)).toBeNull();
    expect(daysUntil("")).toBeNull();
  });

  it("для сегодняшней даты возвращает 0 (внутри использует системное время)", () => {
    // ФУНКЦИЯ БЕЗ ПАРАМЕТРА today: внутри берёт dayjs() (текущее системное
    // время). Тестируем только детерминированную часть — сравнение с
    // «сейчас», нормализованным к началу дня.
    expect(daysUntil(new Date())).toBe(0);
  });

  it("далёкое будущее даёт большое положительное число", () => {
    const result = daysUntil(dayjs().add(10, "year").toISOString());
    expect(result).not.toBeNull();
    expect(result as number).toBeGreaterThan(3000);
  });

  it("далёкое прошлое даёт большое отрицательное число", () => {
    const result = daysUntil(dayjs().subtract(10, "year").toISOString());
    expect(result).not.toBeNull();
    expect(result as number).toBeLessThan(-3000);
  });

  it("для невалидной даты возвращает null", () => {
    expect(daysUntil("not-a-date")).toBeNull();
  });
});
