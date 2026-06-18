import { describe, it, expect } from "vitest";
import type { Role } from "@prisma/client";
import { can, assertCan, RbacError, type Action } from "@/lib/rbac";

// Матрица прав can() — фиксирует ТЕКУЩУЮ политику доступа.
// Это страховка перед простановкой assertCan на роуты: гарантируем, что
// продуктовый отдел (OWNER/DIRECTOR/PRODUCT_MANAGER) не теряет доступ,
// а read-only отделы (логистика/ВЭД/контент/WB/стажёр) не получают запись.

const ADMINS: Role[] = ["OWNER", "DIRECTOR"];
const READONLY: Role[] = ["CONTENT_MANAGER", "LOGISTICS", "CUSTOMS", "WB_MANAGER", "INTERN"];

describe("rbac · админы (OWNER/DIRECTOR) могут всё", () => {
  const actions: Action[] = [
    "order.create", "order.update", "order.delete", "order.updateStatus", "order.rollbackStatus",
    "product.create", "product.update", "product.delete", "product.rollbackStatus",
    "payment.create", "payment.update", "payment.markPaid", "payment.delete",
    "plan.manage", "factory.manage", "user.manage", "import.run", "audit.read",
  ];
  for (const role of ADMINS) {
    for (const a of actions) {
      it(`${role} может ${a}`, () => {
        expect(can(role, a)).toBe(true);
      });
    }
  }
});

describe("rbac · PRODUCT_MANAGER — полный рабочий доступ (политика «все на равных»)", () => {
  const PM: Role = "PRODUCT_MANAGER";
  it("создаёт фасоны и заказы", () => {
    expect(can(PM, "product.create")).toBe(true);
    expect(can(PM, "order.create")).toBe(true);
  });
  it("обновляет фасоны/заказы и их статусы", () => {
    expect(can(PM, "product.update")).toBe(true);
    expect(can(PM, "order.update")).toBe(true);
    expect(can(PM, "order.updateStatus")).toBe(true);
    expect(can(PM, "product.updateStatus")).toBe(true);
  });
  it("создаёт, правит и отмечает оплаченными платежи", () => {
    expect(can(PM, "payment.create")).toBe(true);
    expect(can(PM, "payment.update")).toBe(true);
    expect(can(PM, "payment.markPaid")).toBe(true);
  });
  it("откатывает статусы и ведёт справочники планов/фабрик", () => {
    expect(can(PM, "order.rollbackStatus")).toBe(true);
    expect(can(PM, "product.rollbackStatus")).toBe(true);
    expect(can(PM, "plan.manage")).toBe(true);
    expect(can(PM, "factory.manage")).toBe(true);
  });
  it("импорт — может", () => {
    expect(can(PM, "import.run")).toBe(true);
  });
  it("НО удаление и управление людьми — закреплены за владельцем", () => {
    expect(can(PM, "order.delete")).toBe(false);
    expect(can(PM, "product.delete")).toBe(false);
    expect(can(PM, "payment.delete")).toBe(false);
    expect(can(PM, "user.manage")).toBe(false);
    expect(can(PM, "audit.read")).toBe(false);
  });
});

describe("rbac · ASSISTANT (Настя) — платежи (для упаковки), но не заказы", () => {
  const A: Role = "ASSISTANT";
  it("может создавать/править платежи", () => {
    expect(can(A, "payment.create")).toBe(true);
    expect(can(A, "payment.update")).toBe(true);
  });
  it("НЕ создаёт заказы/фасоны и не правит чужие", () => {
    expect(can(A, "order.create")).toBe(false);
    expect(can(A, "product.create")).toBe(false);
    expect(can(A, "order.update")).toBe(false);
  });
  it("НЕ отмечает оплачено и не удаляет", () => {
    expect(can(A, "payment.markPaid")).toBe(false);
    expect(can(A, "payment.delete")).toBe(false);
  });
});

describe("rbac · read-only отделы — только чтение, никакой записи", () => {
  const writes: Action[] = [
    "order.create", "order.update", "order.delete", "order.updateStatus",
    "product.create", "product.update", "product.delete",
    "payment.create", "payment.update", "payment.markPaid", "payment.delete",
    "plan.manage", "user.manage", "import.run",
  ];
  const reads: Action[] = ["order.read", "product.read", "payment.read", "factory.read", "plan.read", "user.read"];
  for (const role of READONLY) {
    it(`${role} читает всё`, () => {
      for (const a of reads) expect(can(role, a)).toBe(true);
    });
    it(`${role} не может ничего писать`, () => {
      for (const a of writes) expect(can(role, a)).toBe(false);
    });
  }
});

describe("rbac · factory.manage — общий справочник фабрик (доступен всем сотрудникам)", () => {
  const ALL: Role[] = [
    "OWNER", "DIRECTOR", "PRODUCT_MANAGER", "ASSISTANT",
    "CONTENT_MANAGER", "LOGISTICS", "CUSTOMS", "WB_MANAGER", "INTERN",
  ];
  for (const role of ALL) {
    it(`${role} может видеть и вести фабрики`, () => {
      expect(can(role, "factory.read")).toBe(true);
      expect(can(role, "factory.manage")).toBe(true);
    });
  }
});

describe("rbac · owner-scoped: PM правит свой ресурс", () => {
  const PM: Role = "PRODUCT_MANAGER";
  it("order.update проходит для владельца (isOwner) и для PM в принципе", () => {
    expect(can(PM, "order.update", "user-1", "user-1")).toBe(true); // владелец
    expect(can(PM, "order.update", "user-2", "user-1")).toBe(true); // PM может и не свои
  });
  it("дыра закрыта: владение ресурсом НЕ даёт запись read-only роли", () => {
    // isOwner убран из write-веток — read-only отделы не пишут даже свой ресурс.
    expect(can("LOGISTICS", "order.update", "user-1", "user-1")).toBe(false);
    expect(can("CONTENT_MANAGER", "product.update", "u1", "u1")).toBe(false);
    expect(can("INTERN", "order.updateStatus", "u1", "u1")).toBe(false);
  });
});

describe("rbac · packaging.manage — упаковка (PM + Настя + админы)", () => {
  it("PM, ASSISTANT и админы управляют упаковкой", () => {
    expect(can("PRODUCT_MANAGER", "packaging.manage")).toBe(true);
    expect(can("ASSISTANT", "packaging.manage")).toBe(true);
    expect(can("OWNER", "packaging.manage")).toBe(true);
    expect(can("DIRECTOR", "packaging.manage")).toBe(true);
  });
  it("read-only отделы НЕ управляют упаковкой", () => {
    for (const r of ["CONTENT_MANAGER", "LOGISTICS", "CUSTOMS", "WB_MANAGER", "INTERN"] as Role[]) {
      expect(can(r, "packaging.manage")).toBe(false);
    }
  });
});

describe("rbac · assertCan бросает RbacError при запрете", () => {
  it("кидает RbacError для запрещённого действия", () => {
    expect(() => assertCan("INTERN", "order.update")).toThrowError(RbacError);
  });
  it("не кидает для разрешённого", () => {
    expect(() => assertCan("OWNER", "order.delete")).not.toThrow();
  });
});
