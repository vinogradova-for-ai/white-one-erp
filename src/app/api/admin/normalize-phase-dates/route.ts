import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/server/api-helpers";
import { logAudit } from "@/server/audit";
import {
  normalizeOrderDates,
  orderDatesChanged,
  normalizePackagingDates,
  packagingDatesChanged,
  NORMALIZE_DEFAULTS,
} from "@/lib/normalize-phase-dates";

// Доступ: только OWNER. Это разовая операция нормализации таймлайнов всех заказов.
export async function POST() {
  try {
    const session = await requireAuth();
    if (session.user.role !== "OWNER") {
      return NextResponse.json({ error: { code: "forbidden", message: "Только владелец может нормализовать таймлайны" } }, { status: 403 });
    }

    const orders = await prisma.order.findMany({
      where: { deletedAt: null },
      select: {
        id: true,
        orderNumber: true,
        decisionDate: true,
        handedToFactoryDate: true,
        readyAtFactoryDate: true,
        qcDate: true,
        arrivalPlannedDate: true,
        createdAt: true,
      },
    });

    let ordersChanged = 0;
    for (const o of orders) {
      const n = normalizeOrderDates(o);
      if (!orderDatesChanged(o, n)) continue;
      await prisma.order.update({
        where: { id: o.id },
        data: {
          decisionDate: n.decisionDate,
          handedToFactoryDate: n.handedToFactoryDate,
          readyAtFactoryDate: n.readyAtFactoryDate,
          qcDate: n.qcDate,
          arrivalPlannedDate: n.arrivalPlannedDate,
        },
      });
      ordersChanged += 1;
    }

    let packagingChanged = 0;
    let packagingTotal = 0;
    try {
      // Поле decisionDate в PackagingOrder появилось в миграции 20260509221315.
      // На локальных БД может не быть — оборачиваем в try.
      const packs = await prisma.packagingOrder.findMany({
        select: {
          id: true,
          decisionDate: true,
          orderedDate: true,
          productionEndDate: true,
          expectedDate: true,
          createdAt: true,
        },
      });
      packagingTotal = packs.length;
      for (const p of packs) {
        const n = normalizePackagingDates(p);
        if (!packagingDatesChanged(p, n)) continue;
        await prisma.packagingOrder.update({
          where: { id: p.id },
          data: {
            decisionDate: n.decisionDate,
            orderedDate: n.orderedDate,
            productionEndDate: n.productionEndDate,
            expectedDate: n.expectedDate,
          },
        });
        packagingChanged += 1;
      }
    } catch (err) {
      console.warn("[normalize-phase-dates] packaging skipped:", (err as Error).message);
    }

    await logAudit({
      action: "UPDATE",
      entityType: "Order",
      entityId: "bulk:normalize-phase-dates",
      userId: session.user.id,
      changes: { ordersChanged, packagingChanged },
    });

    return NextResponse.json({
      ok: true,
      orders: { total: orders.length, changed: ordersChanged },
      packaging: { total: packagingTotal, changed: packagingChanged },
      defaults: NORMALIZE_DEFAULTS,
    });
  } catch (err) {
    console.error("[normalize-phase-dates] error:", err);
    return NextResponse.json(
      { error: { code: "internal", message: (err as Error).message } },
      { status: 500 },
    );
  }
}
