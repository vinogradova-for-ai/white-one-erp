import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, apiError } from "@/server/api-helpers";
import { assertCan, can } from "@/lib/rbac";
import { packagingOrderUpdateSchema } from "@/lib/validators/packaging-order";
import { planPackagingPayments } from "@/lib/payments/reconcile-packaging-payments";
import { logAudit } from "@/server/audit";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireAuth();
    const { id } = await ctx.params;
    const item = await prisma.packagingOrder.findUnique({
      where: { id },
      include: {
        lines: {
          include: {
            packagingItem: { select: { id: true, name: true, type: true, photoUrl: true, stock: true } },
          },
        },
        factory: true,
        owner: { select: { id: true, name: true } },
        payments: true,
      },
    });
    if (!item) return NextResponse.json({ error: { message: "Не найдено" } }, { status: 404 });
    return NextResponse.json(item);
  } catch (e) {
    return apiError(e);
  }
}

// При переходе в ARRIVED — +quantity к stock каждой линии. Обратный переход — откатывает.
async function applyStockDelta(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  orderId: string,
  direction: "add" | "revert",
) {
  const lines = await tx.packagingOrderLine.findMany({
    where: { packagingOrderId: orderId },
    select: { packagingItemId: true, quantity: true },
  });
  const sign = direction === "add" ? 1 : -1;
  for (const line of lines) {
    await tx.packagingItem.update({
      where: { id: line.packagingItemId },
      data: { stock: { increment: sign * line.quantity } },
    });
  }
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAuth();
    const { id } = await ctx.params;
    assertCan(session.user.role, "packaging.manage"); // RBAC-гард
    const data = packagingOrderUpdateSchema.parse(await req.json());

    const updated = await prisma.$transaction(async (tx) => {
      const old = await tx.packagingOrder.findUnique({ where: { id } });
      if (!old) throw new Error("Не найдено");

      const newStatus = data.status ?? old.status;
      const wasArrived = old.status === "ARRIVED";
      const willBeArrived = newStatus === "ARRIVED";

      // Переход в/из ARRIVED — пополняем/откатываем склад
      if (!wasArrived && willBeArrived) {
        await applyStockDelta(tx, id, "add");
      }
      if (wasArrived && !willBeArrived) {
        await applyStockDelta(tx, id, "revert");
      }

      // Если пришли новые линии — пересоздать (только если заказ не в ARRIVED,
      // иначе склад уже учтён и править нельзя без явного возврата статуса)
      if (data.lines && !wasArrived && !willBeArrived) {
        await tx.packagingOrderLine.deleteMany({ where: { packagingOrderId: id } });
        await tx.packagingOrderLine.createMany({
          data: data.lines.map((l) => {
            const isCny = l.priceCurrency === "CNY";
            return {
              packagingOrderId: id,
              packagingItemId: l.packagingItemId,
              quantity: l.quantity,
              unitPriceRub: !isCny && l.unitPriceRub ? Number(l.unitPriceRub) : null,
              unitPriceCny: isCny && l.unitPriceCny ? Number(l.unitPriceCny) : null,
              priceCurrency: l.priceCurrency || null,
              cnyRubRate: isCny && l.cnyRubRate ? Number(l.cnyRubRate) : null,
            };
          }),
        });
      }

      const arrivedDateRaw = data.arrivedDate !== undefined
        ? (data.arrivedDate ? new Date(data.arrivedDate) : null)
        : old.arrivedDate;

      const writeData: Record<string, unknown> = {
        arrivedDate: willBeArrived && !arrivedDateRaw ? new Date() : arrivedDateRaw,
      };
      if (data.factoryId !== undefined) writeData.factoryId = data.factoryId || null;
      if (data.supplierName !== undefined) writeData.supplierName = data.supplierName || null;
      if (data.decisionDate !== undefined) writeData.decisionDate = data.decisionDate ? new Date(data.decisionDate) : null;
      if (data.orderedDate !== undefined) writeData.orderedDate = data.orderedDate ? new Date(data.orderedDate) : null;
      if (data.productionEndDate !== undefined) writeData.productionEndDate = data.productionEndDate ? new Date(data.productionEndDate) : null;
      if (data.expectedDate !== undefined) writeData.expectedDate = data.expectedDate ? new Date(data.expectedDate) : null;
      if (data.deliveryMethod !== undefined) writeData.deliveryMethod = data.deliveryMethod || null;
      if (data.ownerId !== undefined) writeData.ownerId = data.ownerId;
      if (data.notes !== undefined) writeData.notes = data.notes || null;
      if (data.status !== undefined) writeData.status = newStatus;
      if (data.weightKgOverride !== undefined) writeData.weightKgOverride = data.weightKgOverride;

      const updatedOrder = await tx.packagingOrder.update({
        where: { id },
        data: writeData,
      });

      // График платежей: сохраняем историю оплат (аудит, зона упаковки).
      // Обновляем существующие по id (PAID сохраняют paidAt/paidById), новые
      // создаём, убранные удаляем ТОЛЬКО если не оплачены. Смена флага «Оплачено»
      // — только с правом payment.markPaid (иначе обход правила через этот роут).
      if (data.payments) {
        const existing = await tx.payment.findMany({
          where: { packagingOrderId: id, type: "PACKAGING" },
          select: { id: true, status: true },
        });
        const canMarkPaid = can(session.user.role, "payment.markPaid");
        const plan = planPackagingPayments(
          data.payments,
          existing.map((e) => ({ id: e.id, status: e.status as "PENDING" | "PAID" })),
          canMarkPaid,
        );

        if (plan.toDeleteIds.length > 0) {
          await tx.payment.deleteMany({ where: { id: { in: plan.toDeleteIds } } });
        }
        for (const u of plan.toUpdate) {
          await tx.payment.update({
            where: { id: u.id },
            data: {
              plannedDate: new Date(u.plannedDate),
              amount: u.amount,
              label: u.label,
              // Флаг оплаты трогаем только если разрешено (setPaid определён).
              ...(u.setPaid === true
                ? { status: "PAID" as const, paidAt: new Date(), paidById: session.user.id }
                : u.setPaid === false
                ? { status: "PENDING" as const, paidAt: null, paidById: null }
                : {}),
            },
          });
        }
        if (plan.toCreate.length > 0) {
          await tx.payment.createMany({
            data: plan.toCreate.map((p) => ({
              type: "PACKAGING" as const,
              status: p.paid ? "PAID" as const : "PENDING" as const,
              paidAt: p.paid ? new Date() : null,
              paidById: p.paid ? session.user.id : null,
              plannedDate: new Date(p.plannedDate),
              amount: p.amount,
              currency: "RUB" as const,
              label: p.label,
              packagingOrderId: id,
              supplierName: updatedOrder.supplierName,
              createdById: session.user.id,
            })),
          });
        }
      }

      return updatedOrder;
    });

    await logAudit({
      action: "UPDATE",
      entityType: "PackagingOrder",
      entityId: id,
      userId: session.user.id,
      changes: data.status !== undefined ? { to: updated.status } : data,
    });

    return NextResponse.json(updated);
  } catch (e) {
    return apiError(e);
  }
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAuth();
    const { id } = await ctx.params;
    assertCan(session.user.role, "packaging.manage"); // RBAC-гард
    await prisma.$transaction(async (tx) => {
      const old = await tx.packagingOrder.findUnique({ where: { id } });
      if (!old) return;
      // Если заказ был получен — возвращаем склад в исходное
      if (old.status === "ARRIVED") {
        await applyStockDelta(tx, id, "revert");
      }
      await tx.payment.deleteMany({ where: { packagingOrderId: id } });
      // Линии удалятся каскадом
      await tx.packagingOrder.delete({ where: { id } });
    });
    await logAudit({
      action: "DELETE",
      entityType: "PackagingOrder",
      entityId: id,
      userId: session.user.id,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}
