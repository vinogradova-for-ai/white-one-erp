import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth, apiError } from "@/server/api-helpers";
import { assertCan } from "@/lib/rbac";
import { getCbrRate } from "@/server/currency-rates";
import { logAudit } from "@/server/audit";
import { syncOrderDatesFromQc } from "@/server/sync-order-dates-from-cargo";

// ОТК Китай на заказе: добавить проверку (дата, сумма, валюта — курс ЦБ
// фиксируется на дату ОТК) / мягко удалить.

const createSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  amount: z.union([z.number(), z.string()]).transform((v) => Number(String(v).replace(",", "."))).pipe(z.number().positive()),
  currency: z.enum(["CNY", "USD", "RUB"]).default("CNY"),
  comment: z.string().max(500).optional().nullable(),
  // Партии заказа, принятые к этому ОТК (прожарка 17.07: ОТК — мероприятие).
  batchIds: z.array(z.string().min(1)).optional(),
});

const updateSchema = z.object({
  qcId: z.string().min(1),
  // Галка «ОТК завершён» с датой; null — снять завершение.
  finishedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  batchIds: z.array(z.string().min(1)).optional(),
});

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAuth();
    assertCan(session.user.role, "order.update");
    const { id: orderId } = await ctx.params;
    const data = createSchema.parse(await req.json());

    const order = await prisma.order.findFirst({ where: { id: orderId, deletedAt: null } });
    if (!order) {
      return NextResponse.json({ error: { code: "not_found", message: "Заказ не найден" } }, { status: 404 });
    }

    let rubRate: number | null = 1;
    if (data.currency !== "RUB") {
      try {
        rubRate = await getCbrRate(data.currency, new Date(data.date));
      } catch {
        rubRate = null; // курс подтянется позже, сумма покажется в валюте
      }
    }

    const qc = await prisma.chinaQc.create({
      data: {
        orderId,
        date: new Date(data.date),
        amount: data.amount,
        currency: data.currency,
        rubRate,
        comment: data.comment ?? null,
        createdById: session.user.id,
        ...(data.batchIds?.length
          ? { batches: { connect: data.batchIds.map((id) => ({ id })) } }
          : {}),
      },
    });

    // Факт ОТК уточняет Гант (конец Производства = старт самого раннего ОТК).
    await syncOrderDatesFromQc(orderId, session.user.id);

    await logAudit({
      action: "UPDATE",
      entityType: "Order",
      entityId: orderId,
      userId: session.user.id,
      changes: { chinaQcAdded: qc.id, amount: data.amount, currency: data.currency },
    });

    return NextResponse.json({ qc });
  } catch (e) {
    return apiError(e);
  }
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAuth();
    assertCan(session.user.role, "order.update");
    const { id: orderId } = await ctx.params;
    const data = updateSchema.parse(await req.json());

    const qc = await prisma.chinaQc.findFirst({ where: { id: data.qcId, orderId, deletedAt: null } });
    if (!qc) {
      return NextResponse.json({ error: { code: "not_found", message: "ОТК не найден" } }, { status: 404 });
    }

    await prisma.chinaQc.update({
      where: { id: qc.id },
      data: {
        ...(data.finishedAt !== undefined
          ? { finishedAt: data.finishedAt ? new Date(data.finishedAt) : null }
          : {}),
        ...(data.batchIds !== undefined
          ? { batches: { set: data.batchIds.map((id) => ({ id })) } }
          : {}),
      },
    });

    await syncOrderDatesFromQc(orderId, session.user.id);

    await logAudit({
      action: "UPDATE",
      entityType: "Order",
      entityId: orderId,
      userId: session.user.id,
      changes: { chinaQcUpdated: qc.id, finishedAt: data.finishedAt ?? null },
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAuth();
    // Удаление записей — только OWNER/DIRECTOR (закон кабинета).
    assertCan(session.user.role, "order.delete");
    const { id: orderId } = await ctx.params;
    const { qcId } = z.object({ qcId: z.string().min(1) }).parse(await req.json());

    const qc = await prisma.chinaQc.findFirst({ where: { id: qcId, orderId, deletedAt: null } });
    if (!qc) {
      return NextResponse.json({ error: { code: "not_found", message: "ОТК не найден" } }, { status: 404 });
    }
    await prisma.chinaQc.update({ where: { id: qcId }, data: { deletedAt: new Date() } });
    await syncOrderDatesFromQc(orderId, session.user.id);

    await logAudit({
      action: "UPDATE",
      entityType: "Order",
      entityId: orderId,
      userId: session.user.id,
      changes: { chinaQcRemoved: qcId },
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}
