import { describe, it, expect } from "vitest";
import { selectOrderPaymentsToCreate, type IncomingPayment } from "@/lib/payments/reconcile-order-payments";

function row(over: Partial<IncomingPayment> = {}): IncomingPayment {
  return { id: null, plannedDate: "2026-05-01", amount: 1000, label: "Платёж", paid: false, ...over };
}

describe("selectOrderPaymentsToCreate — бережём оплаченные платежи", () => {
  it("исключает входящие строки, ссылающиеся на уже оплаченный платёж (по id)", () => {
    const incoming = [
      row({ id: "pay-paid", paid: true, label: "Предоплата 30%" }),
      row({ id: "pay-pending", paid: false, label: "Постоплата 70%" }),
    ];
    const paidIds = new Set(["pay-paid"]);

    const result = selectOrderPaymentsToCreate(incoming, paidIds);

    // Оплаченный не пересоздаём (он сохраняется в БД нетронутым); пересоздаём только PENDING.
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("pay-pending");
  });

  it("оставляет новые строки без id (создаются с нуля)", () => {
    const incoming = [row({ id: null, label: "Новый" }), row({ id: undefined, label: "Ещё" })];

    const result = selectOrderPaymentsToCreate(incoming, new Set(["pay-paid"]));

    expect(result).toHaveLength(2);
  });

  it("оставляет строку с id, которого нет среди оплаченных (бывший PENDING можно отметить оплаченным)", () => {
    const incoming = [row({ id: "was-pending", paid: true })];

    const result = selectOrderPaymentsToCreate(incoming, new Set(["other-paid"]));

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("was-pending");
  });

  it("пустой набор оплаченных — пересоздаём всё", () => {
    const incoming = [row({ id: "a" }), row({ id: "b" }), row({ id: null })];

    const result = selectOrderPaymentsToCreate(incoming, new Set());

    expect(result).toHaveLength(3);
  });

  it("все входящие — уже оплаченные: создавать нечего", () => {
    const incoming = [row({ id: "p1", paid: true }), row({ id: "p2", paid: true })];

    const result = selectOrderPaymentsToCreate(incoming, new Set(["p1", "p2"]));

    expect(result).toHaveLength(0);
  });
});
