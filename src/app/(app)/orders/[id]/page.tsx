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
import { OrderStatusChanger } from "@/components/orders/order-status-changer";
import { OrderBatchesSection } from "@/components/orders/order-batches-section";
import { CommentsThread } from "@/components/comments/comments-thread";
import { auth } from "@/lib/auth";
import { can } from "@/lib/rbac";
import type { Role } from "@prisma/client";
import { syncModelPackagingToOrders } from "@/server/sync-model-packaging";
import { backfillOrderEconomicsFromModel } from "@/server/backfill-order-economics";
import { syncOrderStatusForward } from "@/server/sync-order-status";
import { orderLateDays } from "@/lib/order-auto-status";
import { resolveModelCost } from "@/lib/calculations/resolve-model-cost";
import { getPaymentFactInfo } from "@/lib/payments/payout-queries";

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  const sessionUser = session?.user as { id?: string; role?: string } | undefined;
  const currentUserId = sessionUser?.id;
  const isAdmin = sessionUser?.role === "OWNER" || sessionUser?.role === "DIRECTOR";
  // Смена статуса — PM и выше (RBAC). Read-only роли кнопку не видят;
  // бэкенд-роут /api/orders/[id]/status всё равно перепроверяет право.
  const canChangeStatus = sessionUser?.role
    ? can(sessionUser.role as Role, "order.updateStatus")
    : false;
  // Авто-синк упаковки фасона. Если у фасона есть привязанная упаковка,
  // которая по какой-то причине не «протекла» в этот заказ — она
  // подтянется при следующем открытии заказа. Идемпотентно.
  const orderHead = await prisma.order.findUnique({
    where: { id },
    select: { productModelId: true, status: true },
  });
  if (orderHead && orderHead.status !== "ON_SALE") {
    await syncModelPackagingToOrders(orderHead.productModelId);
  }
  // Авто-бэкфилл себестоимости: если у линий нет snapshotFullCost, но у
  // фасона есть fullCost — проставим. Видим колонку «Себестоимость шт» и
  // «Себестоимость партии» сразу, без ручного ввода. Идемпотентно.
  await backfillOrderEconomicsFromModel(id);

  // Авто-статус по таймлайну: если по датам заказ уже дальше записанного статуса
  // (напр. qcDate в прошлом → товар едет), двигаем статус вперёд. Иначе он
  // «застревал» бы до следующего ручного сохранения. Идемпотентно, forward-only.
  await syncOrderStatusForward(id);

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
      payments: {
        where: { type: "ORDER" },
        orderBy: { plannedDate: "asc" },
      },
      batches: {
        orderBy: { index: "asc" },
        include: {
          shipment: { select: { id: true, number: true, status: true } },
          items: { orderBy: [{ colorName: "asc" }, { size: "asc" }] },
        },
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

  // Статус плановых платежей по ФАКТУ (разнесённые оплаты фабрикам).
  const paymentFact = await getPaymentFactInfo(order.payments.map((p) => p.id));
  const planKopecks = order.payments.reduce((a, p) => a + Math.round(Number(p.amount) * 100), 0);
  const paidKopecks = order.payments.reduce((a, p) => a + (paymentFact.get(p.id)?.allocatedKopecks ?? 0), 0);
  const remainderKopecks = Math.max(0, planKopecks - paidKopecks);

  const sizes = order.productModel.sizeGrid?.sizes ?? [];
  const totalQty = order.lines.reduce((a, l) => a + l.quantity, 0);
  // Опаздывает N дней: план прибытия прошёл, факта нет — подсветка без смены статуса (аудит п.6).
  const lateDays = orderLateDays({
    readyAtFactoryDate: order.readyAtFactoryDate,
    qcDate: order.qcDate,
    arrivalPlannedDate: order.arrivalPlannedDate,
    arrivalActualDate: order.arrivalActualDate,
  });
  // Fallback на лету: если у линии не сохранён batchCost, ищем себестоимость
  // в фасоне через общий хелпер (тот же приоритет, что в форме и backfill).
  const modelFullCost = resolveModelCost(order.productModel) ?? 0;
  const totalBatchCost = order.lines.reduce((a, l) => {
    const lc = Number(l.batchCost ?? 0);
    if (lc > 0) return a + lc;
    return a + modelFullCost * l.quantity;
  }, 0);
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
            <h1 className="mt-1 truncate text-xl font-semibold tracking-tight text-slate-900 md:text-2xl">
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
              {order.isDelayed && <span className="text-red-600 dark:text-red-300">· задержка</span>}
              {order.hasIssue && <span className="text-red-600 dark:text-red-300">· проблема</span>}
            </div>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${ORDER_STATUS_COLORS[order.status]}`}>
            {ORDER_STATUS_LABELS[order.status]}
          </span>
          {lateDays > 0 && (
            <span className="rounded-full bg-amber-100 dark:bg-amber-400/10 px-2.5 py-1 text-xs font-semibold text-amber-700 dark:text-amber-300">
              опаздывает {lateDays} дн
            </span>
          )}
          {canChangeStatus && (
            <OrderStatusChanger orderId={order.id} currentStatus={order.status} />
          )}
          <Link
            href={`/orders/${order.id}/edit`}
            className="flex h-10 items-center rounded-lg border border-slate-200 bg-white px-4 text-sm text-slate-700 hover:bg-slate-50 active:bg-slate-100"
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

      {/* Экономика — три KPI.
          На мобиле «Себестоимость партии» (главное число для собственника)
          растягивается на 2 колонки сверху, две другие — снизу в одной строке.
          На ≥md — три равных в одну строку, порядок как раньше. */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <div className="order-2 md:order-none">
          <Kpi label="Себестоимость шт" value={unitCost > 0 ? formatCurrency(unitCost) : "—"} />
        </div>
        <div className="order-3 md:order-none">
          <Kpi label="Кол-во штук" value={formatNumber(totalQty)} />
        </div>
        <div className="order-1 col-span-2 md:order-none md:col-span-1">
          <Kpi label="Себестоимость партии" value={totalBatchCost > 0 ? formatCurrency(totalBatchCost) : "—"} accent />
        </div>
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
            quantityActual: l.quantityActual,
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

      {/* Партии и доставка */}
      <section>
        <h2 className="mb-3 text-base font-semibold text-slate-900">Партии и доставка</h2>
        <OrderBatchesSection
          canManage={canChangeStatus}
          totalBatches={order.batches.length}
          batches={order.batches.map((b) => ({
            id: b.id,
            index: b.index,
            receivedAt: b.receivedAt ? b.receivedAt.toISOString() : null,
            shipment: b.shipment
              ? { id: b.shipment.id, number: b.shipment.number, status: b.shipment.status }
              : null,
            items: b.items.map((i) => ({
              id: i.id,
              colorName: i.colorName,
              size: i.size,
              plannedQty: i.plannedQty,
              factQty: i.factQty,
              defectQty: i.defectQty,
            })),
          }))}
        />
      </section>

      {/* График платежей */}
      <section>
        <h2 className="mb-3 text-base font-semibold text-slate-900">График платежей</h2>
        <div className="rounded-2xl bg-white p-5">
          {order.payments.length === 0 ? (
            <div className="space-y-2">
              <p className="text-sm text-slate-500">График ещё не задан.</p>
              <Link
                href={`/orders/${order.id}/edit`}
                className="inline-flex h-10 items-center rounded-lg bg-slate-900 px-4 text-sm font-medium text-white hover:bg-slate-800"
              >
                Заполнить график платежей
              </Link>
            </div>
          ) : (
            <div className="space-y-1.5">
              {order.payments.map((pp) => {
                const fact = paymentFact.get(pp.id);
                const st = fact?.status ?? (pp.status === "PAID" ? "legacy-paid" : "unpaid");
                // Точка-индикатор: оплачен (в т.ч. legacy) — зелёный, частично — синий, нет — янтарный.
                const dot =
                  st === "paid" || st === "legacy-paid" ? "bg-emerald-500" : st === "partial" ? "bg-blue-500" : "bg-amber-400";
                const firstPayout = fact?.payouts[0];
                let statusText: string;
                if (st === "paid" && firstPayout) {
                  statusText = `оплачен ${formatDate(firstPayout.date)}`;
                } else if (st === "paid") {
                  statusText = "оплачен";
                } else if (st === "partial") {
                  const paid = (fact?.allocatedKopecks ?? 0) / 100;
                  statusText = `частично ${formatCurrency(paid)} из ${formatCurrency(Number(pp.amount))}`;
                } else if (st === "legacy-paid") {
                  statusText = "оплачен (старая запись)";
                } else {
                  statusText = "не оплачен";
                }
                return (
                  <div key={pp.id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <span className={`inline-block h-2 w-2 shrink-0 rounded-full ${dot}`} />
                      <span className="text-slate-900">{pp.label}</span>
                      <span className="text-xs text-slate-500">· {formatDate(pp.plannedDate)}</span>
                      <span className="text-xs text-slate-500">· {statusText}</span>
                    </div>
                    <div className="text-sm font-medium text-slate-900">{formatCurrency(Number(pp.amount))}</div>
                  </div>
                );
              })}
              <div className="mt-2 grid grid-cols-3 gap-2 border-t border-slate-100 pt-2 text-center text-xs">
                <div>
                  <div className="text-slate-500">План</div>
                  <div className="font-semibold text-slate-900">{formatCurrency(planKopecks / 100)}</div>
                </div>
                <div>
                  <div className="text-slate-500">Оплачено</div>
                  <div className="font-semibold text-emerald-700 dark:text-emerald-300">{formatCurrency(paidKopecks / 100)}</div>
                </div>
                <div>
                  <div className="text-slate-500">Остаток</div>
                  <div className={`font-semibold ${remainderKopecks > 0 ? "text-amber-700 dark:text-amber-300" : "text-slate-900"}`}>
                    {formatCurrency(remainderKopecks / 100)}
                  </div>
                </div>
              </div>
            </div>
          )}
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
              decisionDate: order.decisionDate ? order.decisionDate.toISOString().slice(0, 10) : "",
              handedToFactoryDate: order.handedToFactoryDate ? order.handedToFactoryDate.toISOString().slice(0, 10) : "",
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

      <CommentsThread
        entityType="order"
        entityId={order.id}
        currentUserId={currentUserId}
        isAdmin={isAdmin}
        includeRelated
      />
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
