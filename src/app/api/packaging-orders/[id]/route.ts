import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, apiError } from "@/server/api-helpers";
import { packagingOrderUpdateSchema } from "@/lib/validators/packaging-order";

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
      if (data.orderedDate !== undefined) writeData.orderedDate = data.orderedDate ? new Date(data.orderedDate) : null;
      if (data.productionEndDate !== undefined) writeData.productionEndDate = data.productionEndDate ? new Date(data.productionEndDate) : null;
      if (data.expectedDate !== undefined) writeData.expectedDate = data.expectedDate ? new Date(data.expectedDate) : null;
      if (data.deliveryMethod !== undefined) writeData.deliveryMethod = data.deliveryMethod || null;
      if (data.ownerId !== undefined) writeData.ownerId = data.ownerId;
      if (data.notes !== undefined) writeData.notes = data.notes || null;
      if (data.status !== undefined) writeData.status = newStatus;

      const updatedOrder = await tx.packagingOrder.update({
        where: { id },
        data: writeData,
      });

      // Если пришёл график платежей — заменяем существующие
      if (data.payments) {
        await tx.payment.deleteMany({ where: { packagingOrderId: id } });
        if (data.payments.length > 0) {
          await tx.payment.createMany({
            data: data.payments.map((p) => ({
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

    return NextResponse.json(updated);
  } catch (e) {
    return apiError(e);
  }
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireAuth();
    const { id } = await ctx.params;
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
    return NextResponse.json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}
