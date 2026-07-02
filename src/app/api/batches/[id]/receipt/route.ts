import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, apiError } from "@/server/api-helpers";
import { assertCan } from "@/lib/rbac";
import { batchReceiptSchema } from "@/lib/validators/shipment";
import { syncOrderOnBatchReceived, sumOrderFactQty } from "@/server/batches";
import { logAudit } from "@/server/audit";

// PATCH — сохранить факт/брак/заметки по строкам партии + добавить/удалить строки
// (фабрика сшила другой размер → добавляем строку руками). Не завершает приёмку.
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAuth();
    assertCan(session.user.role, "shipment.manage");
    const { id: batchId } = await ctx.params;
    const { items, deletedItemIds } = batchReceiptSchema.parse(await req.json());

    const batch = await prisma.orderBatch.findUnique({
      where: { id: batchId },
      select: { id: true, receivedAt: true, items: { select: { id: true } } },
    });
    if (!batch) {
      return NextResponse.json({ error: { code: "not_found", message: "Партия не найдена" } }, { status: 404 });
    }

    const existingIds = new Set(batch.items.map((i) => i.id));

    await prisma.$transaction(async (tx) => {
      // Удаления (только строки этой партии).
      if (deletedItemIds?.length) {
        await tx.orderBatchItem.deleteMany({
          where: { id: { in: deletedItemIds.filter((x) => existingIds.has(x)) }, batchId },
        });
      }
      for (const it of items) {
        if (it.id && existingIds.has(it.id)) {
          await tx.orderBatchItem.update({
            where: { id: it.id },
            data: {
              colorName: it.colorName,
              size: it.size,
              plannedQty: it.plannedQty,
              factQty: it.factQty ?? null,
              defectQty: it.defectQty ?? null,
              note: it.note ?? null,
            },
          });
        } else {
          // Новая строка (фабрика сшила размер/цвет вне заказа).
          await tx.orderBatchItem.create({
            data: {
              batchId,
              variantId: it.variantId ?? null,
              colorName: it.colorName,
              size: it.size,
              plannedQty: it.plannedQty,
              factQty: it.factQty ?? null,
              defectQty: it.defectQty ?? null,
              note: it.note ?? null,
            },
          });
        }
      }
    });

    await logAudit({
      action: "UPDATE",
      entityType: "OrderBatch",
      entityId: batchId,
      userId: session.user.id,
      changes: { receiptSaved: items.length },
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}

// POST — завершить приёмку партии: проставить receivedAt, обновить quantityActual
// линий заказа (Σ факта), и если приняты ВСЕ партии — двинуть заказ в WAREHOUSE_MSK.
export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAuth();
    assertCan(session.user.role, "shipment.manage");
    const { id: batchId } = await ctx.params;

    const batch = await prisma.orderBatch.findUnique({
      where: { id: batchId },
      select: { id: true, orderId: true, receivedAt: true },
    });
    if (!batch) {
      return NextResponse.json({ error: { code: "not_found", message: "Партия не найдена" } }, { status: 404 });
    }
    if (batch.receivedAt) {
      return NextResponse.json({ error: { code: "already_received", message: "Приёмка партии уже завершена" } }, { status: 400 });
    }

    await prisma.orderBatch.update({ where: { id: batchId }, data: { receivedAt: new Date() } });

    await logAudit({
      action: "STATUS_CHANGE",
      entityType: "OrderBatch",
      entityId: batchId,
      userId: session.user.id,
      changes: { received: true },
    });

    // Если приняты все партии — заказ в WAREHOUSE_MSK + arrivalActualDate + quantityActual.
    await syncOrderOnBatchReceived({
      orderId: batch.orderId,
      actorId: session.user.id,
      actorRole: session.user.role,
    });

    // quantityActual заказа = Σ факта по всем партиям — кладём в первую линию как
    // сводный факт заказа не имеет смысла; вместо этого агрегат доступен на карточке.
    // (Линии quantityActual правит этап ОТК; здесь только считаем для сводки.)
    const totalFact = await sumOrderFactQty(batch.orderId);

    return NextResponse.json({ ok: true, totalFact });
  } catch (e) {
    return apiError(e);
  }
}
