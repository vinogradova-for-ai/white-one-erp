import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { formatCurrency, formatDate, formatDateTime, formatNumber, yearMonthToLabel } from "@/lib/format";
import {
  ORDER_STATUS_LABELS, ORDER_STATUS_COLORS,
  ORDER_TYPE_LABELS, DELIVERY_METHOD_LABELS,
  QC_DEFECT_LABELS,
} from "@/lib/constants";
import { PhotoThumb, PhotoGallery } from "@/components/common/photo-thumb";
import { OrderStatusChanger } from "@/components/orders/order-status-changer";

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const order = await prisma.order.findFirst({
    where: { id, deletedAt: null },
    include: {
      productVariant: {
        include: { productModel: { include: { sizeGrid: true } } },
      },
      factory: true,
      owner: { select: { name: true } },
      statusLogs: {
        orderBy: { changedAt: "desc" },
        take: 20,
        include: { changedBy: { select: { name: true } } },
      },
    },
  });

  if (!order) return notFound();

  const sizeDist = order.sizeDistribution as Record<string, number> | null;
  const actualDist = order.sizeDistributionActual as Record<string, number> | null;
  const sizes = order.productVariant.productModel.sizeGrid?.sizes ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-3">
            <PhotoThumb url={order.productVariant.photoUrls[0]} size={64} />
            <div>
              <div className="font-mono text-xs text-slate-500">{order.orderNumber}</div>
              <h1 className="text-2xl font-semibold text-slate-900">
                <Link href={`/variants/${order.productVariant.id}`} className="hover:underline">
                  {order.productVariant.productModel.name}
                </Link>
                {" · "}
                <span className="text-slate-700">{order.productVariant.colorName}</span>
              </h1>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <span className={`rounded px-2 py-0.5 text-xs ${ORDER_STATUS_COLORS[order.status]}`}>
                  {ORDER_STATUS_LABELS[order.status]}
                </span>
                <span className="text-xs text-slate-500">
                  {ORDER_TYPE_LABELS[order.orderType]} · {yearMonthToLabel(order.launchMonth)}
                </span>
                {order.isDelayed && <span className="text-xs text-red-600">⚠ Задержка</span>}
                {order.hasIssue && <span className="text-xs text-red-600">🔴 Проблема</span>}
              </div>
            </div>
          </div>
        </div>
        <OrderStatusChanger orderId={order.id} currentStatus={order.status} />
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <Card title="Параметры">
          <Row label="Количество" value={`${formatNumber(order.quantity)} шт`} />
          <Row label="Фабрика" value={order.factory?.name ?? "—"} />
          <Row label="Ответственный" value={order.owner.name} />
          <Row label="Способ доставки" value={order.deliveryMethod ? DELIVERY_METHOD_LABELS[order.deliveryMethod] : "—"} />
          <Row label="Упаковка" value={order.packagingType ?? "—"} />
          <Row label="Упаковка заказана" value={order.packagingOrdered ? "✓" : "Нет"} />
        </Card>

        <Card title="Экономика">
          <Row label="Себестоимость партии" value={formatCurrency(order.batchCost?.toString())} />
          <Row label="Плановая выручка" value={formatCurrency(order.plannedRevenue?.toString())} />
          <Row label="Плановая маржа" value={formatCurrency(order.plannedMargin?.toString())} />
        </Card>

        <Card title="Оплаты">
          <Row label="Условия" value={order.paymentTerms ?? "—"} />
          <Row label="Предоплата" value={
            order.prepaymentAmount
              ? `${formatCurrency(order.prepaymentAmount.toString())} ${order.prepaymentPaid ? "✓" : "(не опл.)"}`
              : "—"
          } />
          <Row label="Остаток" value={
            order.finalPaymentAmount
              ? `${formatCurrency(order.finalPaymentAmount.toString())} ${order.finalPaymentPaid ? "✓" : "(не опл.)"}`
              : "—"
          } />
        </Card>

        <Card title="Производство">
          <Row label="Решение" value={formatDate(order.decisionDate)} />
          <Row label="Передача на фабрику" value={formatDate(order.handedToFactoryDate)} />
          <Row label="Начало пошива" value={formatDate(order.sewingStartDate)} />
          <Row label="Готово на фабрике" value={formatDate(order.readyAtFactoryDate)} />
        </Card>

        <Card title="Логистика">
          <Row label="Отгрузка" value={formatDate(order.shipmentDate)} />
          <Row label="Прибытие план" value={formatDate(order.arrivalPlannedDate)} />
          <Row label="Прибытие факт" value={formatDate(order.arrivalActualDate)} />
          <Row label="Упаковка" value={formatDate(order.packingDoneDate)} />
        </Card>

        <Card title="WB и ВЭД">
          <Row label="Отгрузка на WB" value={formatDate(order.wbShipmentDate)} />
          <Row label="Старт продаж" value={formatDate(order.saleStartDate)} />
          <Row label="Спецификация" value={order.specReady ? "Готова ✓" : "—"} />
          <Row label="Декларация" value={order.declarationReady ? "Готова ✓" : "—"} />
          <Row label="Карточка WB" value={order.wbCardReady ? "Готова ✓" : "—"} />
        </Card>
      </div>

      {/* Размерная матрица */}
      {sizes.length > 0 && (sizeDist || actualDist) && (
        <Card title={`Размерная матрица${order.productVariant.productModel.sizeGrid?.name ? ` (${order.productVariant.productModel.sizeGrid.name})` : ""}`}>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-2 py-2 text-left text-xs font-semibold text-slate-500">Размер</th>
                  {sizes.map((s) => (
                    <th key={s} className="px-2 py-2 text-center text-xs font-semibold text-slate-500">{s}</th>
                  ))}
                  <th className="px-2 py-2 text-center text-xs font-semibold text-slate-500">Итого</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-t border-slate-100">
                  <td className="px-2 py-2 text-xs text-slate-600">План</td>
                  {sizes.map((s) => (
                    <td key={s} className="px-2 py-2 text-center text-sm">{sizeDist?.[s] ?? 0}</td>
                  ))}
                  <td className="px-2 py-2 text-center font-medium">{order.quantity}</td>
                </tr>
                {actualDist && (
                  <tr className="border-t border-slate-100">
                    <td className="px-2 py-2 text-xs text-slate-600">Факт</td>
                    {sizes.map((s) => (
                      <td key={s} className="px-2 py-2 text-center text-sm text-emerald-700">{actualDist[s] ?? 0}</td>
                    ))}
                    <td className="px-2 py-2 text-center font-medium text-emerald-700">
                      {Object.values(actualDist).reduce((a, b) => a + b, 0)}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* ОТК */}
      <Card title="ОТК (контроль качества)">
        {order.qcDate || order.qcQuantityOk !== null ? (
          <div className="space-y-2">
            <Row label="Дата ОТК" value={formatDate(order.qcDate)} />
            <Row label="Принято" value={order.qcQuantityOk !== null ? formatNumber(order.qcQuantityOk) : "—"} />
            <Row label="Брак" value={order.qcQuantityDefects !== null ? formatNumber(order.qcQuantityDefects) : "—"} />
            {order.qcDefectCategory && <Row label="Категория брака" value={QC_DEFECT_LABELS[order.qcDefectCategory]} />}
            <Row label="Фабрика заменила" value={order.qcReplacedByFactory ? "Да" : "Нет"} />
            {order.qcResolutionNote && <Row label="Решение" value={order.qcResolutionNote} />}
            {order.qcDefectsPhotoUrl && (
              <Row label="Фото дефектов" value={
                <a href={order.qcDefectsPhotoUrl} target="_blank" rel="noopener" className="text-blue-600 hover:underline">открыть</a>
              } />
            )}
          </div>
        ) : (
          <p className="text-sm text-slate-500">ОТК ещё не пройден</p>
        )}
      </Card>

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
