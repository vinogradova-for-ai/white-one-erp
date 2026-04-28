import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { formatCurrency, formatDate, formatDateTime, formatNumber, yearMonthToLabel } from "@/lib/format";
import {
  ORDER_STATUS_LABELS, ORDER_STATUS_COLORS,
  ORDER_TYPE_LABELS, DELIVERY_METHOD_LABELS,
} from "@/lib/constants";
import { PhotoThumb } from "@/components/common/photo-thumb";
import { DeleteButton } from "@/components/common/delete-button";
import { InlineCheckbox } from "@/components/common/inline-checkbox";
import { OrderPackagingSection } from "@/components/orders/order-packaging-section";
import { OrderLinesSection } from "@/components/orders/order-lines-section";
import { OrderTimelineEditor } from "@/components/orders/order-timeline-editor";

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const order = await prisma.order.findFirst({
    where: { id, deletedAt: null },
    include: {
      productModel: { include: { sizeGrid: true } },
      lines: {
        include: { productVariant: true },
        orderBy: { createdAt: "asc" },
      },
      factory: true,
      owner: { select: { name: true } },
      statusLogs: {
        orderBy: { changedAt: "desc" },
        take: 10,
        include: { changedBy: { select: { name: true } } },
      },
      packagingItems: {
        include: {
          packagingItem: {
            select: {
              id: true, name: true, type: true, stock: true, photoUrl: true,
              packagingOrderLines: {
                where: { packagingOrder: { status: { notIn: ["ARRIVED", "CANCELLED"] } } },
                select: { quantity: true },
              },
            },
          },
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!order) return notFound();

  const [availablePackagingRaw, modelVariants] = await Promise.all([
    prisma.packagingItem.findMany({
      where: { isActive: true },
      select: {
        id: true, name: true, type: true, stock: true,
        packagingOrderLines: {
          where: { packagingOrder: { status: { notIn: ["ARRIVED", "CANCELLED"] } } },
          select: { quantity: true },
        },
      },
      orderBy: { name: "asc" },
    }),
    prisma.productVariant.findMany({
      where: { productModelId: order.productModelId, deletedAt: null },
      orderBy: { colorName: "asc" },
      select: { id: true, sku: true, colorName: true, photoUrls: true },
    }),
  ]);

  const sizes = order.productModel.sizeGrid?.sizes ?? [];
  const totalQty = order.lines.reduce((a, l) => a + l.quantity, 0);
  const totalBatchCost = order.lines.reduce((a, l) => a + Number(l.batchCost ?? 0), 0);
  const unitCost = totalQty > 0 ? totalBatchCost / totalQty : 0;
  const modelPhoto = order.productModel.photoUrls[0] ?? null;
  const endpoint = `/api/orders/${order.id}`;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {/* Шапка */}
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex min-w-0 flex-1 items-center gap-4">
          <PhotoThumb url={modelPhoto} size={56} />
          <div className="min-w-0">
            <div className="font-mono text-[11px] uppercase tracking-wider text-slate-400">{order.orderNumber}</div>
            <h1 className="mt-1 truncate text-2xl font-semibold tracking-tight text-slate-900">
              <Link href={`/models/${order.productModel.id}`} className="hover:underline">
                {order.productModel.name}
              </Link>
            </h1>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <span>{ORDER_TYPE_LABELS[order.orderType]}</span>
              <span>·</span>
              <span>{yearMonthToLabel(order.launchMonth)}</span>
              <span>·</span>
              <span>{order.lines.length} {order.lines.length === 1 ? "цвет" : "цвета"}</span>
              <span>·</span>
              <span>{formatNumber(totalQty)} шт</span>
              {order.isDelayed && <span className="text-red-600">· задержка</span>}
              {order.hasIssue && <span className="text-red-600">· проблема</span>}
            </div>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${ORDER_STATUS_COLORS[order.status]}`}>
            {ORDER_STATUS_LABELS[order.status]}
          </span>
          <Link
            href={`/orders/${order.id}/edit`}
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
          >
            Редактировать
          </Link>
          <DeleteButton
            apiPath={`/api/orders/${order.id}`}
            redirectTo="/orders"
            confirmText={`Удалить заказ #${order.orderNumber}? Восстановить будет нельзя.`}
          />
        </div>
      </header>

      {/* Экономика — три KPI */}
      <div className="grid grid-cols-3 gap-3">
        <Kpi label="Себестоимость шт" value={unitCost > 0 ? formatCurrency(unitCost) : "—"} />
        <Kpi label="Кол-во штук" value={formatNumber(totalQty)} />
        <Kpi label="Себестоимость партии" value={totalBatchCost > 0 ? formatCurrency(totalBatchCost) : "—"} accent />
      </div>

      {/* Параметры — однорядный набор фактов */}
      <div className="rounded-2xl bg-white p-5">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm md:grid-cols-4">
          <Fact label="Фабрика" value={order.factory?.name ?? "—"} />
          <Fact label="Ответственный" value={order.owner.name} />
          <Fact label="Доставка" value={order.deliveryMethod ? DELIVERY_METHOD_LABELS[order.deliveryMethod] : "—"} />
          <Fact label="Условия оплаты" value={order.paymentTerms ?? "—"} />
        </dl>
      </div>

      {/* Позиции */}
      <section>
        <h2 className="mb-3 text-base font-semibold text-slate-900">Позиции</h2>
        <OrderLinesSection
          orderId={order.id}
          sizes={sizes}
          modelVariants={modelVariants}
          modelPhotoUrl={modelPhoto}
          initialLines={order.lines.map((l) => ({
            id: l.id,
            productVariantId: l.productVariantId,
            sku: l.productVariant.sku,
            colorName: l.productVariant.colorName,
            photoUrl: l.productVariant.photoUrls[0] ?? null,
            quantity: l.quantity,
            sizeDistribution: (l.sizeDistribution as Record<string, number> | null) ?? null,
            sizeDistributionActual: (l.sizeDistributionActual as Record<string, number> | null) ?? null,
            batchCost: Number(l.batchCost ?? 0),
          }))}
        />
      </section>

      {/* Упаковка */}
      <section>
        <h2 className="mb-3 text-base font-semibold text-slate-900">Упаковка</h2>
        <div className="rounded-2xl bg-white p-5">
          <OrderPackagingSection
            orderId={order.id}
            orderQuantity={totalQty}
            initialItems={order.packagingItems.map((p) => ({
              id: p.id,
              packagingItemId: p.packagingItemId,
              quantityPerUnit: Number(p.quantityPerUnit),
              notes: p.notes,
              packagingItem: {
                id: p.packagingItem.id,
                name: p.packagingItem.name,
                type: p.packagingItem.type,
                stock: p.packagingItem.stock,
                photoUrl: p.packagingItem.photoUrl,
                inProductionQty: p.packagingItem.packagingOrderLines.reduce((a, l) => a + l.quantity, 0),
              },
            }))}
            availablePackaging={availablePackagingRaw.map((a) => ({
              id: a.id,
              name: a.name,
              type: a.type,
              stock: a.stock,
              inProductionQty: a.packagingOrderLines.reduce((sum, l) => sum + l.quantity, 0),
            }))}
          />
        </div>
      </section>

      {/* Гант-таймлайн заказа: тащи плашки, чтобы изменить даты — сохраняется автоматически */}
      <section>
        <h2 className="mb-3 text-base font-semibold text-slate-900">Таймлайн</h2>
        <div className="rounded-2xl bg-white p-5">
          <OrderTimelineEditor
            orderId={order.id}
            launchMonth={`${String(order.launchMonth).slice(0, 4)}-${String(order.launchMonth).slice(4, 6)}`}
            initial={{
              readyAtFactoryDate: order.readyAtFactoryDate ? order.readyAtFactoryDate.toISOString().slice(0, 10) : "",
              qcDate: order.qcDate ? order.qcDate.toISOString().slice(0, 10) : "",
              arrivalPlannedDate: order.arrivalPlannedDate ? order.arrivalPlannedDate.toISOString().slice(0, 10) : "",
            }}
          />
        </div>
      </section>

      {order.statusLogs.length > 0 && (
        <details className="rounded-2xl bg-white">
          <summary className="cursor-pointer select-none px-5 py-4 text-sm font-medium text-slate-700 hover:text-slate-900">
            История статусов
          </summary>
          <div className="space-y-3 border-t border-slate-100 px-5 py-5">
            <ul className="space-y-1.5 text-xs">
              {order.statusLogs.map((log) => (
                <li key={log.id} className="flex items-center gap-2">
                  <span className="text-slate-400">{log.fromStatus ? ORDER_STATUS_LABELS[log.fromStatus] : "—"}</span>
                  <span className="text-slate-300">→</span>
                  <span className="font-medium text-slate-700">{ORDER_STATUS_LABELS[log.toStatus]}</span>
                  <span className="ml-auto text-slate-400">
                    {formatDateTime(log.changedAt)} · {log.changedBy.name}
                  </span>
                </li>
              ))}
            </ul>
            {order.notes && (
              <div>
                <div className="mb-2 text-[11px] uppercase tracking-wider text-slate-400">Примечания</div>
                <p className="whitespace-pre-line text-sm text-slate-700">{order.notes}</p>
              </div>
            )}
          </div>
        </details>
      )}
    </div>
  );
}

function Kpi({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={`rounded-2xl px-5 py-4 ${accent ? "bg-slate-900 text-white" : "bg-white"}`}>
      <div className={`text-[11px] uppercase tracking-wider ${accent ? "text-slate-400" : "text-slate-400"}`}>{label}</div>
      <div className={`mt-0.5 truncate text-xl font-semibold ${accent ? "text-white" : "text-slate-900"}`}>{value}</div>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 sm:flex-col sm:items-start sm:gap-0">
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="text-right text-sm text-slate-900 sm:text-left">{value}</dd>
    </div>
  );
}
