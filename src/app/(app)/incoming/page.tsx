import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatDate, formatNumber } from "@/lib/format";
import { ORDER_STATUS_LABELS, ORDER_STATUS_COLORS, DELIVERY_METHOD_LABELS } from "@/lib/constants";
import { PhotoThumb } from "@/components/common/photo-thumb";

/**
 * Окно для логистики (Таня).
 * Заказы в пути и к отгрузке. БЕЗ финансов.
 */
export default async function IncomingPage() {
  const orders = await prisma.order.findMany({
    where: {
      deletedAt: null,
      status: { in: ["READY_SHIP", "IN_TRANSIT", "WAREHOUSE_MSK"] },
    },
    include: {
      productVariant: {
        select: {
          sku: true, colorName: true, photoUrls: true,
          productModel: { select: { name: true } },
        },
      },
      factory: { select: { name: true, country: true } },
    },
    orderBy: { arrivalPlannedDate: "asc" },
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Поставки</h1>
        <p className="text-sm text-slate-500">Заказы в пути и к отгрузке: {orders.length}</p>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500">Фото</th>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500">№</th>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500">Изделие</th>
              <th className="px-3 py-2 text-right text-xs font-semibold uppercase text-slate-500">Кол-во</th>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500">Фабрика</th>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500">Способ</th>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500">Статус</th>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500">Прибытие план</th>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500">Прибытие факт</th>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500">ВЭД</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {orders.map((o) => (
              <tr key={o.id} className="hover:bg-slate-50">
                <td className="px-3 py-2"><PhotoThumb url={o.productVariant.photoUrls[0]} size={40} /></td>
                <td className="px-3 py-2"><Link href={`/orders/${o.id}`} className="font-mono text-xs hover:underline">{o.orderNumber}</Link></td>
                <td className="px-3 py-2">
                  <div className="text-slate-900">{o.productVariant.productModel.name}</div>
                  <div className="text-xs text-slate-500">{o.productVariant.colorName}</div>
                </td>
                <td className="px-3 py-2 text-right">{formatNumber(o.quantity)}</td>
                <td className="px-3 py-2 text-xs">
                  {o.factory?.name ?? "—"}
                  {o.factory?.country && <div className="text-slate-400">{o.factory.country}</div>}
                </td>
                <td className="px-3 py-2 text-xs">{o.deliveryMethod ? DELIVERY_METHOD_LABELS[o.deliveryMethod] : "—"}</td>
                <td className="px-3 py-2">
                  <span className={`rounded px-2 py-0.5 text-xs ${ORDER_STATUS_COLORS[o.status]}`}>
                    {ORDER_STATUS_LABELS[o.status]}
                  </span>
                </td>
                <td className="px-3 py-2 text-xs">{formatDate(o.arrivalPlannedDate)}</td>
                <td className="px-3 py-2 text-xs">{formatDate(o.arrivalActualDate)}</td>
                <td className="px-3 py-2 text-xs">
                  <div>Спец: {o.specReady ? "✓" : "—"}</div>
                  <div>Декл: {o.declarationReady ? "✓" : "—"}</div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {orders.length === 0 && <div className="p-12 text-center text-sm text-slate-500">Поставок в движении нет</div>}
      </div>
    </div>
  );
}
