import { Prisma } from "@prisma/client";
import { parsePaymentTerms, allocatePaymentDates, paymentLabel } from "./parse-terms";

type OrderForPayments = {
  id: string;
  paymentTerms: string | null;
  batchCost: Prisma.Decimal | null;
  factoryId: string | null;
  createdAt: Date;
  readyAtFactoryDate: Date | null;
  launchMonth: number; // YYYYMM
};

export type GeneratedPayment = {
  orderId: string;
  factoryId: string | null;
  type: "ORDER";
  plannedDate: Date;
  amount: Prisma.Decimal;
  label: string;
  notes: string | null;
};

// Генерирует массив предлагаемых платежей для заказа.
// Если paymentTerms не парсится — один платёж на 100% с подсказкой в notes.
// Если batchCost пустой — суммы = 0, в notes — подсказка заполнить экономику.
export function generatePaymentsForOrder(order: OrderForPayments): GeneratedPayment[] {
  const batchCost = order.batchCost ? new Prisma.Decimal(order.batchCost) : new Prisma.Decimal(0);
  const parsed = parsePaymentTerms(order.paymentTerms);

  const opening = order.createdAt;
  const closing = order.readyAtFactoryDate ?? estimateClosingFromLaunchMonth(order.launchMonth);

  if (!parsed || parsed.length === 0) {
    // Не смогли распарсить — один платёж на 100%, дата = closing, с подсказкой
    return [
      {
        orderId: order.id,
        factoryId: order.factoryId,
        type: "ORDER",
        plannedDate: closing,
        amount: batchCost,
        label: "Оплата по заказу",
        notes: order.paymentTerms
          ? `Не удалось распознать условия оплаты «${order.paymentTerms}». Проверьте график и суммы.`
          : "Условия оплаты не заполнены. Проверьте график и суммы.",
      },
    ];
  }

  const dates = allocatePaymentDates(parsed, opening, closing);

  return parsed.map((share, i) => {
    const amount = batchCost.mul(share).toDecimalPlaces(2);
    return {
      orderId: order.id,
      factoryId: order.factoryId,
      type: "ORDER" as const,
      plannedDate: dates[i],
      amount,
      label: paymentLabel(i, parsed.length, share * 100),
      notes: batchCost.eq(0)
        ? "Себестоимость партии ещё не посчитана — заполните экономику фасона, затем пересчитайте платежи."
        : null,
    };
  });
}

// Если нет readyAtFactoryDate — оцениваем от launchMonth (YYYYMM).
// Берём 1-е число месяца продаж и вычитаем 45 дней — ориентир даты готовности.
function estimateClosingFromLaunchMonth(launchMonth: number): Date {
  const year = Math.floor(launchMonth / 100);
  const month = launchMonth % 100;
  const firstOfLaunch = new Date(Date.UTC(year, month - 1, 1));
  return new Date(firstOfLaunch.getTime() - 45 * 24 * 60 * 60 * 1000);
}
