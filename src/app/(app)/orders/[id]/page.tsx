import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { formatCurrency, formatDate, formatDateTime, yearMonthToLabel } from "@/lib/format";
import { ORDER_STATUS_LABELS, ORDER_STATUS_COLORS, ORDER_TYPE_LABELS, BRAND_LABELS, DELIVERY_METHOD_LABELS } from "@/lib/constants";
import { OrderStatusChanger } from "@/components/orders/order-status-changer";

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const order = await prisma.order.findFirst({
    where: { id, deletedAt: null },
    include: {
      product: true,
      factory: true,
      owner: { select: { name: true } },
      statusLogs: {
        orderBy: { changedAt: "desc" },
        take: 30,
        include: { changedBy: { select: { name: true } } },
      },
    },
  });

  if (!order) return notFound();

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="font-mono text-xs text-slate-500">{order.orderNumber}</div>
          <h1 className="text-2xl font-semibold text-slate-900">
            <Link href={`/products/${order.product.id}`} className="hover:underline">
              {order.product.name}
            </Link>
          </h1>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <span className={`inline-block rounded px-2 py-0.5 text-xs ${ORDER_STATUS_COLORS[order.status]}`}>
              {ORDER_STATUS_LABELS[order.status]}
            </span>
            <span className="text-xs text-slate-500">
              · {ORDER_TYPE_LABELS[order.orderType]} · {BRAND_LABELS[order.product.brand]} · {yearMonthToLabel(order.launchMonth)}
            </span>
            {order.isDelayed && <span className="text-xs text-red-600">⚠ Задержка</span>}
            {order.hasIssue && <span className="text-xs text-red-600">🔴 Проблема</span>}
          </div>
        </div>
        <OrderStatusChanger orderId={order.id} currentStatus={order.status} />
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <Card title="Параметры">
          <Row label="Артикул" value={order.product.sku} />
          <Row label="Количество" value={`${order.quantity} шт`} />
          <Row label="Фабрика" value={order.factory?.name ?? "—"} />
          <Row label="Ответственный" value={order.owner.name} />
          <Row label="Способ доставки" value={order.deliveryMethod ? DELIVERY_METHOD_LABELS[order.deliveryMethod] : "—"} />
        </Card>

        <Card title="Экономика партии">
          <Row label="Себестоимость партии" value={formatCurrency(order.batchCost?.toString())} />
          <Row label="Плановая выручка" value={formatCurrency(order.plannedRevenue?.toString())} />
          <Row label="Плановая маржа" value={formatCurrency(order.plannedMargin?.toString())} />
          <Row label="Факт. выручка" value={formatCurrency(order.actualRevenue?.toString())} />
          <Row label="Факт. маржа" value={formatCurrency(order.actualMargin?.toString())} />
        </Card>

        <Card title="Оплаты">
          <Row label="Условия" value={order.paymentTerms ?? "—"} />
          <Row label="Предоплата" value={
            order.prepaymentAmount ?
              `${formatCurrency(order.prepaymentAmount.toString())} ${order.prepaymentPaid ? "✓" : "(не оплачено)"}`
              : "—"
          } />
          <Row label="Остаток" value={
            order.finalPaymentAmount ?
              `${formatCurrency(order.finalPaymentAmount.toString())} ${order.finalPaymentPaid ? "✓" : "(не оплачено)"}`
              : "—"
          } />
        </Card>

        <Card title="Производство — даты">
          <Row label="Решение о запуске" value={formatDate(order.decisionDate)} />
          <Row label="Передача на фабрику" value={formatDate(order.handedToFactoryDate)} />
          <Row label="Начало пошива" value={formatDate(order.sewingStartDate)} />
          <Row label="Готовность на фабрике" value={formatDate(order.readyAtFactoryDate)} />
        </Card>

        <Card title="Логистика — даты">
          <Row label="Отгрузка" value={formatDate(order.shipmentDate)} />
          <Row label="Прибытие (план)" value={formatDate(order.arrivalPlannedDate)} />
          <Row label="Прибытие (факт)" value={formatDate(order.arrivalActualDate)} />
          <Row label="Упаковка" value={formatDate(order.packingDoneDate)} />
        </Card>

        <Card title="WB — даты">
          <Row label="Отгрузка на WB" value={formatDate(order.wbShipmentDate)} />
          <Row label="Старт продаж" value={formatDate(order.saleStartDate)} />
          <Row label="Карточка готова" value={order.wbCardReady ? "Да ✓" : "Нет"} />
        </Card>

        <Card title="Упаковка и ВЭД">
          <Row label="Тип упаковки" value={order.packagingType ?? "—"} />
          <Row label="Упаковка заказана" value={order.packagingOrdered ? "Да ✓" : "Нет"} />
          <Row label="Спецификация" value={order.specReady ? "Готова ✓" : "Нет"} />
          <Row label="Декларация" value={order.declarationReady ? "Готова ✓" : "Нет"} />
        </Card>
      </div>

      {order.notes && (
        <Card title="Примечания">
          <p className="whitespace-pre-line text-sm text-slate-700">{order.notes}</p>
        </Card>
      )}

      <Card title="История статусов">
        <ul className="space-y-2 text-sm">
          {order.statusLogs.map((log) => (
            <li key={log.id} className="flex justify-between gap-4 border-b border-slate-100 pb-2 last:border-0">
              <div>
                <span className="text-slate-500">{log.fromStatus ? ORDER_STATUS_LABELS[log.fromStatus] : "—"}</span>
                <span className="mx-2 text-slate-400">→</span>
                <span className="font-medium text-slate-900">{ORDER_STATUS_LABELS[log.toStatus]}</span>
                {log.comment && <div className="text-xs text-slate-500">{log.comment}</div>}
              </div>
              <div className="text-right text-xs text-slate-500">
                {formatDateTime(log.changedAt)}
                <div>{log.changedBy.name}</div>
              </div>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</h2>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3 text-sm">
      <span className="text-slate-600">{label}</span>
      <span className="text-right text-slate-900">{value}</span>
    </div>
  );
}
