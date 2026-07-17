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
import { ShipmentCostAllocation } from "@/components/shipments/shipment-cost-allocation";
import { ShipmentPackagingSection } from "@/components/shipments/shipment-packaging-section";
import { buildCargoAllocation } from "@/server/cargo-allocation";
import { buildCargoPreview } from "@/server/cargo-preview";
import { CargoContentCell } from "@/components/shipments/cargo-content-cell";
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
              productModel: { select: { name: true, artikulBase: true, photoUrls: true } },
              batches: { select: { id: true } },
            },
          },
          items: { orderBy: [{ colorName: "asc" }, { size: "asc" }] },
        },
      },
      packagingBatches: {
        orderBy: { createdAt: "asc" },
        include: {
          packagingOrder: {
            select: { id: true, orderNumber: true, status: true, batches: { select: { id: true } } },
          },
          items: {
            select: {
              plannedQty: true,
              packagingItem: { select: { name: true, photoUrl: true } },
            },
          },
        },
      },
    },
  });

  if (!shipment) return notFound();

  // Кандидаты-упаковка: не отменённые заказы, у которых нет партий вовсе
  // (партия создастся лениво) или есть партия без карго.
  const pkgCandidatesRaw = canManage
    ? await prisma.packagingOrder.findMany({
        where: { status: { not: "CANCELLED" } },
        select: {
          id: true,
          orderNumber: true,
          batches: { select: { id: true, shipmentId: true, items: { select: { plannedQty: true } } } },
          lines: { select: { quantity: true, packagingItem: { select: { name: true } } } },
        },
        orderBy: { orderedDate: "desc" },
        take: 100,
      })
    : [];
  const pkgCandidates = pkgCandidatesRaw.filter(
    (p) => p.batches.length === 0 || p.batches.some((b) => b.shipmentId == null),
  );

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
          lines: { select: { quantity: true } },
          batches: { select: { id: true, shipmentId: true, items: { select: { plannedQty: true } } } },
        },
        orderBy: { createdAt: "desc" },
        take: 300,
      })
    : [];

  // Оставляем те, у кого нет партий вовсе или есть партия без поставки.
  // Остаток «не уехало» = свободные партии (или весь заказ, если партий нет).
  const remainingOf = (o: {
    lines: Array<{ quantity: number }>;
    batches: Array<{ shipmentId: string | null; items: Array<{ plannedQty: number }> }>;
  }) =>
    o.batches.length === 0
      ? o.lines.reduce((a, l) => a + l.quantity, 0)
      : o.batches
          .filter((b) => b.shipmentId == null)
          .reduce((a, b) => a + b.items.reduce((x, i) => x + i.plannedQty, 0), 0);

  const addable = candidateOrders
    .filter((o) => o.batches.length === 0 || o.batches.some((b) => b.shipmentId == null))
    .map((o) => ({
      id: o.id,
      orderNumber: o.orderNumber,
      modelName: o.productModel.name,
      remainingQty: remainingOf(o),
    }))
    .filter((o) => o.remainingQty > 0);

  const totalUnits = shipment.batches.reduce(
    (a, b) => a + b.items.reduce((x, i) => x + i.plannedQty, 0),
    0,
  );
  const ordersCount = new Set(shipment.batches.map((b) => b.order.id)).size;
  const preview = buildCargoPreview(shipment);

  // Раскидка стоимости карго по весу (если на накладной есть деньги).
  const allocation = await buildCargoAllocation(shipment.id);
  const lineHrefs = new Map<string, string>([
    ...shipment.batches.map((b) => [`batch:${b.id}`, `/orders/${b.order.id}`] as const),
    ...shipment.packagingBatches.map(
      (b) => [`pkgbatch:${b.id}`, `/packaging-orders/${b.packagingOrder.id}`] as const,
    ),
  ]);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Link href="/shipments" className="text-xs text-slate-400 hover:text-slate-600">
            ← Карго
          </Link>
          {/* Человеческое имя карго = что внутри (Алёна 17.07); номера — мелко */}
          <h1 className="mt-1 text-2xl font-semibold text-slate-900 dark:text-slate-100">{preview.title}</h1>
          <p className="font-mono text-xs text-slate-400 dark:text-slate-500">
            {shipment.number}
            {shipment.cargoNumber ? ` · ${shipment.cargoNumber}` : ""}
          </p>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Заказов: {ordersCount} · штук: {totalUnits}
            {shipment.departDate ? ` · выезд ${formatDate(shipment.departDate)}` : ""}
            {shipment.arriveDate ? ` · прибытие ${formatDate(shipment.arriveDate)}` : ""}
          </p>
          <div className="mt-2">
            <CargoContentCell preview={preview} />
          </div>
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
          usdRubRate={shipment.usdRubRate != null ? String(shipment.usdRubRate) : null}
          initial={{
            cargoNumber: shipment.cargoNumber ?? "",
            placesCount: shipment.placesCount != null ? String(shipment.placesCount) : "",
            weightKg: shipment.weightKg != null ? String(shipment.weightKg) : "",
            // Итог: сам amountUsdt, а если когда-то были разнесены компоненты — их сумма.
            amountUsdt:
              shipment.amountUsdt != null
                ? String(shipment.amountUsdt)
                : shipment.freightUsd != null || shipment.insuranceUsd != null || shipment.packingFeeUsd != null
                  ? String(
                      Number(shipment.freightUsd ?? 0) +
                        Number(shipment.insuranceUsd ?? 0) +
                        Number(shipment.packingFeeUsd ?? 0),
                    )
                  : "",
            cargoPaidAt: shipment.cargoPaidAt ? shipment.cargoPaidAt.toISOString().slice(0, 10) : "",
            arrivalActualDate: shipment.arrivalActualDate ? shipment.arrivalActualDate.toISOString().slice(0, 10) : "",
            waybillPhotoUrls: shipment.waybillPhotoUrls,
          }}
        />
      </section>

      {/* Раскидка стоимости карго по весу содержимого → себестоимость */}
      {allocation && allocation.lines.length > 0 ? (
        <section>
          <h2 className="mb-2 text-base font-semibold text-slate-900 dark:text-slate-100">
            Раскидка стоимости по весу
          </h2>
          <ShipmentCostAllocation
            canManage={canManage}
            rows={allocation.lines.map((l) => ({
              key: l.key,
              kind: l.kind,
              label: l.label,
              href: lineHrefs.get(l.key) ?? "#",
              qty: l.qty,
              autoWeightKg: l.autoWeightKg,
              overrideWeightKg: l.overrideWeightKg,
              effectiveWeightKg: l.effectiveWeightKg,
              amountRub: l.amountRub,
              perUnitRub: l.perUnitRub,
            }))}
            summary={{
              totalUsd: allocation.totalUsd,
              rate: allocation.rate,
              rateIsFixed: allocation.rateIsFixed,
              totalRub: allocation.totalRub,
              sumLinesWeightKg: allocation.sumLinesWeightKg,
              waybillWeightKg: allocation.waybillWeightKg,
              weightMismatchKg: allocation.weightMismatchKg,
              hasLinesWithoutWeight: allocation.linesWithoutWeight.length > 0,
            }}
            missingWeights={allocation.missingWeights.map((m) => ({ label: m.label, href: m.href }))}
          />
        </section>
      ) : null}

      {/* Упаковка едет тем же карго — партиями (может ехать частями) */}
      <ShipmentPackagingSection
        shipmentId={shipment.id}
        canManage={canManage}
        attached={shipment.packagingBatches.map((b) => ({
          batchId: b.id,
          inKit: b.inKit,
          packagingOrderId: b.packagingOrder.id,
          orderNumber: b.packagingOrder.orderNumber,
          batchLabel:
            b.packagingOrder.batches.length > 1
              ? `партия ${b.index}/${b.packagingOrder.batches.length}`
              : null,
          qty: b.items.reduce((a, i) => a + i.plannedQty, 0),
          itemNames: b.items
            .slice(0, 2)
            .map((i) => i.packagingItem.name)
            .join(", ") + (b.items.length > 2 ? ` (+${b.items.length - 2})` : ""),
          statusLabel: PACKAGING_ORDER_STATUS_LABELS[b.packagingOrder.status],
          statusCls: PACKAGING_ORDER_STATUS_COLORS[b.packagingOrder.status],
        }))}
        candidates={pkgCandidates.map((c) => ({
          id: c.id,
          orderNumber: c.orderNumber,
          itemNames: pkgNames(c.lines),
          remainingQty: remainingOf(c),
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
