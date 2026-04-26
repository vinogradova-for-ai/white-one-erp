import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { formatDate, formatNumber, formatCurrency } from "@/lib/format";
import { PACKAGING_ORDER_STATUS_LABELS, PACKAGING_ORDER_STATUS_COLORS } from "@/lib/packaging-orders";
import { DELIVERY_METHOD_LABELS } from "@/lib/constants";
import { PhotoThumb } from "@/components/common/photo-thumb";
import { PackagingOrderActions } from "@/components/packaging-orders/packaging-order-actions";
import { PackagingOrderStatus } from "@prisma/client";

function lineTotalRub(line: {
  quantity: number;
  unitPriceRub: { toString(): string } | null;
  unitPriceCny: { toString(): string } | null;
  priceCurrency: string | null;
  cnyRubRate: { toString(): string } | null;
}): number {
  const isCny = line.priceCurrency === "CNY";
  if (isCny && line.unitPriceCny && line.cnyRubRate) {
    return Number(line.unitPriceCny) * Number(line.cnyRubRate) * line.quantity;
  }
  if (!isCny && line.unitPriceRub) {
    return Number(line.unitPriceRub) * line.quantity;
  }
  return 0;
}

export default async function PackagingOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const order = await prisma.packagingOrder.findUnique({
    where: { id },
    include: {
      lines: {
        include: {
          packagingItem: { select: { id: true, name: true, photoUrl: true, stock: true } },
        },
      },
      factory: { select: { id: true, name: true } },
      owner: { select: { id: true, name: true } },
      payments: true,
    },
  });
  if (!order) return notFound();

  const totalQty = order.lines.reduce((a, l) => a + l.quantity, 0);
  const totalRub = order.lines.reduce((a, l) => a + lineTotalRub(l), 0);

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <div className="font-mono text-xs text-slate-500">{order.orderNumber}</div>
          <h1 className="text-2xl font-semibold text-slate-900">Заказ упаковки</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <span
              className={`rounded px-2 py-0.5 text-xs ${PACKAGING_ORDER_STATUS_COLORS[order.status as PackagingOrderStatus]}`}
            >
              {PACKAGING_ORDER_STATUS_LABELS[order.status as PackagingOrderStatus]}
            </span>
            <span className="text-xs text-slate-500">
              {order.lines.length} поз. · {formatNumber(totalQty)} шт
            </span>
          </div>
        </div>
        <div className="flex gap-2">
          <Link
            href={`/packaging-orders/${id}/edit`}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-50"
          >
            Редактировать
          </Link>
        </div>
      </div>

      {/* Позиции */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Позиции ({order.lines.length})
        </h2>
        <div className="divide-y divide-slate-100">
          {order.lines.map((line) => {
            const isCny = line.priceCurrency === "CNY";
            const total = lineTotalRub(line);
            return (
              <div key={line.id} className="flex items-start gap-3 py-3">
                <PhotoThumb url={line.packagingItem.photoUrl} size={56} />
                <div className="flex-1 min-w-0">
                  <Link
                    href={`/packaging/${line.packagingItem.id}`}
                    className="font-medium text-slate-900 hover:underline"
                  >
                    {line.packagingItem.name}
                  </Link>
                  <div className="mt-0.5 text-xs text-slate-500">
                    {formatNumber(line.quantity)} шт ·{" "}
                    {isCny
                      ? `${line.unitPriceCny ?? "—"} ¥`
                      : line.unitPriceRub
                      ? formatCurrency(line.unitPriceRub.toString())
                      : "—"}{" "}
                    за шт
                    {isCny && line.cnyRubRate && (
                      <span className="ml-1 text-slate-400">· курс {line.cnyRubRate.toString()}</span>
                    )}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-semibold text-slate-900">
                    {total > 0 ? formatCurrency(total) : "—"}
                  </div>
                  <div className="text-[10px] text-slate-400">склад: {formatNumber(line.packagingItem.stock)}</div>
                </div>
              </div>
            );
          })}
        </div>
        {totalRub > 0 && (
          <div className="mt-3 flex items-baseline justify-between border-t border-slate-200 pt-3">
            <span className="text-xs uppercase tracking-wide text-slate-500">Сумма заказа</span>
            <span className="text-lg font-semibold text-slate-900">{formatCurrency(totalRub)}</span>
          </div>
        )}
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <Card title="Параметры">
          <Row label="Поставщик" value={order.factory?.name ?? order.supplierName ?? "—"} />
          <Row
            label="Способ доставки"
            value={order.deliveryMethod ? DELIVERY_METHOD_LABELS[order.deliveryMethod] : "—"}
          />
          <Row label="Ответственный" value={order.owner?.name ?? "—"} />
        </Card>

        <Card title="Сроки">
          <Row label="Заказано" value={formatDate(order.orderedDate)} />
          <Row label="Дедлайн поставки" value={formatDate(order.expectedDate)} />
          <Row label="Поступило" value={formatDate(order.arrivedDate)} />
        </Card>
      </div>

      {order.notes && (
        <Card title="Заметки">
          <p className="text-sm text-slate-700 whitespace-pre-wrap">{order.notes}</p>
        </Card>
      )}

      <PackagingOrderActions id={order.id} status={order.status as PackagingOrderStatus} />
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">{title}</h2>
      <div className="space-y-1 text-sm">{children}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-2 text-sm">
      <span className="text-slate-500">{label}</span>
      <span className="text-right text-slate-900">{value}</span>
    </div>
  );
}
