// Запросы и агрегации по «Оплатам фабрикам» — прослойка между Prisma и чистой
// математикой (allocate-payout.ts). Здесь тянем данные из БД, приводим Decimal к
// копейкам и отдаём готовые к отображению структуры.
//
// Фабрика планового платежа:
//   ORDER      → Payment.factoryId
//   PACKAGING  → Payment.packagingOrder.factoryId (у заказа упаковки)
// resolvePaymentFactoryId() учитывает оба случая.

import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import {
  toKopecks,
  paymentFactStatus,
  paymentRemainingKopecks,
  type PaymentFactStatus,
} from "@/lib/payments/allocate-payout";

/** Фабрика, к которой относится плановый платёж (прямая или через заказ упаковки). */
export function resolvePaymentFactoryId(p: {
  factoryId: string | null;
  packagingOrder: { factoryId: string | null } | null;
}): string | null {
  return p.factoryId ?? p.packagingOrder?.factoryId ?? null;
}

export type OpenPaymentForFactory = {
  id: string;
  type: "ORDER" | "PACKAGING";
  label: string;
  /** Человекочитаемая привязка: «ORD-41 · Пальто» или «PKG-... · Бирки». */
  targetLabel: string;
  plannedDate: string; // ISO
  amount: string; // рубли-строка
  allocated: string; // рубли-строка
  remaining: string; // рубли-строка (> 0)
  amountKopecks: number;
  allocatedKopecks: number;
  remainingKopecks: number;
};

const OPEN_PAYMENT_SELECT = {
  id: true,
  type: true,
  status: true,
  label: true,
  plannedDate: true,
  amount: true,
  factoryId: true,
  order: { select: { orderNumber: true, productModel: { select: { name: true } } } },
  packagingOrder: { select: { orderNumber: true, factoryId: true } },
  packagingItem: { select: { name: true } },
  supplierName: true,
  allocations: {
    where: { payout: { deletedAt: null } },
    select: { amount: true },
  },
} satisfies Prisma.PaymentSelect;

type OpenPaymentRow = Prisma.PaymentGetPayload<{ select: typeof OPEN_PAYMENT_SELECT }>;

function sumAllocKopecks(allocs: { amount: Prisma.Decimal }[]): number {
  return allocs.reduce((a, x) => a + toKopecks(x.amount.toString()), 0);
}

function targetLabelOf(p: OpenPaymentRow): string {
  if (p.type === "ORDER") {
    const on = p.order?.orderNumber ?? "заказ";
    const nm = p.order?.productModel.name ? ` · ${p.order.productModel.name}` : "";
    return `${on}${nm}`;
  }
  const on = p.packagingOrder?.orderNumber ?? p.supplierName ?? "упаковка";
  const nm = p.packagingItem?.name ? ` · ${p.packagingItem.name}` : "";
  return `${on}${nm}`;
}

/**
 * Открытые плановые платежи фабрики (остаток > 0), отсортированы по plannedDate.
 * Legacy paid без разнесений считаются закрытыми (remaining=0) и не попадают.
 */
export async function getOpenPaymentsForFactory(factoryId: string): Promise<OpenPaymentForFactory[]> {
  // Тянем платежи, где фабрика прямая ИЛИ через заказ упаковки этой фабрики.
  const rows = await prisma.payment.findMany({
    where: {
      OR: [{ factoryId }, { packagingOrder: { factoryId } }],
    },
    orderBy: { plannedDate: "asc" },
    select: OPEN_PAYMENT_SELECT,
    take: 500,
  });

  const out: OpenPaymentForFactory[] = [];
  for (const p of rows) {
    const amountKopecks = toKopecks(p.amount.toString());
    const allocatedKopecks = sumAllocKopecks(p.allocations);
    const legacyPaid = p.status === "PAID";
    const remainingKopecks = paymentRemainingKopecks({ amountKopecks, allocatedKopecks, legacyPaid });
    if (remainingKopecks <= 0) continue;
    out.push({
      id: p.id,
      type: p.type,
      label: p.label,
      targetLabel: targetLabelOf(p),
      plannedDate: p.plannedDate.toISOString(),
      amount: p.amount.toString(),
      allocated: (allocatedKopecks / 100).toFixed(2),
      remaining: (remainingKopecks / 100).toFixed(2),
      amountKopecks,
      allocatedKopecks,
      remainingKopecks,
    });
  }
  return out;
}

export type PaymentFactInfo = {
  status: PaymentFactStatus;
  amountKopecks: number;
  allocatedKopecks: number;
  remainingKopecks: number;
  /** Оплаты, которые закрыли этот платёж (для «оплачен из оплаты №N»). */
  payouts: { id: string; date: string; amount: string }[];
};

/**
 * Статус по факту для набора плановых платежей (по их id).
 * Возвращает Map paymentId → инфо. Учитывает только не-удалённые оплаты.
 */
export async function getPaymentFactInfo(paymentIds: string[]): Promise<Map<string, PaymentFactInfo>> {
  const map = new Map<string, PaymentFactInfo>();
  if (paymentIds.length === 0) return map;

  const payments = await prisma.payment.findMany({
    where: { id: { in: paymentIds } },
    select: {
      id: true,
      amount: true,
      status: true,
      allocations: {
        where: { payout: { deletedAt: null } },
        select: {
          amount: true,
          payout: { select: { id: true, date: true, amount: true } },
        },
      },
    },
  });

  for (const p of payments) {
    const amountKopecks = toKopecks(p.amount.toString());
    const allocatedKopecks = sumAllocKopecks(p.allocations);
    const legacyPaid = p.status === "PAID";
    const status = paymentFactStatus({ amountKopecks, allocatedKopecks, legacyPaid });
    const remainingKopecks = paymentRemainingKopecks({ amountKopecks, allocatedKopecks, legacyPaid });
    map.set(p.id, {
      status,
      amountKopecks,
      allocatedKopecks,
      remainingKopecks,
      payouts: p.allocations.map((a) => ({
        id: a.payout.id,
        date: a.payout.date.toISOString(),
        amount: a.amount.toString(),
      })),
    });
  }
  return map;
}
