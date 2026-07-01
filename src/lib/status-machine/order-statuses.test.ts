import { describe, it, expect } from "vitest";
import { OrderStatus, Role } from "@prisma/client";
import {
  ORDER_TRANSITIONS,
  ORDER_STATUS_DATE_FIELDS,
  canMoveOrderStatus,
} from "@/lib/status-machine/order-statuses";

// Полная упорядоченная цепочка статусов (как зашита в isOrderRollback).
const ORDER_SEQUENCE: OrderStatus[] = [
  "PREPARATION",
  "FABRIC_ORDERED",
  "SEWING",
  "QC",
  "READY_SHIP",
  "IN_TRANSIT",
  "WAREHOUSE_MSK",
  "PACKING",
  "SHIPPED_WB",
  "ON_SALE",
];

describe("ORDER_TRANSITIONS — таблица переходов вперёд", () => {
  it("содержит ровно 10 статусов", () => {
    expect(Object.keys(ORDER_TRANSITIONS)).toHaveLength(10);
  });

  it("покрывает все статусы из enum OrderStatus", () => {
    expect(Object.keys(ORDER_TRANSITIONS).sort()).toEqual(
      [...ORDER_SEQUENCE].sort(),
    );
  });

  it("линейная цепочка ведёт каждый статус к следующему", () => {
    // PREPARATION даёт прямой путь в SEWING (в обход FABRIC_ORDERED), но сам
    // FABRIC_ORDERED остаётся валидной точкой цепи (легаси-данные).
    expect(ORDER_TRANSITIONS.PREPARATION).toEqual(["SEWING", "FABRIC_ORDERED"]);
    expect(ORDER_TRANSITIONS.FABRIC_ORDERED).toEqual(["SEWING"]);
    expect(ORDER_TRANSITIONS.SEWING).toEqual(["QC"]);
    expect(ORDER_TRANSITIONS.READY_SHIP).toEqual(["IN_TRANSIT"]);
    expect(ORDER_TRANSITIONS.IN_TRANSIT).toEqual(["WAREHOUSE_MSK"]);
    expect(ORDER_TRANSITIONS.WAREHOUSE_MSK).toEqual(["PACKING"]);
    expect(ORDER_TRANSITIONS.PACKING).toEqual(["SHIPPED_WB"]);
    expect(ORDER_TRANSITIONS.SHIPPED_WB).toEqual(["ON_SALE"]);
  });

  it("QC может идти вперёд (READY_SHIP) и обратно на пошив (SEWING)", () => {
    expect(ORDER_TRANSITIONS.QC).toEqual(["READY_SHIP", "SEWING"]);
  });

  it("ON_SALE — терминальный статус, переходов вперёд нет", () => {
    expect(ORDER_TRANSITIONS.ON_SALE).toEqual([]);
  });
});

describe("canMoveOrderStatus — переход в тот же статус", () => {
  it("from === to всегда запрещён с причиной «Статус не изменился»", () => {
    const res = canMoveOrderStatus("SEWING", "SEWING", "OWNER");
    expect(res).toEqual({ ok: false, reason: "Статус не изменился" });
  });

  it("from === to запрещён даже для терминального ON_SALE и роли OWNER", () => {
    const res = canMoveOrderStatus("ON_SALE", "ON_SALE", "OWNER");
    expect(res.ok).toBe(false);
    expect(res.reason).toBe("Статус не изменился");
    expect(res.requiresComment).toBeUndefined();
  });

  it("from === to для PREPARATION у обычной роли — тоже «не изменился»", () => {
    const res = canMoveOrderStatus(
      "PREPARATION",
      "PREPARATION",
      "PRODUCT_MANAGER",
    );
    expect(res).toEqual({ ok: false, reason: "Статус не изменился" });
  });
});

describe("canMoveOrderStatus — допустимые переходы вперёд", () => {
  it("каждый соседний шаг вперёд разрешён для любой роли (без requiresComment)", () => {
    const roles: Role[] = ["OWNER", "PRODUCT_MANAGER", "INTERN", "LOGISTICS"];
    for (let i = 0; i < ORDER_SEQUENCE.length - 1; i++) {
      const from = ORDER_SEQUENCE[i];
      const to = ORDER_SEQUENCE[i + 1];
      for (const role of roles) {
        const res = canMoveOrderStatus(from, to, role);
        expect(res).toEqual({ ok: true });
      }
    }
  });

  it("PREPARATION → FABRIC_ORDERED разрешён для INTERN", () => {
    expect(canMoveOrderStatus("PREPARATION", "FABRIC_ORDERED", "INTERN")).toEqual(
      { ok: true },
    );
  });

  it("QC → READY_SHIP (вперёд) разрешён, без комментария", () => {
    expect(canMoveOrderStatus("QC", "READY_SHIP", "ASSISTANT")).toEqual({
      ok: true,
    });
  });
});

describe("canMoveOrderStatus — явный возврат QC → SEWING (объявлен в таблице)", () => {
  it("разрешён для любой роли как обычный переход, БЕЗ requiresComment", () => {
    // Хотя QC→SEWING — это шаг назад, он явно прописан в ORDER_TRANSITIONS,
    // поэтому ветка таблицы срабатывает раньше ветки отката.
    const resIntern = canMoveOrderStatus("QC", "SEWING", "INTERN");
    expect(resIntern).toEqual({ ok: true });

    const resOwner = canMoveOrderStatus("QC", "SEWING", "OWNER");
    // OWNER тоже получает { ok: true } без requiresComment, т.к. это табличный переход.
    expect(resOwner).toEqual({ ok: true });
    expect(resOwner.requiresComment).toBeUndefined();
  });
});

describe("canMoveOrderStatus — откат (rollback) на несоседний статус назад", () => {
  it("OWNER может откатить и обязан оставить комментарий", () => {
    const res = canMoveOrderStatus("READY_SHIP", "SEWING", "OWNER");
    expect(res).toEqual({ ok: true, requiresComment: true });
  });

  it("DIRECTOR может откатить и обязан оставить комментарий", () => {
    const res = canMoveOrderStatus("SHIPPED_WB", "PACKING", "DIRECTOR");
    expect(res).toEqual({ ok: true, requiresComment: true });
  });

  it("откат с самого конца в самое начало разрешён руководителю", () => {
    const res = canMoveOrderStatus("ON_SALE", "PREPARATION", "OWNER");
    expect(res).toEqual({ ok: true, requiresComment: true });
  });

  it("откат на один шаг назад (несоседний по таблице) тоже rollback", () => {
    // SEWING → FABRIC_ORDERED: назад на 1, в таблице FABRIC_ORDERED такого нет.
    const res = canMoveOrderStatus("SEWING", "FABRIC_ORDERED", "DIRECTOR");
    expect(res).toEqual({ ok: true, requiresComment: true });
  });

  it("обычная роль НЕ может откатить — спец-причина про руководителей", () => {
    const res = canMoveOrderStatus("READY_SHIP", "SEWING", "PRODUCT_MANAGER");
    expect(res).toEqual({
      ok: false,
      reason: "Откат статуса доступен только руководителям",
    });
  });

  it("INTERN не может откатить", () => {
    const res = canMoveOrderStatus("ON_SALE", "PREPARATION", "INTERN");
    expect(res.ok).toBe(false);
    expect(res.reason).toBe("Откат статуса доступен только руководителям");
    expect(res.requiresComment).toBeUndefined();
  });

  it("LOGISTICS / CONTENT_MANAGER / WB_MANAGER / CUSTOMS / ASSISTANT не могут откатить", () => {
    const roles: Role[] = [
      "LOGISTICS",
      "CONTENT_MANAGER",
      "WB_MANAGER",
      "CUSTOMS",
      "ASSISTANT",
    ];
    for (const role of roles) {
      const res = canMoveOrderStatus("WAREHOUSE_MSK", "QC", role);
      expect(res).toEqual({
        ok: false,
        reason: "Откат статуса доступен только руководителям",
      });
    }
  });
});

describe("canMoveOrderStatus — недопустимый прыжок вперёд", () => {
  it("прыжок через статус вперёд запрещён даже для OWNER", () => {
    // PREPARATION → QC: перепрыгивает пошив, вперёд, но не в таблице переходов.
    // (PREPARATION → SEWING теперь разрешён: прямой путь в обход FABRIC_ORDERED.)
    const res = canMoveOrderStatus("PREPARATION", "QC", "OWNER");
    expect(res).toEqual({ ok: false, reason: "Нельзя перепрыгнуть статус" });
  });

  it("прыжок вперёд запрещён для обычной роли", () => {
    const res = canMoveOrderStatus("SEWING", "READY_SHIP", "PRODUCT_MANAGER");
    expect(res).toEqual({ ok: false, reason: "Нельзя перепрыгнуть статус" });
  });

  it("прыжок с PREPARATION сразу в ON_SALE запрещён", () => {
    const res = canMoveOrderStatus("PREPARATION", "ON_SALE", "DIRECTOR");
    expect(res).toEqual({ ok: false, reason: "Нельзя перепрыгнуть статус" });
  });

  it("из терминального ON_SALE нельзя пойти вперёд (некуда) — всё назад это rollback", () => {
    // ON_SALE → любой другой = индекс to меньше => rollback, не «перепрыгнуть».
    const res = canMoveOrderStatus("ON_SALE", "SHIPPED_WB", "PRODUCT_MANAGER");
    expect(res).toEqual({
      ok: false,
      reason: "Откат статуса доступен только руководителям",
    });
  });
});

describe("canMoveOrderStatus — проверка всех пар from≠to матрицей", () => {
  it("ровно ожидаемые пары дают requiresComment=true (rollback руководителем)", () => {
    let rollbackForOwner = 0;
    let forwardOk = 0;
    for (const from of ORDER_SEQUENCE) {
      for (const to of ORDER_SEQUENCE) {
        if (from === to) continue;
        const res = canMoveOrderStatus(from, to, "OWNER");
        if (res.requiresComment) rollbackForOwner++;
        if (res.ok && !res.requiresComment) forwardOk++;
      }
    }
    // Откатов назад: для индекса i (0..9) число статусов строго левее = i.
    // Но QC→SEWING НЕ откат (он в таблице) → вычитаем 1.
    // Сумма i по всем статусам = 0+1+...+9 = 45, минус 1 = 44.
    expect(rollbackForOwner).toBe(44);
    // Табличные переходы (ok без комментария): 8 линейных + QC→READY_SHIP + QC→SEWING
    // + PREPARATION→SEWING (прямой путь в обход FABRIC_ORDERED) = 11.
    expect(forwardOk).toBe(11);
  });
});

describe("ORDER_STATUS_DATE_FIELDS — авто-поле даты при переходе", () => {
  it("PREPARATION не имеет авто-поля даты", () => {
    expect(ORDER_STATUS_DATE_FIELDS.PREPARATION).toBeUndefined();
  });

  it("маппинг статус → поле зафиксирован", () => {
    expect(ORDER_STATUS_DATE_FIELDS.FABRIC_ORDERED).toBe("decisionDate");
    expect(ORDER_STATUS_DATE_FIELDS.SEWING).toBe("sewingStartDate");
    expect(ORDER_STATUS_DATE_FIELDS.QC).toBe("readyAtFactoryDate");
    // READY_SHIP = ОТК пройден → qcDate (конец ОТК). Раньше ошибочно
    // перезаписывал readyAtFactoryDate, qcDate оставался null → Гант рисовал криво.
    expect(ORDER_STATUS_DATE_FIELDS.READY_SHIP).toBe("qcDate");
    expect(ORDER_STATUS_DATE_FIELDS.IN_TRANSIT).toBe("shipmentDate");
    expect(ORDER_STATUS_DATE_FIELDS.WAREHOUSE_MSK).toBe("arrivalActualDate");
    expect(ORDER_STATUS_DATE_FIELDS.PACKING).toBe("arrivalActualDate");
    expect(ORDER_STATUS_DATE_FIELDS.SHIPPED_WB).toBe("wbShipmentDate");
    expect(ORDER_STATUS_DATE_FIELDS.ON_SALE).toBe("saleStartDate");
  });

  it("QC пишет readyAtFactoryDate (старт ОТК), READY_SHIP — qcDate (конец ОТК): РАЗНЫЕ поля", () => {
    expect(ORDER_STATUS_DATE_FIELDS.QC).toBe("readyAtFactoryDate");
    expect(ORDER_STATUS_DATE_FIELDS.READY_SHIP).toBe("qcDate");
    expect(ORDER_STATUS_DATE_FIELDS.QC).not.toBe(
      ORDER_STATUS_DATE_FIELDS.READY_SHIP,
    );
  });

  it("WAREHOUSE_MSK и PACKING пишут в одно поле arrivalActualDate", () => {
    expect(ORDER_STATUS_DATE_FIELDS.WAREHOUSE_MSK).toBe(
      ORDER_STATUS_DATE_FIELDS.PACKING,
    );
  });

  it("задано ровно 9 полей дат (все кроме PREPARATION)", () => {
    expect(Object.keys(ORDER_STATUS_DATE_FIELDS)).toHaveLength(9);
  });
});
