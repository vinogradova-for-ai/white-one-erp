import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, apiError } from "@/server/api-helpers";
import { assertCan } from "@/lib/rbac";
import { shipmentFromOrdersSchema } from "@/lib/validators/shipment";
import { ensureBatchForShipment } from "@/server/batches";
import { logAudit } from "@/server/audit";

async function nextShipmentNumber() {
  const year = new Date().getUTCFullYear();
  const last = await prisma.shipment.findFirst({
    where: { number: { startsWith: `SHP-${year}-` } },
    orderBy: { number: "desc" },
    select: { number: true },
  });
  const lastNum = last ? Number(last.number.split("-").pop()) : 0;
  return `SHP-${year}-${String(lastNum + 1).padStart(4, "0")}`;
}

// POST /api/shipments/from-orders { orderIds: string[] }
// «Собрать поставку из выбранных» на «Заказах в пути»: создаёт поставку и кладёт
// в неё по свободной партии каждого заказа (партия создаётся лениво, как при
// одиночном добавлении). Заказы, у которых все партии уже в поставках, — в skipped.
export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth();
    assertCan(session.user.role, "shipment.manage");
    const { orderIds } = shipmentFromOrdersSchema.parse(await req.json());

    const orders = await prisma.order.findMany({
      where: { id: { in: orderIds }, deletedAt: null },
      select: { id: true, orderNumber: true },
    });
    if (orders.length === 0) {
      return NextResponse.json(
        { error: { code: "not_found", message: "Заказы не найдены" } },
        { status: 404 },
      );
    }

    const number = await nextShipmentNumber();
    const result = await prisma.$transaction(async (tx) => {
      const shipment = await tx.shipment.create({
        data: { number, createdById: session.user.id },
      });
      const added: string[] = [];
      const skipped: Array<{ orderId: string; orderNumber: string }> = [];
      for (const order of orders) {
        const batch = await ensureBatchForShipment(tx, order.id);
        if (!batch) {
          skipped.push({ orderId: order.id, orderNumber: order.orderNumber });
          continue;
        }
        await tx.orderBatch.update({ where: { id: batch.batchId }, data: { shipmentId: shipment.id } });
        added.push(order.id);
      }
      // Ни одного заказа не удалось положить — пустую поставку не оставляем.
      if (added.length === 0) {
        await tx.shipment.delete({ where: { id: shipment.id } });
        return { shipment: null, added, skipped };
      }
      return { shipment, added, skipped };
    });

    if (!result.shipment) {
      return NextResponse.json(
        {
          error: {
            code: "no_free_batch",
            message: "У выбранных заказов все партии уже в поставках. Разбейте заказ на партии на его карточке.",
          },
        },
        { status: 400 },
      );
    }

    await logAudit({
      action: "CREATE",
      entityType: "Shipment",
      entityId: result.shipment.id,
      userId: session.user.id,
      changes: { number, fromOrders: result.added, skipped: result.skipped.map((s) => s.orderNumber) },
    });

    return NextResponse.json({
      shipmentId: result.shipment.id,
      number,
      added: result.added.length,
      skipped: result.skipped,
    });
  } catch (e) {
    return apiError(e);
  }
}
