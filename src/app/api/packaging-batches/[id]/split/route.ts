import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, apiError } from "@/server/api-helpers";
import { assertCan } from "@/lib/rbac";
import { packagingBatchSplitSchema } from "@/lib/validators/shipment";
import { splitBatchPlan } from "@/lib/batches/batch-logic";
import { logAudit } from "@/server/audit";

// Разбить партию упаковки на две: указанное кол-во каждой позиции УЕЗЖАЕТ в
// НОВУЮ партию (без карго), остаток остаётся в исходной. Зеркало разбиения
// партий одежды (17.07: упаковка едет частями разными карго).
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAuth();
    assertCan(session.user.role, "shipment.manage");
    const { id: batchId } = await ctx.params;
    const { move } = packagingBatchSplitSchema.parse(await req.json());

    const batch = await prisma.packagingOrderBatch.findUnique({
      where: { id: batchId },
      include: { items: true },
    });
    if (!batch) {
      return NextResponse.json({ error: { code: "not_found", message: "Партия упаковки не найдена" } }, { status: 404 });
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
      return NextResponse.json({ error: { code: "empty_source", message: "Нельзя перенести всю партию — останется пустой. Уберите партию из карго вместо разбиения." } }, { status: 400 });
    }

    const newBatch = await prisma.$transaction(async (tx) => {
      const agg = await tx.packagingOrderBatch.aggregate({
        where: { packagingOrderId: batch.packagingOrderId },
        _max: { index: true },
      });
      const nextIndex = (agg._max.index ?? 0) + 1;

      const created = await tx.packagingOrderBatch.create({
        data: {
          packagingOrderId: batch.packagingOrderId,
          index: nextIndex,
          items: {
            create: batch.items
              .filter((i) => (moveMap[i.id] ?? 0) > 0)
              .map((i) => ({
                packagingItemId: i.packagingItemId,
                plannedQty: moveMap[i.id],
              })),
          },
        },
      });

      // Исходные позиции: остаток keep. keep=0 → удаляем строку.
      for (const i of batch.items) {
        const k = keep[i.id];
        if (k <= 0) {
          await tx.packagingOrderBatchItem.delete({ where: { id: i.id } });
        } else if (k !== i.plannedQty) {
          await tx.packagingOrderBatchItem.update({ where: { id: i.id }, data: { plannedQty: k } });
        }
      }

      return created;
    });

    await logAudit({
      action: "UPDATE",
      entityType: "PackagingOrderBatch",
      entityId: batchId,
      userId: session.user.id,
      changes: { splitInto: newBatch.id, moved: totalMove },
    });

    return NextResponse.json({ ok: true, newBatchId: newBatch.id });
  } catch (e) {
    return apiError(e);
  }
}
