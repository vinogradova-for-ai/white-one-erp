import { describe, it, expect } from "vitest";
import type { OrderStatus } from "@prisma/client";
import {
  orderPhase,
  orderActivePhaseIndex,
  orderKanbanColumn,
  ORDER_GANTT_PHASES,
  ORDER_CREATE_STAGES,
  ORDER_STATUS_VALUES,
} from "@/lib/order-stage";

// Все статусы заказа (тот же список, что в схеме Prisma).
const ALL_STATUSES = ORDER_STATUS_VALUES as readonly OrderStatus[];

describe("order-stage — единый источник правды об этапе", () => {
  describe("orderPhase", () => {
    const cases: Array<[OrderStatus, ReturnType<typeof orderPhase>]> = [
      ["PREPARATION", "preparation"],
      ["FABRIC_ORDERED", "preparation"], // ткань заказана, но пошив не начат
      ["SEWING", "production"],
      ["QC", "qc"],
      ["READY_SHIP", "qc"],
      ["IN_TRANSIT", "shipping"],
      ["WAREHOUSE_MSK", "done"],
      ["PACKING", "done"],
      ["SHIPPED_WB", "done"],
      ["ON_SALE", "done"],
    ];
    it.each(cases)("%s → %s", (status, phase) => {
      expect(orderPhase(status)).toBe(phase);
    });
  });

  describe("orderActivePhaseIndex согласован с orderPhase", () => {
    it.each(ALL_STATUSES)("%s: индекс активной фазы = позиция фазы (или -1 для done)", (status) => {
      const phase = orderPhase(status);
      const idx = orderActivePhaseIndex(status);
      if (phase === "done") {
        expect(idx).toBe(-1);
      } else {
        expect(idx).toBe((ORDER_GANTT_PHASES as readonly string[]).indexOf(phase));
      }
    });
  });

  // ─── ГЛАВНЫЙ ИНВАРИАНТ ───────────────────────────────────────────────
  // Канбан (колонка) и Гант (активная фаза) обязаны описывать ОДИН и тот же
  // этап для каждого статуса. Раньше расходились: SEWING давал колонку
  // «Производство», а Гант рисовал «Разработку» (битый словарь doneAt).
  describe("колонка канбана и фаза Ганта НЕ расходятся", () => {
    // Перевод активной фазы Ганта в колонку канбана.
    function ganttColumnOf(status: OrderStatus): "production" | "qc" | "delivery" | "done" | null {
      const idx = orderActivePhaseIndex(status);
      if (idx === -1) return "done";
      const phase = ORDER_GANTT_PHASES[idx];
      switch (phase) {
        case "preparation": return null; // остаётся в колонке разработки фасона
        case "production": return "production";
        case "qc": return "qc";
        case "shipping": return "delivery";
      }
    }

    it.each(ALL_STATUSES)("%s: Гант и канбан показывают одинаковый этап", (status) => {
      expect(ganttColumnOf(status)).toBe(orderKanbanColumn(status));
    });
  });

  describe("регрессия исходного бага", () => {
    it("SEWING — это Производство в обоих видах, НЕ Разработка", () => {
      expect(orderKanbanColumn("SEWING")).toBe("production");
      expect(orderPhase("SEWING")).toBe("production");
      // Активная фаза Ганта — не «Разработка» (индекс 0).
      expect(orderActivePhaseIndex("SEWING")).toBe(1);
    });

    it("ни один валидный статус не использует несуществующий IN_PRODUCTION", () => {
      // IN_PRODUCTION — статус УПАКОВКИ, у заказа его нет. Раньше он торчал в
      // doneAt Ганта. Проверяем, что его нет в списке статусов заказа.
      expect(ORDER_STATUS_VALUES).not.toContain("IN_PRODUCTION");
    });
  });

  describe("orderKanbanColumn", () => {
    it("фаза Разработка → null (карточка по стадии фасона)", () => {
      expect(orderKanbanColumn("PREPARATION")).toBeNull();
      expect(orderKanbanColumn("FABRIC_ORDERED")).toBeNull();
    });
    it("завершённые статусы → done", () => {
      expect(orderKanbanColumn("WAREHOUSE_MSK")).toBe("done");
      expect(orderKanbanColumn("ON_SALE")).toBe("done");
    });
  });

  describe("ORDER_CREATE_STAGES — выбор этапа при создании", () => {
    it("5 этапов = 5 колонок канбана, без дублей", () => {
      expect(ORDER_CREATE_STAGES).toHaveLength(5);
      const labels = ORDER_CREATE_STAGES.map((s) => s.label);
      expect(labels).toEqual(["Разработка", "Производство", "ОТК", "Доставка", "Завершено"]);
    });
    it("каждый этап создания — валидный статус заказа", () => {
      for (const s of ORDER_CREATE_STAGES) {
        expect(ORDER_STATUS_VALUES).toContain(s.value);
      }
    });
  });
});
