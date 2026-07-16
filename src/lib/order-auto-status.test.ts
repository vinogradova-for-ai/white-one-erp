import { describe, it, expect } from "vitest";
import { computeOrderStatus, orderLateDays } from "@/lib/order-auto-status";

// REGRESSION-тесты на computeOrderStatus.
//
// ВАЖНО: функция внутри сама берёт системное время (new Date()) — параметра
// today нет. Поэтому все кейсы строятся детерминированно через БОЛЬШИЕ
// смещения относительно текущего дня: «далёкое прошлое» (~ -10000 дней) гарантированно
// <= today, «далёкое будущее» (~ +10000 дней) гарантированно > today.
// Это покрывает все ветки без зависимости от конкретной даты запуска тестов.

const DAY_MS = 24 * 60 * 60 * 1000;
// today внутри функции нормализуется до начала UTC-суток (setUTCHours(0,0,0,0)).
const todayMidnightUTC = (() => {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
})();

/** Дата на N суток в прошлом относительно нормализованного «сегодня» (гарантированно < today). */
function daysAgo(n: number): Date {
  return new Date(todayMidnightUTC.getTime() - n * DAY_MS);
}
/** Дата на N суток в будущем относительно нормализованного «сегодня» (гарантированно > today). */
function daysAhead(n: number): Date {
  return new Date(todayMidnightUTC.getTime() + n * DAY_MS);
}

const FAR_PAST = 10000; // ~27 лет назад
const FAR_FUTURE = 10000; // ~27 лет вперёд

/** Полностью пустой набор дат. */
function emptyDates() {
  return {
    readyAtFactoryDate: null as Date | null,
    qcDate: null as Date | null,
    arrivalPlannedDate: null as Date | null,
    arrivalActualDate: null as Date | null,
  };
}

describe("computeOrderStatus", () => {
  describe("PREPARATION — нет ни одной даты", () => {
    it("все даты null → PREPARATION", () => {
      expect(computeOrderStatus(emptyDates())).toBe("PREPARATION");
    });
  });

  describe("WAREHOUSE_MSK — приоритет 1: arrivalActualDate <= today", () => {
    it("фактическая дата прибытия в прошлом → WAREHOUSE_MSK", () => {
      expect(
        computeOrderStatus({
          ...emptyDates(),
          arrivalActualDate: daysAgo(FAR_PAST),
        }),
      ).toBe("WAREHOUSE_MSK");
    });

    it("arrivalActualDate ровно сегодня (начало UTC-суток) → WAREHOUSE_MSK (граница <=)", () => {
      // Сравнение строго <= today, где today = начало UTC-суток.
      expect(
        computeOrderStatus({
          ...emptyDates(),
          arrivalActualDate: new Date(todayMidnightUTC.getTime()),
        }),
      ).toBe("WAREHOUSE_MSK");
    });

    it("arrivalActualDate в далёком будущем — ветка не срабатывает, падаем в SEWING (есть прочие даты)", () => {
      // arrivalActualDate сама по себе НЕ удерживает в SEWING (её нет в последнем if),
      // поэтому добавляем readyAtFactoryDate в будущем, чтобы получить SEWING.
      expect(
        computeOrderStatus({
          ...emptyDates(),
          arrivalActualDate: daysAhead(FAR_FUTURE),
          readyAtFactoryDate: daysAhead(FAR_FUTURE),
        }),
      ).toBe("SEWING");
    });

    it("фактическое прибытие перекрывает любые другие прошлые даты (приоритет 1)", () => {
      expect(
        computeOrderStatus({
          readyAtFactoryDate: daysAgo(FAR_PAST),
          qcDate: daysAgo(FAR_PAST),
          arrivalPlannedDate: daysAgo(FAR_PAST),
          arrivalActualDate: daysAgo(FAR_PAST),
        }),
      ).toBe("WAREHOUSE_MSK");
    });

    it("arrivalActualDate в будущем, arrivalPlannedDate в прошлом → SEWING (план НЕ двигает статус)", () => {
      // Аудит п.6: прошедший ПЛАН больше не даёт WAREHOUSE_MSK. actual в будущем
      // не считается достигнутым → падаем в SEWING (arrivalPlannedDate присутствует).
      expect(
        computeOrderStatus({
          ...emptyDates(),
          arrivalActualDate: daysAhead(FAR_FUTURE),
          arrivalPlannedDate: daysAgo(FAR_PAST),
        }),
      ).toBe("SEWING");
    });
  });

  describe("Прошедший ПЛАН прибытия НЕ двигает статус (аудит п.6)", () => {
    it("плановая дата прибытия в прошлом, фактической нет, прочего нет → SEWING (НЕ WAREHOUSE)", () => {
      // Раньше эта ветка давала WAREHOUSE_MSK («по плану должен прибыть»). Убрана.
      expect(
        computeOrderStatus({
          ...emptyDates(),
          arrivalPlannedDate: daysAgo(FAR_PAST),
        }),
      ).toBe("SEWING");
    });

    it("arrivalPlannedDate ровно today, без прочих дат → SEWING", () => {
      expect(
        computeOrderStatus({
          ...emptyDates(),
          arrivalPlannedDate: new Date(todayMidnightUTC.getTime()),
        }),
      ).toBe("SEWING");
    });

    it("arrivalPlannedDate в будущем + readyAtFactory в будущем → SEWING (план ещё не наступил)", () => {
      expect(
        computeOrderStatus({
          ...emptyDates(),
          arrivalPlannedDate: daysAhead(FAR_FUTURE),
          readyAtFactoryDate: daysAhead(FAR_FUTURE),
        }),
      ).toBe("SEWING");
    });

    it("план прибытия в прошлом + qc/ready в прошлом → IN_TRANSIT (qc выигрывает, план игнорируется)", () => {
      expect(
        computeOrderStatus({
          ...emptyDates(),
          arrivalPlannedDate: daysAgo(FAR_PAST),
          qcDate: daysAgo(FAR_PAST),
          readyAtFactoryDate: daysAgo(FAR_PAST),
        }),
      ).toBe("IN_TRANSIT");
    });
  });

  describe("IN_TRANSIT — приоритет 3: qcDate <= today", () => {
    it("ОТК пройден (qc в прошлом), прибытий нет → IN_TRANSIT", () => {
      expect(
        computeOrderStatus({
          ...emptyDates(),
          qcDate: daysAgo(FAR_PAST),
        }),
      ).toBe("IN_TRANSIT");
    });

    it("qcDate ровно today → IN_TRANSIT (граница <=)", () => {
      expect(
        computeOrderStatus({
          ...emptyDates(),
          qcDate: new Date(todayMidnightUTC.getTime()),
        }),
      ).toBe("IN_TRANSIT");
    });

    it("qc в прошлом перекрывает ready в прошлом (qc приоритетнее QC)", () => {
      expect(
        computeOrderStatus({
          ...emptyDates(),
          qcDate: daysAgo(FAR_PAST),
          readyAtFactoryDate: daysAgo(FAR_PAST),
        }),
      ).toBe("IN_TRANSIT");
    });

    it("qc в будущем, ready в будущем → SEWING (ОТК ещё не наступил)", () => {
      expect(
        computeOrderStatus({
          ...emptyDates(),
          qcDate: daysAhead(FAR_FUTURE),
          readyAtFactoryDate: daysAhead(FAR_FUTURE),
        }),
      ).toBe("SEWING");
    });
  });

  describe("QC — приоритет 4: readyAtFactoryDate <= today", () => {
    it("производство закончилось (ready в прошлом), остального нет → QC", () => {
      expect(
        computeOrderStatus({
          ...emptyDates(),
          readyAtFactoryDate: daysAgo(FAR_PAST),
        }),
      ).toBe("QC");
    });

    it("readyAtFactoryDate ровно today → QC (граница <=)", () => {
      expect(
        computeOrderStatus({
          ...emptyDates(),
          readyAtFactoryDate: new Date(todayMidnightUTC.getTime()),
        }),
      ).toBe("QC");
    });
  });

  describe("SEWING — есть хотя бы одна из ключевых дат, но все ещё в будущем", () => {
    it("только readyAtFactoryDate в будущем → SEWING", () => {
      expect(
        computeOrderStatus({
          ...emptyDates(),
          readyAtFactoryDate: daysAhead(FAR_FUTURE),
        }),
      ).toBe("SEWING");
    });

    it("только qcDate в будущем → SEWING", () => {
      expect(
        computeOrderStatus({
          ...emptyDates(),
          qcDate: daysAhead(FAR_FUTURE),
        }),
      ).toBe("SEWING");
    });

    it("только arrivalPlannedDate в будущем → SEWING", () => {
      expect(
        computeOrderStatus({
          ...emptyDates(),
          arrivalPlannedDate: daysAhead(FAR_FUTURE),
        }),
      ).toBe("SEWING");
    });

    it("все три ключевые даты в будущем → SEWING", () => {
      expect(
        computeOrderStatus({
          ...emptyDates(),
          readyAtFactoryDate: daysAhead(FAR_FUTURE),
          qcDate: daysAhead(FAR_FUTURE),
          arrivalPlannedDate: daysAhead(FAR_FUTURE + 10),
        }),
      ).toBe("SEWING");
    });
  });

  describe("Особое поведение: arrivalActualDate НЕ участвует в финальном SEWING-условии", () => {
    it("только arrivalActualDate в будущем (всё прочее null) → PREPARATION, а НЕ SEWING", () => {
      // TODO: выглядит как баг — фактическая дата прибытия заполнена,
      // но в финальном `if (readyAtFactoryDate || qcDate || arrivalPlannedDate)`
      // arrivalActualDate отсутствует. Будущая фактическая дата (что само по себе
      // нелогично) при пустых остальных даёт PREPARATION, как будто заказ ещё не начат.
      expect(
        computeOrderStatus({
          ...emptyDates(),
          arrivalActualDate: daysAhead(FAR_FUTURE),
        }),
      ).toBe("PREPARATION");
    });
  });

  describe("Граничные значения времени суток (today нормализуется до начала UTC-суток)", () => {
    it("дата = сегодня 23:59:59Z (внутри текущих суток, но > today-полуночи) → ready не считается достигнутым", () => {
      // today внутри функции = начало UTC-суток. Дата «сегодня вечером» строго больше today-полуночи,
      // значит readyAtFactoryDate.getTime() <= today.getTime() ЛОЖНО → не QC, падаем в SEWING.
      const todayEvening = new Date(todayMidnightUTC.getTime() + DAY_MS - 1000);
      expect(
        computeOrderStatus({
          ...emptyDates(),
          readyAtFactoryDate: todayEvening,
        }),
      ).toBe("SEWING");
    });

    it("arrivalPlannedDate = сегодня вечером (> today-полуночи) → НЕ WAREHOUSE, SEWING", () => {
      const todayEvening = new Date(todayMidnightUTC.getTime() + DAY_MS - 1000);
      expect(
        computeOrderStatus({
          ...emptyDates(),
          arrivalPlannedDate: todayEvening,
        }),
      ).toBe("SEWING");
    });

    it("вчера 23:59:59Z для arrivalPlanned, без прочих дат → SEWING (план не двигает статус)", () => {
      const yesterdayEvening = new Date(todayMidnightUTC.getTime() - 1000);
      expect(
        computeOrderStatus({
          ...emptyDates(),
          arrivalPlannedDate: yesterdayEvening,
        }),
      ).toBe("SEWING");
    });
  });

  describe("Полная цепочка приоритетов на одном наборе дат", () => {
    it("прошлое ready+qc+planned+actual → WAREHOUSE_MSK (actual выигрывает)", () => {
      expect(
        computeOrderStatus({
          readyAtFactoryDate: daysAgo(FAR_PAST),
          qcDate: daysAgo(FAR_PAST - 100),
          arrivalPlannedDate: daysAgo(FAR_PAST - 200),
          arrivalActualDate: daysAgo(FAR_PAST - 300),
        }),
      ).toBe("WAREHOUSE_MSK");
    });

    it("actual=null, planned прошлое, qc прошлое → IN_TRANSIT (план не даёт WAREHOUSE)", () => {
      expect(
        computeOrderStatus({
          readyAtFactoryDate: daysAgo(FAR_PAST),
          qcDate: daysAgo(FAR_PAST),
          arrivalPlannedDate: daysAgo(FAR_PAST),
          arrivalActualDate: null,
        }),
      ).toBe("IN_TRANSIT");
    });

    it("actual=null, planned=null, qc прошлое → IN_TRANSIT", () => {
      expect(
        computeOrderStatus({
          readyAtFactoryDate: daysAgo(FAR_PAST),
          qcDate: daysAgo(FAR_PAST),
          arrivalPlannedDate: null,
          arrivalActualDate: null,
        }),
      ).toBe("IN_TRANSIT");
    });

    it("только ready прошлое, qc=planned=actual=null → QC", () => {
      expect(
        computeOrderStatus({
          readyAtFactoryDate: daysAgo(FAR_PAST),
          qcDate: null,
          arrivalPlannedDate: null,
          arrivalActualDate: null,
        }),
      ).toBe("QC");
    });
  });
});

describe("orderLateDays — подсветка опоздания без смены статуса", () => {
  it("план прибытия прошёл, факта нет → число просроченных дней", () => {
    expect(
      orderLateDays({ ...emptyDates(), arrivalPlannedDate: daysAgo(5) }),
    ).toBe(5);
  });

  it("план в будущем → 0 (не опаздывает)", () => {
    expect(
      orderLateDays({ ...emptyDates(), arrivalPlannedDate: daysAhead(5) }),
    ).toBe(0);
  });

  it("есть факт прибытия → 0, даже если план прошёл (уже прибыл, не опаздывает)", () => {
    expect(
      orderLateDays({
        ...emptyDates(),
        arrivalPlannedDate: daysAgo(10),
        arrivalActualDate: daysAgo(3),
      }),
    ).toBe(0);
  });

  it("статус «На складе Москва» и дальше → 0, даже без факта прибытия (заказ приехал)", () => {
    for (const status of ["WAREHOUSE_MSK", "PACKING", "SHIPPED_WB", "ON_SALE"] as const) {
      expect(
        orderLateDays({
          ...emptyDates(),
          arrivalPlannedDate: daysAgo(10),
          status,
        }),
      ).toBe(0);
    }
  });

  it("статус «В доставке» с прошедшим планом → всё ещё опаздывает", () => {
    expect(
      orderLateDays({
        ...emptyDates(),
        arrivalPlannedDate: daysAgo(7),
        status: "IN_TRANSIT",
      }),
    ).toBe(7);
  });

  it("плана нет → 0", () => {
    expect(orderLateDays(emptyDates())).toBe(0);
  });

  it("план ровно сегодня → 0 (не опаздывает в день плана)", () => {
    expect(
      orderLateDays({ ...emptyDates(), arrivalPlannedDate: new Date(todayMidnightUTC.getTime()) }),
    ).toBe(0);
  });
});
