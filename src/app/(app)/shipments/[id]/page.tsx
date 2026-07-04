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
import { ShipmentCargoPanel } from "@/components/shipments/shipment-cargo-panel";
import { ShipmentPackagingSection } from "@/components/shipments/shipment-packaging-section";
import { PACKAGING_ORDER_STATUS_LABELS, PACKAGING_ORDER_STATUS_COLORS } from "@/lib/packaging-orders";

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
      packagingOrders: {
        orderBy: { orderedDate: "asc" },
        include: { lines: { select: { packagingItem: { select: { name: true } } } } },
      },
    },
  });

  if (!shipment) return notFound();

  // Кандидаты-упаковка: ещё не в поставке и не отменённые.
  const pkgCandidates = canManage
    ? await prisma.packagingOrder.findMany({
        where: { shipmentId: null, status: { not: "CANCELLED" } },
        select: {
          id: true,
          orderNumber: true,
          lines: { select: { packagingItem: { select: { name: true } } }, take: 3 },
        },
        orderBy: { orderedDate: "desc" },
        take: 100,
      })
    : [];

  const pkgNames = (lines: Array<{ packagingItem: { name: string } }>, total?: number) => {
    const names = lines.map((l) => l.packagingItem.name);
    const shown = names.slice(0, 2).join(", ");
    const more = (total ?? names.length) - Math.min(2, names.length);
    return shown + (more > 0 ? ` (+${more})` : "");
  };

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

      {/* Карго-накладная: номер, места, вес, USDT, оплата, факт прибытия */}
      <section>
        <h2 className="mb-2 text-base font-semibold text-slate-900 dark:text-slate-100">Карго</h2>
        <ShipmentCargoPanel
          shipmentId={shipment.id}
          canManage={canManage}
          initial={{
            cargoNumber: shipment.cargoNumber ?? "",
            placesCount: shipment.placesCount != null ? String(shipment.placesCount) : "",
            weightKg: shipment.weightKg != null ? String(shipment.weightKg) : "",
            amountUsdt: shipment.amountUsdt != null ? String(shipment.amountUsdt) : "",
            cargoPaidAt: shipment.cargoPaidAt ? shipment.cargoPaidAt.toISOString().slice(0, 10) : "",
            arrivalActualDate: shipment.arrivalActualDate ? shipment.arrivalActualDate.toISOString().slice(0, 10) : "",
          }}
        />
      </section>

      {/* Упаковка едет тем же карго */}
      <ShipmentPackagingSection
        shipmentId={shipment.id}
        canManage={canManage}
        attached={shipment.packagingOrders.map((p) => ({
          id: p.id,
          orderNumber: p.orderNumber,
          itemNames: pkgNames(p.lines),
          statusLabel: PACKAGING_ORDER_STATUS_LABELS[p.status],
          statusCls: PACKAGING_ORDER_STATUS_COLORS[p.status],
        }))}
        candidates={pkgCandidates.map((c) => ({
          id: c.id,
          orderNumber: c.orderNumber,
          itemNames: pkgNames(c.lines),
        }))}
      />

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
