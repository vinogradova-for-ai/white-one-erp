import { describe, it, expect } from "vitest";
import { planPackagingPayments } from "@/lib/payments/reconcile-packaging-payments";

const row = (over: Partial<{ id: string; plannedDate: string; amount: number; label: string; paid: boolean }> = {}) => ({
  plannedDate: "2026-07-01",
  amount: 1000,
  label: "Платёж",
  ...over,
});

describe("planPackagingPayments", () => {
  it("существующий платёж обновляется по id, не пересоздаётся", () => {
    const plan = planPackagingPayments(
      [row({ id: "p1", amount: 1500 })],
      [{ id: "p1", status: "PENDING" }],
      true,
    );
    expect(plan.toCreate).toEqual([]);
    expect(plan.toDeleteIds).toEqual([]);
    expect(plan.toUpdate).toHaveLength(1);
    expect(plan.toUpdate[0]).toMatchObject({ id: "p1", amount: 1500 });
  });

  it("оплаченный платёж, убранный из формы, НЕ удаляется", () => {
    const plan = planPackagingPayments([], [{ id: "paid1", status: "PAID" }], true);
    expect(plan.toDeleteIds).toEqual([]);
  });

  it("неоплаченный платёж, убранный из формы, удаляется", () => {
    const plan = planPackagingPayments([], [{ id: "pend1", status: "PENDING" }], true);
    expect(plan.toDeleteIds).toEqual(["pend1"]);
  });

  it("новая строка без id — создаётся", () => {
    const plan = planPackagingPayments([row({ id: "synthetic-123" })], [], true);
    expect(plan.toCreate).toHaveLength(1);
    expect(plan.toUpdate).toEqual([]);
  });

  it("смена paid без права markPaid — игнорируется, флажим отказ", () => {
    const plan = planPackagingPayments(
      [row({ id: "p1", paid: true })],
      [{ id: "p1", status: "PENDING" }],
      false,
    );
    expect(plan.toUpdate[0].setPaid).toBeUndefined();
    expect(plan.paidChangeDenied).toBe(true);
  });

  it("смена paid с правом markPaid — ставит setPaid", () => {
    const plan = planPackagingPayments(
      [row({ id: "p1", paid: true })],
      [{ id: "p1", status: "PENDING" }],
      true,
    );
    expect(plan.toUpdate[0].setPaid).toBe(true);
    expect(plan.paidChangeDenied).toBe(false);
  });

  it("снятие оплаты (PAID→не paid) с правом — setPaid=false", () => {
    const plan = planPackagingPayments(
      [row({ id: "p1", paid: false })],
      [{ id: "p1", status: "PAID" }],
      true,
    );
    expect(plan.toUpdate[0].setPaid).toBe(false);
  });

  it("новая строка «оплачено» без права — создаётся как PENDING", () => {
    const plan = planPackagingPayments([row({ paid: true })], [], false);
    expect(plan.toCreate).toHaveLength(1);
    expect(plan.toCreate[0].paid).toBe(false);
    expect(plan.paidChangeDenied).toBe(true);
  });

  it("платёж без изменения флага — setPaid undefined (paidAt не трогаем)", () => {
    const plan = planPackagingPayments(
      [row({ id: "p1", paid: true })],
      [{ id: "p1", status: "PAID" }],
      true,
    );
    expect(plan.toUpdate[0].setPaid).toBeUndefined();
  });
});
