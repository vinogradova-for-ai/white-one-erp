import { describe, it, expect } from "vitest";
import { PackagingItemStatus } from "@prisma/client";
import {
  PACKAGING_TRANSITIONS,
  PACKAGING_DATE_ON_STATUS,
  PACKAGING_STATUS_LABELS,
  PACKAGING_STATUS_COLORS,
  PACKAGING_USER_STATUSES,
} from "@/lib/status-machine/packaging-statuses";

// REGRESSION-тесты на справочник статусов упаковки (packaging-statuses.ts).
//
// Модуль состоит только из чистых данных-констант (переходы, поля дат,
// UI-лейблы, цвета, разрешённые в селекторе статусы). Функций нет.
// Цель — зафиксировать ТЕКУЩЕЕ поведение, чтобы рефактор не сломал
// обратную совместимость со старыми статусами IDEA/DESIGN/SAMPLE/APPROVED.

// Полный список значений enum PackagingItemStatus (по prisma/schema.prisma).
const ALL_STATUSES: PackagingItemStatus[] = [
  "IDEA",
  "DESIGN",
  "SAMPLE",
  "APPROVED",
  "ACTIVE",
  "ARCHIVED",
];

// Старые (deprecated) статусы разработки, которые мапятся к «В работе».
const LEGACY_DEV_STATUSES: PackagingItemStatus[] = [
  "IDEA",
  "DESIGN",
  "SAMPLE",
  "APPROVED",
];

describe("packaging-statuses · набор значений enum", () => {
  it("тестовый список ALL_STATUSES совпадает с ключами карты переходов", () => {
    // Защита самих тестов: если в enum добавят статус, карта переходов
    // должна получить ключ, и этот тест подскажет, что тесты устарели.
    expect(Object.keys(PACKAGING_TRANSITIONS).sort()).toEqual(
      [...ALL_STATUSES].sort(),
    );
  });
});

describe("PACKAGING_TRANSITIONS · разрешённые переходы", () => {
  it("точный снимок всей карты переходов", () => {
    expect(PACKAGING_TRANSITIONS).toEqual({
      IDEA: ["ACTIVE"],
      DESIGN: ["ACTIVE"],
      SAMPLE: ["ACTIVE"],
      APPROVED: ["ACTIVE"],
      ACTIVE: ["ARCHIVED"],
      ARCHIVED: ["ACTIVE"],
    });
  });

  it("ACTIVE переходит только в ARCHIVED", () => {
    expect(PACKAGING_TRANSITIONS.ACTIVE).toEqual(["ARCHIVED"]);
  });

  it("ARCHIVED можно вернуть в ACTIVE (разархивация)", () => {
    expect(PACKAGING_TRANSITIONS.ARCHIVED).toEqual(["ACTIVE"]);
  });

  it("ACTIVE ↔ ARCHIVED образуют замкнутый цикл", () => {
    expect(PACKAGING_TRANSITIONS.ACTIVE).toContain("ARCHIVED");
    expect(PACKAGING_TRANSITIONS.ARCHIVED).toContain("ACTIVE");
  });

  it("все старые статусы разработки ведут ровно в ACTIVE", () => {
    for (const s of LEGACY_DEV_STATUSES) {
      expect(PACKAGING_TRANSITIONS[s]).toEqual(["ACTIVE"]);
    }
  });

  it("каждый статус имеет массив-значение (включая возможный пустой)", () => {
    for (const s of ALL_STATUSES) {
      expect(Array.isArray(PACKAGING_TRANSITIONS[s])).toBe(true);
    }
  });

  it("ни один статус не разрешает переход сам в себя", () => {
    for (const s of ALL_STATUSES) {
      expect(PACKAGING_TRANSITIONS[s]).not.toContain(s);
    }
  });

  it("все целевые статусы переходов — валидные значения enum", () => {
    for (const targets of Object.values(PACKAGING_TRANSITIONS)) {
      for (const t of targets) {
        expect(ALL_STATUSES).toContain(t);
      }
    }
  });

  it("из любого статуса есть хотя бы один доступный переход (тупиков нет)", () => {
    for (const s of ALL_STATUSES) {
      expect(PACKAGING_TRANSITIONS[s].length).toBeGreaterThan(0);
    }
  });

  it("неизвестный/несуществующий статус даёт undefined по карте переходов", () => {
    // граница: запрос отсутствующего ключа не бросает, а возвращает undefined
    const bogus = "NOPE" as unknown as PackagingItemStatus;
    expect(PACKAGING_TRANSITIONS[bogus]).toBeUndefined();
  });
});

describe("PACKAGING_DATE_ON_STATUS · авто-поле даты при переходе", () => {
  it("точный снимок карты полей дат", () => {
    expect(PACKAGING_DATE_ON_STATUS).toEqual({
      ACTIVE: "productionStartDate",
    });
  });

  it("при переходе в ACTIVE проставляется productionStartDate", () => {
    expect(PACKAGING_DATE_ON_STATUS.ACTIVE).toBe("productionStartDate");
  });

  it("ARCHIVED не имеет привязанного поля даты", () => {
    expect(PACKAGING_DATE_ON_STATUS.ARCHIVED).toBeUndefined();
  });

  it("старые статусы разработки не имеют привязанного поля даты", () => {
    for (const s of LEGACY_DEV_STATUSES) {
      expect(PACKAGING_DATE_ON_STATUS[s]).toBeUndefined();
    }
  });

  it("ACTIVE — единственный ключ с полем даты", () => {
    expect(Object.keys(PACKAGING_DATE_ON_STATUS)).toEqual(["ACTIVE"]);
  });
});

describe("PACKAGING_STATUS_LABELS · UI-лейблы (обратная совместимость)", () => {
  it("точный снимок всех лейблов", () => {
    expect(PACKAGING_STATUS_LABELS).toEqual({
      IDEA: "В работе",
      DESIGN: "В работе",
      SAMPLE: "В работе",
      APPROVED: "В работе",
      ACTIVE: "В работе",
      ARCHIVED: "В архиве",
    });
  });

  it("каждый статус enum имеет лейбл", () => {
    for (const s of ALL_STATUSES) {
      expect(typeof PACKAGING_STATUS_LABELS[s]).toBe("string");
      expect(PACKAGING_STATUS_LABELS[s].length).toBeGreaterThan(0);
    }
  });

  it("все статусы кроме ARCHIVED показываются как «В работе»", () => {
    for (const s of ALL_STATUSES) {
      if (s === "ARCHIVED") continue;
      expect(PACKAGING_STATUS_LABELS[s]).toBe("В работе");
    }
  });

  it("старые статусы разработки маскируются под «В работе»", () => {
    for (const s of LEGACY_DEV_STATUSES) {
      expect(PACKAGING_STATUS_LABELS[s]).toBe("В работе");
    }
  });

  it("ARCHIVED показывается как «В архиве»", () => {
    expect(PACKAGING_STATUS_LABELS.ARCHIVED).toBe("В архиве");
  });

  it("используется ровно два различных лейбла", () => {
    const distinct = new Set(Object.values(PACKAGING_STATUS_LABELS));
    expect(distinct).toEqual(new Set(["В работе", "В архиве"]));
  });
});

describe("PACKAGING_STATUS_COLORS · цветовые классы", () => {
  it("точный снимок всех цветов", () => {
    expect(PACKAGING_STATUS_COLORS).toEqual({
      IDEA: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
      DESIGN: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
      SAMPLE: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
      APPROVED: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
      ACTIVE: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
      ARCHIVED: "bg-slate-100 text-slate-500",
    });
  });

  it("каждый статус enum имеет цвет", () => {
    for (const s of ALL_STATUSES) {
      expect(typeof PACKAGING_STATUS_COLORS[s]).toBe("string");
      expect(PACKAGING_STATUS_COLORS[s].length).toBeGreaterThan(0);
    }
  });

  it("все «рабочие» статусы окрашены изумрудным", () => {
    for (const s of ALL_STATUSES) {
      if (s === "ARCHIVED") continue;
      expect(PACKAGING_STATUS_COLORS[s]).toBe("bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300");
    }
  });

  it("ARCHIVED окрашен приглушённым серым (slate)", () => {
    expect(PACKAGING_STATUS_COLORS.ARCHIVED).toBe("bg-slate-100 text-slate-500");
  });

  it("используется ровно две цветовые палитры", () => {
    const distinct = new Set(Object.values(PACKAGING_STATUS_COLORS));
    expect(distinct.size).toBe(2);
  });
});

describe("PACKAGING_USER_STATUSES · статусы доступные в селекторе", () => {
  it("точный снимок списка пользовательских статусов", () => {
    expect(PACKAGING_USER_STATUSES).toEqual(["ACTIVE", "ARCHIVED"]);
  });

  it("содержит только ACTIVE и ARCHIVED", () => {
    expect(PACKAGING_USER_STATUSES).toContain("ACTIVE");
    expect(PACKAGING_USER_STATUSES).toContain("ARCHIVED");
    expect(PACKAGING_USER_STATUSES).toHaveLength(2);
  });

  it("ни один из старых статусов разработки не доступен в селекторе", () => {
    for (const s of LEGACY_DEV_STATUSES) {
      expect(PACKAGING_USER_STATUSES).not.toContain(s);
    }
  });

  it("все пользовательские статусы — валидные значения enum", () => {
    for (const s of PACKAGING_USER_STATUSES) {
      expect(ALL_STATUSES).toContain(s);
    }
  });

  it("каждый пользовательский статус имеет лейбл и цвет", () => {
    for (const s of PACKAGING_USER_STATUSES) {
      expect(PACKAGING_STATUS_LABELS[s]).toBeTruthy();
      expect(PACKAGING_STATUS_COLORS[s]).toBeTruthy();
    }
  });
});

describe("packaging-statuses · сквозные инварианты согласованности", () => {
  it("карты labels, colors и transitions покрывают одинаковый набор ключей", () => {
    const labelKeys = Object.keys(PACKAGING_STATUS_LABELS).sort();
    const colorKeys = Object.keys(PACKAGING_STATUS_COLORS).sort();
    const transKeys = Object.keys(PACKAGING_TRANSITIONS).sort();
    expect(labelKeys).toEqual(transKeys);
    expect(colorKeys).toEqual(transKeys);
  });
});
