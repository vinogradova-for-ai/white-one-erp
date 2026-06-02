import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/server/api-helpers";
import { logAudit } from "@/server/audit";

// Применяет один таймлайн (5 дат) ко ВСЕМ активным заказам.
// Только OWNER. Используется когда Алёна сказала: «у всех заказов одни и те же
// фазы — разработка тогда-то, производство тогда-то, и т.д.».

const bodySchema = z.object({
  decisionDate: z.string().min(1),
  handedToFactoryDate: z.string().min(1),
  readyAtFactoryDate: z.string().min(1),
  qcDate: z.string().min(1),
  arrivalPlannedDate: z.string().min(1),
});

export async function POST(req: Request) {
  try {
    const session = await requireAuth();
    if (session.user.role !== "OWNER") {
      return NextResponse.json({ error: { code: "forbidden" } }, { status: 403 });
    }
    const dates = bodySchema.parse(await req.json());

    const orders = await prisma.order.findMany({
      where: { deletedAt: null, status: { not: "ON_SALE" } },
      select: { id: true, orderNumber: true },
    });

    let updated = 0;
    for (const o of orders) {
      await prisma.order.update({
        where: { id: o.id },
        data: {
          decisionDate: new Date(dates.decisionDate),
          handedToFactoryDate: new Date(dates.handedToFactoryDate),
          readyAtFactoryDate: new Date(dates.readyAtFactoryDate),
          qcDate: new Date(dates.qcDate),
          arrivalPlannedDate: new Date(dates.arrivalPlannedDate),
        },
      });
      updated += 1;
    }

    await logAudit({
      action: "UPDATE",
      entityType: "Order",
      entityId: "ALL",
      userId: session.user.id,
      changes: {
        updated,
        total: orders.length,
        decisionDate: dates.decisionDate,
        handedToFactoryDate: dates.handedToFactoryDate,
        readyAtFactoryDate: dates.readyAtFactoryDate,
        qcDate: dates.qcDate,
        arrivalPlannedDate: dates.arrivalPlannedDate,
      },
    });

    return NextResponse.json({ ok: true, updated, total: orders.length });
  } catch (err) {
    return NextResponse.json(
      { error: { code: "internal", message: (err as Error).message } },
      { status: 500 },
    );
  }
}
