import { describe, it, expect } from "vitest";
import { applyDrag, type TimelinePhase, type DragGesture } from "@/lib/timeline-math";

// 4 фазы заказа: Разработка→Производство→ОТК→Доставка.
// startField есть только у первой фазы (decisionDate).
function orderPhases(): TimelinePhase[] {
  return [
    { key: "preparation", startField: "decisionDate",        endField: "handedToFactoryDate", startIso: "2026-01-01", endIso: "2026-01-15" },
    { key: "production",  endField: "readyAtFactoryDate",    startIso: "2026-01-15", endIso: "2026-02-19" },
    { key: "qc",          endField: "qcDate",                startIso: "2026-02-19", endIso: "2026-02-24" },
    { key: "shipping",    endField: "arrivalPlannedDate",    startIso: "2026-02-24", endIso: "2026-03-26" },
  ];
}

// 3 фазы упаковки без ОТК.
function packagingPhases(): TimelinePhase[] {
  return [
    { key: "development", startField: "decisionDate",     endField: "orderedDate",       startIso: "2026-02-01", endIso: "2026-02-08" },
    { key: "production",  endField: "productionEndDate",  startIso: "2026-02-08", endIso: "2026-03-01" },
    { key: "delivery",    endField: "expectedDate",       startIso: "2026-03-01", endIso: "2026-03-15" },
  ];
}

const drag = (phaseIndex: number, edge: "start" | "end", newIso: string): DragGesture =>
  ({ phaseIndex, edge, newIso });

describe("applyDrag — ◀ ПЕРВОЙ фазы меняет только startField, хвост стоит", () => {
  it("тянем старт Разработки назад — двигается только decisionDate", () => {
    const changes = applyDrag(orderPhases(), drag(0, "start", "2025-12-20"));
    expect(changes).toEqual([{ field: "decisionDate", newIso: "2025-12-20" }]);
  });

  it("тянем старт Разработки вперёд — тоже только decisionDate (даже если перевернёт фазу)", () => {
    const changes = applyDrag(orderPhases(), drag(0, "start", "2026-01-20"));
    expect(changes).toEqual([{ field: "decisionDate", newIso: "2026-01-20" }]);
  });

  it("нулевая дельта — пусто", () => {
    expect(applyDrag(orderPhases(), drag(0, "start", "2026-01-01"))).toEqual([]);
  });
});

describe("applyDrag — ▶ ЛЮБОЙ фазы: end фазы + каскад вправо с сохранением длительностей", () => {
  it("▶ Производства на +10 дн — двигает readyAtFactoryDate и хвост (qc, arrival) на +10", () => {
    const changes = applyDrag(orderPhases(), drag(1, "end", "2026-03-01")); // было 2026-02-19, +10
    expect(changes).toEqual([
      { field: "readyAtFactoryDate", newIso: "2026-03-01" },
      { field: "qcDate", newIso: "2026-03-06" },          // было 02-24, +10
      { field: "arrivalPlannedDate", newIso: "2026-04-05" }, // было 03-26, +10
    ]);
  });

  it("каскад сохраняет длительности фаз справа", () => {
    const phases = orderPhases();
    const changes = applyDrag(phases, drag(1, "end", "2026-03-01"));
    const byField = Object.fromEntries(changes.map((c) => [c.field, c.newIso]));
    // qc-длительность = ready→qc = 5 дн (было 02-19→02-24)
    const qcDur = (new Date(byField.qcDate).getTime() - new Date(byField.readyAtFactoryDate).getTime()) / 86400000;
    expect(qcDur).toBe(5);
    // ship-длительность = qc→arrival = 30 дн (было 02-24→03-26)
    const shipDur = (new Date(byField.arrivalPlannedDate).getTime() - new Date(byField.qcDate).getTime()) / 86400000;
    expect(shipDur).toBe(30);
  });

  it("▶ последней фазы (Доставка) двигает только её end, каскада нет", () => {
    const changes = applyDrag(orderPhases(), drag(3, "end", "2026-04-10"));
    expect(changes).toEqual([{ field: "arrivalPlannedDate", newIso: "2026-04-10" }]);
  });

  it("▶ первой фазы двигает её end и весь хвост", () => {
    const changes = applyDrag(orderPhases(), drag(0, "end", "2026-01-25")); // было 01-15, +10
    expect(changes.map((c) => c.field)).toEqual([
      "handedToFactoryDate", "readyAtFactoryDate", "qcDate", "arrivalPlannedDate",
    ]);
    expect(changes[0].newIso).toBe("2026-01-25");
    expect(changes[3].newIso).toBe("2026-04-05"); // arrival 03-26 +10
  });

  it("нулевая дельта на ▶ — пусто", () => {
    expect(applyDrag(orderPhases(), drag(1, "end", "2026-02-19"))).toEqual([]);
  });
});

describe("applyDrag — ◀ НЕ первой фазы N == ▶ фазы N−1", () => {
  it("◀ Производства эквивалентно ▶ Разработки", () => {
    const viaStart = applyDrag(orderPhases(), drag(1, "start", "2026-01-25"));
    const viaEnd = applyDrag(orderPhases(), drag(0, "end", "2026-01-25"));
    expect(viaStart).toEqual(viaEnd);
  });

  it("◀ ОТК (idx 2) двигает end Производства и хвост (qc, arrival)", () => {
    const changes = applyDrag(orderPhases(), drag(2, "start", "2026-02-25")); // ready было 02-19, +6
    expect(changes).toEqual([
      { field: "readyAtFactoryDate", newIso: "2026-02-25" },
      { field: "qcDate", newIso: "2026-03-02" },          // 02-24 +6
      { field: "arrivalPlannedDate", newIso: "2026-04-01" }, // 03-26 +6
    ]);
  });
});

describe("applyDrag — дельта в прошлое (без клампов)", () => {
  it("▶ Производства в прошлое утаскивает end и хвост влево", () => {
    const changes = applyDrag(orderPhases(), drag(1, "end", "2026-02-09")); // 02-19 −10
    expect(changes).toEqual([
      { field: "readyAtFactoryDate", newIso: "2026-02-09" },
      { field: "qcDate", newIso: "2026-02-14" },
      { field: "arrivalPlannedDate", newIso: "2026-03-16" },
    ]);
  });

  it("◀ первой фазы можно утащить далеко в прошлое", () => {
    const changes = applyDrag(orderPhases(), drag(0, "start", "2024-06-01"));
    expect(changes).toEqual([{ field: "decisionDate", newIso: "2024-06-01" }]);
  });
});

describe("applyDrag — нулевые/перевёрнутые фазы разрешены (Алёна поправит)", () => {
  it("▶ можно уволочь end левее start своей же фазы (фаза переворачивается)", () => {
    const changes = applyDrag(orderPhases(), drag(1, "end", "2026-01-10")); // левее start 01-15
    expect(changes[0]).toEqual({ field: "readyAtFactoryDate", newIso: "2026-01-10" });
    // хвост тоже уехал, каскад отработал без ограничений
    expect(changes.length).toBe(3);
  });

  it("нулевая фаза: end совпал со start — разрешено", () => {
    const changes = applyDrag(orderPhases(), drag(2, "end", "2026-02-19")); // qc end = его start
    expect(changes[0]).toEqual({ field: "qcDate", newIso: "2026-02-19" });
  });
});

describe("applyDrag — упаковка (3 фазы, без ОТК)", () => {
  it("◀ Производства двигает end Разработки (orderedDate) и хвост", () => {
    const changes = applyDrag(packagingPhases(), drag(1, "start", "2026-02-12")); // ordered 02-08 +4
    expect(changes).toEqual([
      { field: "orderedDate", newIso: "2026-02-12" },
      { field: "productionEndDate", newIso: "2026-03-05" }, // 03-01 +4
      { field: "expectedDate", newIso: "2026-03-19" },      // 03-15 +4
    ]);
  });

  it("▶ Доставки двигает только expectedDate", () => {
    const changes = applyDrag(packagingPhases(), drag(2, "end", "2026-03-20"));
    expect(changes).toEqual([{ field: "expectedDate", newIso: "2026-03-20" }]);
  });

  it("◀ первой фазы упаковки — только startField", () => {
    const changes = applyDrag(packagingPhases(), drag(0, "start", "2026-01-25"));
    expect(changes).toEqual([{ field: "decisionDate", newIso: "2026-01-25" }]);
  });
});

describe("applyDrag — граничные случаи", () => {
  it("невалидный phaseIndex — пусто", () => {
    expect(applyDrag(orderPhases(), drag(99, "end", "2026-05-01"))).toEqual([]);
    expect(applyDrag(orderPhases(), drag(-1, "end", "2026-05-01"))).toEqual([]);
  });

  it("◀ первой фазы без startField — пусто", () => {
    const phases: TimelinePhase[] = [
      { key: "a", endField: "endA", startIso: "2026-01-01", endIso: "2026-01-10" },
    ];
    expect(applyDrag(phases, drag(0, "start", "2025-12-01"))).toEqual([]);
  });
});
