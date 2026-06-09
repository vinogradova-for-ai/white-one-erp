import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, apiError } from "@/server/api-helpers";
import { assertCan } from "@/lib/rbac";
import { orderUpdateSchema } from "@/lib/validators/order";
import { computeOrderStatus } from "@/lib/order-auto-status";
import { isForwardOrderStatus } from "@/lib/status-machine/order-statuses";
import { selectOrderPaymentsToCreate } from "@/lib/payments/reconcile-order-payments";
import { logAudit } from "@/server/audit";
import { z } from "zod";

// Универсальная схема для обновления заказа (поля + флаги + даты + платежи)
const paymentInputSchema = z.object({
  // id существующего платежа (форма присылает его, чтобы сберечь оплаченные строки)
  id: z.string().optional(),
  plannedDate: z.string(),
  amount: z.number(),
  label: z.string(),
  paid: z.boolean().optional(),
});
const fullOrderPatchSchema = orderUpdateSchema.extend({
  // Флаги
  packagingOrdered: z.boolean().optional(),
  wbCardReady: z.boolean().optional(),
  hasIssue: z.boolean().optional(),

  // Оплаты (старые поля оставлены для обратной совместимости)
  prepaymentDate: z.string().nullable().optional(),
  prepaymentPaid: z.boolean().optional(),
  finalPaymentDate: z.string().nullable().optional(),
  finalPaymentPaid: z.boolean().optional(),

  // Даты этапов (могут проставляться вручную)
  decisionDate: z.string().nullable().optional(),
  handedToFactoryDate: z.string().nullable().optional(),
  sewingStartDate: z.string().nullable().optional(),
  readyAtFactoryDate: z.string().nullable().optional(),
  qcDate: z.string().nullable().optional(),
  shipmentDate: z.string().nullable().optional(),
  arrivalPlannedDate: z.string().nullable().optional(),
  arrivalActualDate: z.string().nullable().optional(),
  packingDoneDate: z.string().nullable().optional(),
  wbShipmentDate: z.string().nullable().optional(),
  saleStartDate: z.string().nullable().optional(),

  // График платежей: если передан — заменяет существующие платежи заказа
  payments: z.array(paymentInputSchema).optional(),
});

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireAuth();
    const { id } = await ctx.params;
    const order = await prisma.order.findFirst({
      where: { id, deletedAt: null },
      include: {
        productModel: { include: { sizeGrid: true } },
        lines: {
          include: { productVariant: true },
          orderBy: { createdAt: "asc" },
        },
        factory: true,
        owner: { select: { id: true, name: true } },
      },
    });
    if (!order) return NextResponse.json({ error: { code: "not_found" } }, { status: 404 });
    return NextResponse.json(order);
  } catch (e) {
    return apiError(e);
  }
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAuth();
    assertCan(session.user.role, "order.update"); // RBAC: редактирование заказа
    const { id } = await ctx.params;

    const existing = await prisma.order.findFirst({ where: { id, deletedAt: null } });
    if (!existing) return NextResponse.json({ error: { code: "not_found" } }, { status: 404 });

    const raw = await req.json();
    const data = fullOrderPatchSchema.parse(raw);

    // Преобразуем строки дат в Date
    const dateFields = [
      "prepaymentDate", "finalPaymentDate", "decisionDate",
      "handedToFactoryDate", "sewingStartDate", "readyAtFactoryDate", "qcDate",
      "shipmentDate", "arrivalPlannedDate", "arrivalActualDate",
      "packingDoneDate", "wbShipmentDate", "saleStartDate",
    ] as const;

    const processed: Record<string, unknown> = { ...data };
    for (const f of dateFields) {
      const v = processed[f];
      if (typeof v === "string") processed[f] = v ? new Date(v) : null;
    }
    // payments обрабатываем отдельной транзакцией, в основной update не передаём
    const newPayments = processed.payments as
      | Array<{ id?: string; plannedDate: string; amount: number; label: string; paid?: boolean }>
      | undefined;
    delete processed.payments;

    let updated = await prisma.order.update({ where: { id }, data: processed });
    await logAudit({
      action: "UPDATE",
      entityType: "Order",
      entityId: id,
      userId: session.user.id,
      changes: processed,
    });

    // Автостатус из положения в Ганте — ТОЛЬКО ВПЕРЁД.
    // Раньше пересчёт мог молча откатить вручную продвинутый заказ назад
    // (например, отметили «на складе», потом подвинули дату — и статус прыгал обратно).
    // Теперь авто-статус двигает заказ только вперёд по ленте; назад — лишь руками.
    const newStatus = computeOrderStatus({
      readyAtFactoryDate: updated.readyAtFactoryDate,
      qcDate: updated.qcDate,
      arrivalPlannedDate: updated.arrivalPlannedDate,
      arrivalActualDate: updated.arrivalActualDate,
    });
    if (newStatus !== updated.status && isForwardOrderStatus(updated.status, newStatus)) {
      const prev = updated.status;
      updated = await prisma.order.update({ where: { id }, data: { status: newStatus } });
      await prisma.orderStatusLog.create({
        data: {
          orderId: id,
          fromStatus: prev,
          toStatus: newStatus,
          changedById: session.user.id,
          comment: "Автостатус по таймлайну (вперёд)",
        },
      });
    }

    if (newPayments) {
      // Сохраняем историю оплат: оплаченные (PAID) платежи НЕ трогаем — удаляем и
      // пересоздаём только PENDING. Входящие строки, ссылающиеся (по id) на уже
      // оплаченный платёж, исключаем, чтобы не задвоить и не перезаписать его
      // реальную дату/плательщика на «сейчас». См. reconcile-order-payments + тест.
      await prisma.$transaction(async (tx) => {
        const existingPaid = await tx.payment.findMany({
          where: { orderId: id, type: "ORDER", status: "PAID" },
          select: { id: true },
        });
        const paidIds = new Set(existingPaid.map((p) => p.id));

        await tx.payment.deleteMany({ where: { orderId: id, type: "ORDER", status: "PENDING" } });

        const toCreate = selectOrderPaymentsToCreate(newPayments, paidIds);
        if (toCreate.length > 0) {
          await tx.payment.createMany({
            data: toCreate.map((p) => ({
              type: "ORDER" as const,
              plannedDate: new Date(p.plannedDate),
              amount: p.amount,
              label: p.label,
              orderId: id,
              factoryId: updated.factoryId,
              createdById: session.user.id,
              status: p.paid ? "PAID" as const : "PENDING" as const,
              paidAt: p.paid ? new Date() : null,
              paidById: p.paid ? session.user.id : null,
            })),
          });
        }
      });
    }
    return NextResponse.json(updated);
  } catch (e) {
    return apiError(e);
  }
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAuth();
    assertCan(session.user.role, "order.delete"); // RBAC: удаление заказа
    const { id } = await ctx.params;
    await prisma.order.update({ where: { id }, data: { deletedAt: new Date() } });
    await logAudit({
      action: "DELETE",
      entityType: "Order",
      entityId: id,
      userId: session.user.id,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}
