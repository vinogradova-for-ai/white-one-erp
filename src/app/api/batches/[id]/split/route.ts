import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, apiError } from "@/server/api-helpers";
import { assertCan } from "@/lib/rbac";
import { batchSplitSchema } from "@/lib/validators/shipment";
import { splitBatchPlan } from "@/lib/batches/batch-logic";
import { logAudit } from "@/server/audit";

// Разбить партию на две: указанное кол-во каждой позиции УЕЗЖАЕТ в НОВУЮ партию
// (без поставки), остаток остаётся в исходной. Нельзя разбивать принятую партию.
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAuth();
    assertCan(session.user.role, "shipment.manage");
    const { id: batchId } = await ctx.params;
    const { move } = batchSplitSchema.parse(await req.json());

    const batch = await prisma.orderBatch.findUnique({
      where: { id: batchId },
      include: { items: true },
    });
    if (!batch) {
      return NextResponse.json({ error: { code: "not_found", message: "Партия не найдена" } }, { status: 404 });
    }
    if (batch.receivedAt) {
      return NextResponse.json({ error: { code: "already_received", message: "Принятую партию разбить нельзя" } }, { status: 400 });
    }

    const { keep, move: moveMap } = splitBatchPlan(
      batch.items.map((i) => ({ id: i.id, plannedQty: i.plannedQty })),
      move,
    );
    const totalMove = Object.values(moveMap).reduce((a, b) => a + b, 0);
    if (totalMove <= 0) {
      return NextResponse.json({ error: { code: "nothing_to_move", message: "Укажите, сколько единиц уезжает в новую партию" } }, { status: 400 });
    }
    const totalKeep = Object.values(keep).reduce((a, b) => a + b, 0);
    if (totalKeep <= 0) {
      return NextResponse.json({ error: { code: "empty_source", message: "Нельзя перенести всю партию — останется пустой. Убери партию из поставки вместо разбиения." } }, { status: 400 });
    }

    const newBatch = await prisma.$transaction(async (tx) => {
      // Следующий index в заказе.
      const agg = await tx.orderBatch.aggregate({
        where: { orderId: batch.orderId },
        _max: { index: true },
      });
      const nextIndex = (agg._max.index ?? 0) + 1;

      // Новая партия — без поставки, с позициями move>0.
      const created = await tx.orderBatch.create({
        data: {
          orderId: batch.orderId,
          index: nextIndex,
          items: {
            create: batch.items
              .filter((i) => (moveMap[i.id] ?? 0) > 0)
              .map((i) => ({
                variantId: i.variantId,
                colorName: i.colorName,
                size: i.size,
                plannedQty: moveMap[i.id],
              })),
          },
        },
      });

      // Обновляем исходные позиции: остаток keep. keep=0 → удаляем строку.
      for (const i of batch.items) {
        const k = keep[i.id];
        if (k <= 0) {
          await tx.orderBatchItem.delete({ where: { id: i.id } });
        } else if (k !== i.plannedQty) {
          await tx.orderBatchItem.update({ where: { id: i.id }, data: { plannedQty: k } });
        }
      }

      return created;
    });

    await logAudit({
      action: "UPDATE",
      entityType: "OrderBatch",
      entityId: batchId,
      userId: session.user.id,
      changes: { splitInto: newBatch.id, moved: totalMove },
    });

    return NextResponse.json({ ok: true, newBatchId: newBatch.id });
  } catch (e) {
    return apiError(e);
  }
}
