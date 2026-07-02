import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/format";
import { SHIPMENT_STATUS_LABELS, SHIPMENT_STATUS_COLORS } from "@/lib/constants";
import { auth } from "@/lib/auth";
import { can } from "@/lib/rbac";
import type { Role } from "@prisma/client";
import { ShipmentStatusBar } from "@/components/shipments/shipment-status-bar";
import { ShipmentAddOrder } from "@/components/shipments/shipment-add-order";
import { ShipmentBatchCard } from "@/components/shipments/shipment-batch-card";
import { ShipmentDeleteButton } from "@/components/shipments/shipment-delete-button";

export default async function ShipmentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  const role = (session?.user as { role?: string } | undefined)?.role as Role | undefined;
  const canManage = role ? can(role, "shipment.manage") : false;
  const canDelete = role ? can(role, "shipment.delete") : false;

  const shipment = await prisma.shipment.findFirst({
    where: { id, deletedAt: null },
    include: {
      createdBy: { select: { name: true } },
      batches: {
        orderBy: { index: "asc" },
        include: {
          order: {
            select: {
              id: true,
              orderNumber: true,
              productModel: { select: { name: true } },
              batches: { select: { id: true } },
            },
          },
          items: { orderBy: [{ colorName: "asc" }, { size: "asc" }] },
        },
      },
    },
  });

  if (!shipment) return notFound();

  // Заказы, которые можно добавить: активные, не в статусе продажи, у которых
  // есть свободная партия ИЛИ ещё нет партий (создастся лениво). Простой список.
  const candidateOrders = canManage
    ? await prisma.order.findMany({
        where: {
          deletedAt: null,
          status: { notIn: ["SHIPPED_WB", "ON_SALE"] },
        },
        select: {
          id: true,
          orderNumber: true,
          productModel: { select: { name: true } },
          batches: { select: { id: true, shipmentId: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 300,
      })
    : [];

  // Оставляем те, у кого нет партий вовсе или есть партия без поставки.
  const addable = candidateOrders
    .filter((o) => o.batches.length === 0 || o.batches.some((b) => b.shipmentId == null))
    .map((o) => ({ id: o.id, orderNumber: o.orderNumber, modelName: o.productModel.name }));

  const totalUnits = shipment.batches.reduce(
    (a, b) => a + b.items.reduce((x, i) => x + i.plannedQty, 0),
    0,
  );
  const ordersCount = new Set(shipment.batches.map((b) => b.order.id)).size;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Link href="/shipments" className="text-xs text-slate-400 hover:text-slate-600">
            ← Поставки
          </Link>
          <h1 className="mt-1 text-2xl font-semibold text-slate-900 dark:text-slate-100">{shipment.number}</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Заказов: {ordersCount} · штук: {totalUnits}
            {shipment.departDate ? ` · выезд ${formatDate(shipment.departDate)}` : ""}
            {shipment.arriveDate ? ` · прибытие ${formatDate(shipment.arriveDate)}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`rounded-lg px-2.5 py-1 text-sm font-medium ${SHIPMENT_STATUS_COLORS[shipment.status]}`}>
            {SHIPMENT_STATUS_LABELS[shipment.status]}
          </span>
          {canDelete ? <ShipmentDeleteButton shipmentId={shipment.id} /> : null}
        </div>
      </header>

      {canManage ? <ShipmentStatusBar shipmentId={shipment.id} status={shipment.status} /> : null}

      {canManage ? (
        <section>
          <h2 className="mb-2 text-base font-semibold text-slate-900 dark:text-slate-100">Добавить заказ</h2>
          <ShipmentAddOrder shipmentId={shipment.id} orders={addable} />
        </section>
      ) : null}

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Партии по заказам</h2>
        {shipment.batches.length === 0 ? (
          <div className="rounded-2xl bg-white p-6 text-center text-sm text-slate-500 dark:bg-slate-900 dark:text-slate-400">
            В поставке ещё нет партий. Добавьте заказ выше.
          </div>
        ) : (
          shipment.batches.map((b) => (
            <ShipmentBatchCard
              key={b.id}
              shipmentId={shipment.id}
              shipmentStatus={shipment.status}
              canManage={canManage}
              batch={{
                id: b.id,
                index: b.index,
                totalBatches: b.order.batches.length,
                receivedAt: b.receivedAt ? b.receivedAt.toISOString() : null,
                order: {
                  id: b.order.id,
                  orderNumber: b.order.orderNumber,
                  modelName: b.order.productModel.name,
                },
                items: b.items.map((i) => ({
                  id: i.id,
                  variantId: i.variantId,
                  colorName: i.colorName,
                  size: i.size,
                  plannedQty: i.plannedQty,
                  factQty: i.factQty,
                  defectQty: i.defectQty,
                  note: i.note,
                })),
              }}
            />
          ))
        )}
      </section>
    </div>
  );
}
