import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { formatCurrency, formatDate, formatDateTime, formatNumber, yearMonthToLabel } from "@/lib/format";
import {
  ORDER_STATUS_LABELS, ORDER_STATUS_COLORS,
  ORDER_TYPE_LABELS, DELIVERY_METHOD_LABELS, QC_DEFECT_LABELS,
} from "@/lib/constants";
import { PhotoThumb } from "@/components/common/photo-thumb";
import { OrderStatusChanger } from "@/components/orders/order-status-changer";
import { OrderReceivingForm } from "@/components/orders/order-receiving-form";
import { OrderQcForm } from "@/components/orders/order-qc-form";
import { InlineCheckbox } from "@/components/common/inline-checkbox";
import { InlineUrlField } from "@/components/common/inline-url-field";

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
  const endpoint = `/api/orders/${order.id}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <PhotoThumb url={order.productVariant.photoUrls[0]} size={64} />
          <div className="min-w-0">
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
                {ORDER_TYPE_LABELS[order.orderType]} · {yearMonthToLabel(order.launchMonth)} · {formatNumber(order.quantity)} шт
              </span>
              {order.isDelayed && <span className="text-xs text-red-600">⚠ Задержка</span>}
              {order.hasIssue && <span className="text-xs text-red-600">🔴 Проблема</span>}
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <Link
            href={`/orders/${order.id}/edit`}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
          >
            Редактировать
          </Link>
          <OrderStatusChanger orderId={order.id} currentStatus={order.status} />
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <Card title="Параметры">
          <Row label="Фабрика" value={order.factory?.name ?? "—"} />
          <Row label="Ответственный" value={order.owner.name} />
          <Row label="Способ доставки" value={order.deliveryMethod ? DELIVERY_METHOD_LABELS[order.deliveryMethod] : "—"} />
          <Row label="Упаковка" value={order.packagingType ?? "—"} />
        </Card>

        <Card title="Экономика">
          <Row label="Себестоимость партии" value={formatCurrency(order.batchCost?.toString())} />
          <Row label="Плановая выручка" value={formatCurrency(order.plannedRevenue?.toString())} />
          <Row label="Плановая маржа" value={formatCurrency(order.plannedMargin?.toString())} />
        </Card>

        <Card title="Оплаты">
          <Row label="Условия" value={order.paymentTerms ?? "—"} />
          <Row label="Предоплата" value={
            order.prepaymentAmount ? formatCurrency(order.prepaymentAmount.toString()) : "—"
          } />
          <div className="pt-1">
            <InlineCheckbox label="Предоплата оплачена" checked={order.prepaymentPaid} endpoint={endpoint} field="prepaymentPaid" />
          </div>
          <Row label="Остаток" value={
            order.finalPaymentAmount ? formatCurrency(order.finalPaymentAmount.toString()) : "—"
          } />
          <div className="pt-1">
            <InlineCheckbox label="Остаток оплачен" checked={order.finalPaymentPaid} endpoint={endpoint} field="finalPaymentPaid" />
          </div>
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

        <Card title="WB">
          <Row label="Отгрузка на WB" value={formatDate(order.wbShipmentDate)} />
          <Row label="Старт продаж" value={formatDate(order.saleStartDate)} />
          <div className="pt-1">
            <InlineCheckbox label="Карточка WB готова" checked={order.wbCardReady} endpoint={endpoint} field="wbCardReady" />
          </div>
        </Card>
      </div>

      {/* === Секция упаковки (якорь #packing) === */}
      <section id="packing">
        <Card title="Упаковка">
          <div className="space-y-2">
            <InlineCheckbox label="Упаковка заказана" checked={order.packagingOrdered} endpoint={endpoint} field="packagingOrdered" />
            {order.packagingType && <p className="text-xs text-slate-500">Тип: {order.packagingType}</p>}
          </div>
        </Card>
      </section>

      {/* === Секция ВЭД (якорь #customs) === */}
      <section id="customs">
        <Card title="ВЭД — документы">
          <div className="space-y-3">
            <InlineCheckbox label="Спецификация готова" checked={order.specReady} endpoint={endpoint} field="specReady" />
            <InlineUrlField label="Ссылка на спецификацию" value={order.specUrl} endpoint={endpoint} field="specUrl" />
            <div className="border-t border-slate-100 pt-3">
              <InlineCheckbox label="Декларация готова" checked={order.declarationReady} endpoint={endpoint} field="declarationReady" />
              <div className="mt-2">
                <InlineUrlField label="Ссылка на декларацию" value={order.declarationUrl} endpoint={endpoint} field="declarationUrl" />
              </div>
            </div>
          </div>
        </Card>
      </section>

      {/* === Размерная матрица (план vs факт) === */}
      {sizes.length > 0 && (
        <section id="receiving">
          <Card title="Приёмка — распределение по размерам">
            <OrderReceivingForm
              orderId={order.id}
              sizes={sizes}
              plannedDist={sizeDist}
              actualDist={actualDist}
              quantity={order.quantity}
            />
          </Card>
        </section>
      )}

      {/* === ОТК === */}
      <section id="qc">
        <Card title="ОТК (контроль качества)">
          <OrderQcForm
            orderId={order.id}
            initial={{
              qcDate: order.qcDate,
              qcQuantityOk: order.qcQuantityOk,
              qcQuantityDefects: order.qcQuantityDefects,
              qcDefectsPhotoUrl: order.qcDefectsPhotoUrl,
              qcDefectCategory: order.qcDefectCategory,
              qcReplacedByFactory: order.qcReplacedByFactory,
              qcResolutionNote: order.qcResolutionNote,
            }}
          />
          {order.qcDefectCategory && (
            <p className="mt-3 text-xs text-slate-500">
              Текущая категория брака: {QC_DEFECT_LABELS[order.qcDefectCategory]}
            </p>
          )}
        </Card>
      </section>

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
