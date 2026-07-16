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

// ГАНТ ПЕРВИЧЕН (Алёна 05.07.2026): колонка «после заказа» — по датам Ганта,
// не по ручному статусу. Девочки двигают Гант; статусы руками не отмечают.
import { orderKanbanColumnByDates } from "@/lib/order-stage";

describe("orderKanbanColumnByDates — колонка по датам Ганта", () => {
  const d = (s: string | null) => (s ? new Date(`${s}T00:00:00Z`) : null);
  const dates = (handed: string | null, ready: string | null, qc: string | null) => ({
    handedToFactoryDate: d(handed),
    readyAtFactoryDate: d(ready),
    qcDate: d(qc),
  });
  const TODAY = "2026-07-06";

  it("до передачи на фабрику (или дата пустая) → null: карточка в колонках разработки", () => {
    expect(orderKanbanColumnByDates(dates(null, null, null), TODAY)).toBeNull();
    expect(orderKanbanColumnByDates(dates("2026-07-10", null, null), TODAY)).toBeNull();
  });

  it("сегодня между передачей на фабрику и готовностью → Производство", () => {
    expect(orderKanbanColumnByDates(dates("2026-06-01", "2026-08-01", "2026-08-05"), TODAY)).toBe("production");
    // Конец производства не проставлен — шьют, пока не проставят.
    expect(orderKanbanColumnByDates(dates("2026-06-01", null, null), TODAY)).toBe("production");
  });

  it("сегодня между готовностью и концом ОТК → ОТК", () => {
    expect(orderKanbanColumnByDates(dates("2026-06-01", "2026-07-03", "2026-07-08"), TODAY)).toBe("qc");
    // Конец ОТК не проставлен — заказ в ОТК, пока не проставят.
    expect(orderKanbanColumnByDates(dates("2026-06-01", "2026-07-03", null), TODAY)).toBe("qc");
  });

  it("сегодня после конца ОТК → Доставка (и остаётся там до приёмки складом)", () => {
    expect(orderKanbanColumnByDates(dates("2026-05-01", "2026-06-01", "2026-06-05"), TODAY)).toBe("delivery");
  });

  it("границы: день начала фазы уже относится к этой фазе", () => {
    expect(orderKanbanColumnByDates(dates(TODAY, null, null), TODAY)).toBe("production");
    expect(orderKanbanColumnByDates(dates("2026-06-01", TODAY, null), TODAY)).toBe("qc");
    expect(orderKanbanColumnByDates(dates("2026-06-01", "2026-07-01", TODAY), TODAY)).toBe("delivery");
  });
});
