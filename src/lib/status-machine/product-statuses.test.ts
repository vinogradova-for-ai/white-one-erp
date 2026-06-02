import { describe, it, expect } from "vitest";
import { ProductModelStatus, ProductVariantStatus, Role } from "@prisma/client";
import {
  MODEL_TRANSITIONS,
  canMoveModelStatus,
  MODEL_STATUS_DATE_FIELDS,
  VARIANT_TRANSITIONS,
  canMoveVariantStatus,
} from "@/lib/status-machine/product-statuses";

// Regression-тесты на машину статусов фасона (ProductModel) и варианта (ProductVariant).
// Фиксируем ТЕКУЩЕЕ поведение: разрешённые переходы, гейт APPROVED/IN_PRODUCTION,
// откаты только для руководителей, мягкую машину вариантов.

describe("MODEL_TRANSITIONS (карта переходов фасона)", () => {
  it("содержит ровно 5 статусов как ключи", () => {
    expect(Object.keys(MODEL_TRANSITIONS).sort()).toEqual(
      ["APPROVED", "IDEA", "IN_PRODUCTION", "PATTERNS", "SAMPLE"].sort(),
    );
  });

  it("IDEA ведёт только в PATTERNS", () => {
    expect(MODEL_TRANSITIONS.IDEA).toEqual(["PATTERNS"]);
  });

  it("PATTERNS ведёт только в SAMPLE", () => {
    expect(MODEL_TRANSITIONS.PATTERNS).toEqual(["SAMPLE"]);
  });

  it("SAMPLE ведёт только в APPROVED (гейт утверждения образца)", () => {
    expect(MODEL_TRANSITIONS.SAMPLE).toEqual(["APPROVED"]);
  });

  it("APPROVED ведёт только в IN_PRODUCTION", () => {
    expect(MODEL_TRANSITIONS.APPROVED).toEqual(["IN_PRODUCTION"]);
  });

  it("IN_PRODUCTION — терминальный статус (нет исходящих переходов)", () => {
    expect(MODEL_TRANSITIONS.IN_PRODUCTION).toEqual([]);
  });

  it("каждый переход одношаговый: из любого статуса максимум один вперёд", () => {
    for (const targets of Object.values(MODEL_TRANSITIONS)) {
      expect(targets.length).toBeLessThanOrEqual(1);
    }
  });
});

describe("canMoveModelStatus — прямые (forward) переходы", () => {
  it("IDEA → PATTERNS разрешён без комментария", () => {
    const res = canMoveModelStatus("IDEA", "PATTERNS", "PRODUCT_MANAGER");
    expect(res.ok).toBe(true);
    expect(res.reason).toBeUndefined();
    expect(res.requiresComment).toBeUndefined();
  });

  it("PATTERNS → SAMPLE разрешён", () => {
    expect(canMoveModelStatus("PATTERNS", "SAMPLE", "ASSISTANT").ok).toBe(true);
  });

  it("SAMPLE → APPROVED разрешён (утверждение образца, гейт)", () => {
    expect(canMoveModelStatus("SAMPLE", "APPROVED", "PRODUCT_MANAGER").ok).toBe(true);
  });

  it("APPROVED → IN_PRODUCTION разрешён", () => {
    expect(canMoveModelStatus("APPROVED", "IN_PRODUCTION", "INTERN").ok).toBe(true);
  });

  it("forward-переход разрешён любой ролью, даже INTERN", () => {
    expect(canMoveModelStatus("IDEA", "PATTERNS", "INTERN").ok).toBe(true);
  });

  it("forward-переход НЕ требует комментария (requiresComment не выставляется)", () => {
    const res = canMoveModelStatus("SAMPLE", "APPROVED", "OWNER");
    expect(res.ok).toBe(true);
    expect(res.requiresComment).toBeUndefined();
  });
});

describe("canMoveModelStatus — одинаковый статус", () => {
  it("from === to всегда отклоняется со специальным reason", () => {
    const res = canMoveModelStatus("SAMPLE", "SAMPLE", "OWNER");
    expect(res.ok).toBe(false);
    expect(res.reason).toBe("Статус не изменился");
  });

  it("from === to отклоняется даже для терминального IN_PRODUCTION у OWNER", () => {
    const res = canMoveModelStatus("IN_PRODUCTION", "IN_PRODUCTION", "OWNER");
    expect(res.ok).toBe(false);
    expect(res.reason).toBe("Статус не изменился");
  });
});

describe("canMoveModelStatus — перепрыгивание статуса (forward jump)", () => {
  it("IDEA → SAMPLE (через PATTERNS) запрещён", () => {
    const res = canMoveModelStatus("IDEA", "SAMPLE", "PRODUCT_MANAGER");
    expect(res.ok).toBe(false);
    expect(res.reason).toBe("Нельзя перепрыгнуть статус");
  });

  it("IDEA → IN_PRODUCTION запрещён даже для OWNER (forward jump не для руководителей)", () => {
    const res = canMoveModelStatus("IDEA", "IN_PRODUCTION", "OWNER");
    expect(res.ok).toBe(false);
    expect(res.reason).toBe("Нельзя перепрыгнуть статус");
  });

  it("PATTERNS → APPROVED (минуя SAMPLE/гейт образца) запрещён", () => {
    const res = canMoveModelStatus("PATTERNS", "APPROVED", "DIRECTOR");
    expect(res.ok).toBe(false);
    expect(res.reason).toBe("Нельзя перепрыгнуть статус");
  });

  it("SAMPLE → IN_PRODUCTION (минуя APPROVED) запрещён", () => {
    const res = canMoveModelStatus("SAMPLE", "IN_PRODUCTION", "OWNER");
    expect(res.ok).toBe(false);
    expect(res.reason).toBe("Нельзя перепрыгнуть статус");
  });
});

describe("canMoveModelStatus — откат (rollback)", () => {
  it("OWNER может откатить PATTERNS → IDEA, требуется комментарий", () => {
    const res = canMoveModelStatus("PATTERNS", "IDEA", "OWNER");
    expect(res.ok).toBe(true);
    expect(res.requiresComment).toBe(true);
    expect(res.reason).toBeUndefined();
  });

  it("DIRECTOR может откатить APPROVED → SAMPLE, требуется комментарий", () => {
    const res = canMoveModelStatus("APPROVED", "SAMPLE", "DIRECTOR");
    expect(res.ok).toBe(true);
    expect(res.requiresComment).toBe(true);
  });

  it("OWNER может откатить на несколько шагов назад: IN_PRODUCTION → IDEA", () => {
    const res = canMoveModelStatus("IN_PRODUCTION", "IDEA", "OWNER");
    expect(res.ok).toBe(true);
    expect(res.requiresComment).toBe(true);
  });

  it("PRODUCT_MANAGER НЕ может откатить — нет прав руководителя", () => {
    const res = canMoveModelStatus("APPROVED", "SAMPLE", "PRODUCT_MANAGER");
    expect(res.ok).toBe(false);
    expect(res.reason).toBe("Откат статуса доступен только руководителям");
    expect(res.requiresComment).toBeUndefined();
  });

  it("ASSISTANT не может откатить", () => {
    const res = canMoveModelStatus("SAMPLE", "PATTERNS", "ASSISTANT");
    expect(res.ok).toBe(false);
    expect(res.reason).toBe("Откат статуса доступен только руководителям");
  });

  it("INTERN не может откатить", () => {
    const res = canMoveModelStatus("IN_PRODUCTION", "APPROVED", "INTERN");
    expect(res.ok).toBe(false);
    expect(res.reason).toBe("Откат статуса доступен только руководителям");
  });

  it("WB_MANAGER (не руководитель) не может откатить", () => {
    const res = canMoveModelStatus("APPROVED", "IDEA", "WB_MANAGER");
    expect(res.ok).toBe(false);
    expect(res.reason).toBe("Откат статуса доступен только руководителям");
  });

  it("откат разрешён только для OWNER и DIRECTOR — перебор всех ролей", () => {
    const roles: Role[] = [
      "OWNER",
      "DIRECTOR",
      "PRODUCT_MANAGER",
      "ASSISTANT",
      "CONTENT_MANAGER",
      "LOGISTICS",
      "CUSTOMS",
      "WB_MANAGER",
      "INTERN",
    ];
    for (const role of roles) {
      const res = canMoveModelStatus("APPROVED", "SAMPLE", role);
      if (role === "OWNER" || role === "DIRECTOR") {
        expect(res.ok).toBe(true);
        expect(res.requiresComment).toBe(true);
      } else {
        expect(res.ok).toBe(false);
        expect(res.reason).toBe("Откат статуса доступен только руководителям");
      }
    }
  });
});

describe("canMoveModelStatus — гейт APPROVED (защита денег/производства)", () => {
  it("в APPROVED можно попасть ТОЛЬКО из SAMPLE forward-переходом", () => {
    const all: ProductModelStatus[] = [
      "IDEA",
      "PATTERNS",
      "SAMPLE",
      "APPROVED",
      "IN_PRODUCTION",
    ];
    for (const from of all) {
      if (from === "APPROVED") continue; // from === to
      const res = canMoveModelStatus(from, "APPROVED", "PRODUCT_MANAGER");
      if (from === "SAMPLE") {
        expect(res.ok).toBe(true);
      } else {
        expect(res.ok).toBe(false);
      }
    }
  });

  it("в IN_PRODUCTION можно попасть ТОЛЬКО из APPROVED forward-переходом", () => {
    const all: ProductModelStatus[] = [
      "IDEA",
      "PATTERNS",
      "SAMPLE",
      "APPROVED",
      "IN_PRODUCTION",
    ];
    for (const from of all) {
      if (from === "IN_PRODUCTION") continue;
      const res = canMoveModelStatus(from, "IN_PRODUCTION", "PRODUCT_MANAGER");
      if (from === "APPROVED") {
        expect(res.ok).toBe(true);
      } else {
        expect(res.ok).toBe(false);
      }
    }
  });
});

describe("MODEL_STATUS_DATE_FIELDS (поля дат по статусам)", () => {
  it("PATTERNS пишет в patternsDate", () => {
    expect(MODEL_STATUS_DATE_FIELDS.PATTERNS).toBe("patternsDate");
  });

  it("SAMPLE пишет в sampleDate", () => {
    expect(MODEL_STATUS_DATE_FIELDS.SAMPLE).toBe("sampleDate");
  });

  it("APPROVED пишет в approvedDate", () => {
    expect(MODEL_STATUS_DATE_FIELDS.APPROVED).toBe("approvedDate");
  });

  it("IN_PRODUCTION пишет в productionStartDate", () => {
    expect(MODEL_STATUS_DATE_FIELDS.IN_PRODUCTION).toBe("productionStartDate");
  });

  it("у IDEA нет поля даты (стартовый статус)", () => {
    expect(MODEL_STATUS_DATE_FIELDS.IDEA).toBeUndefined();
  });

  it("карта содержит ровно 4 записи (без IDEA)", () => {
    expect(Object.keys(MODEL_STATUS_DATE_FIELDS).sort()).toEqual(
      ["APPROVED", "IN_PRODUCTION", "PATTERNS", "SAMPLE"].sort(),
    );
  });
});

describe("VARIANT_TRANSITIONS (карта переходов варианта)", () => {
  it("DRAFT может идти в READY_TO_ORDER и DISCONTINUED", () => {
    expect(VARIANT_TRANSITIONS.DRAFT).toEqual(["READY_TO_ORDER", "DISCONTINUED"]);
  });

  it("READY_TO_ORDER может идти в DISCONTINUED и обратно в DRAFT", () => {
    expect(VARIANT_TRANSITIONS.READY_TO_ORDER).toEqual(["DISCONTINUED", "DRAFT"]);
  });

  it("DISCONTINUED может вернуться только в DRAFT", () => {
    expect(VARIANT_TRANSITIONS.DISCONTINUED).toEqual(["DRAFT"]);
  });

  it("содержит ровно 3 статуса как ключи", () => {
    expect(Object.keys(VARIANT_TRANSITIONS).sort()).toEqual(
      ["DISCONTINUED", "DRAFT", "READY_TO_ORDER"].sort(),
    );
  });
});

describe("canMoveVariantStatus — разрешённые переходы", () => {
  it("DRAFT → READY_TO_ORDER разрешён", () => {
    expect(canMoveVariantStatus("DRAFT", "READY_TO_ORDER").ok).toBe(true);
  });

  it("DRAFT → DISCONTINUED разрешён", () => {
    expect(canMoveVariantStatus("DRAFT", "DISCONTINUED").ok).toBe(true);
  });

  it("READY_TO_ORDER → DISCONTINUED разрешён", () => {
    expect(canMoveVariantStatus("READY_TO_ORDER", "DISCONTINUED").ok).toBe(true);
  });

  it("READY_TO_ORDER → DRAFT разрешён", () => {
    expect(canMoveVariantStatus("READY_TO_ORDER", "DRAFT").ok).toBe(true);
  });

  it("DISCONTINUED → DRAFT разрешён (расконсервация)", () => {
    expect(canMoveVariantStatus("DISCONTINUED", "DRAFT").ok).toBe(true);
  });

  it("разрешённый переход не возвращает reason", () => {
    const res = canMoveVariantStatus("DRAFT", "READY_TO_ORDER");
    expect(res.ok).toBe(true);
    expect(res.reason).toBeUndefined();
  });
});

describe("canMoveVariantStatus — запрещённые переходы", () => {
  it("DISCONTINUED → READY_TO_ORDER запрещён (нельзя сразу в продажу из снятого)", () => {
    const res = canMoveVariantStatus("DISCONTINUED", "READY_TO_ORDER");
    expect(res.ok).toBe(false);
    expect(res.reason).toBe("Недопустимый переход");
  });

  it("from === to всегда отклоняется со спец. reason для всех статусов", () => {
    const all: ProductVariantStatus[] = ["DRAFT", "READY_TO_ORDER", "DISCONTINUED"];
    for (const s of all) {
      const res = canMoveVariantStatus(s, s);
      expect(res.ok).toBe(false);
      expect(res.reason).toBe("Статус не изменился");
    }
  });

  it("полный перебор: только переходы из VARIANT_TRANSITIONS разрешены", () => {
    const all: ProductVariantStatus[] = ["DRAFT", "READY_TO_ORDER", "DISCONTINUED"];
    for (const from of all) {
      for (const to of all) {
        const res = canMoveVariantStatus(from, to);
        if (from === to) {
          expect(res.ok).toBe(false);
          expect(res.reason).toBe("Статус не изменился");
        } else if (VARIANT_TRANSITIONS[from].includes(to)) {
          expect(res.ok).toBe(true);
        } else {
          expect(res.ok).toBe(false);
          expect(res.reason).toBe("Недопустимый переход");
        }
      }
    }
  });
});
