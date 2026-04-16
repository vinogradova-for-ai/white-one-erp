import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/format";
import { ORDER_STATUS_LABELS, ORDER_STATUS_COLORS } from "@/lib/constants";

/**
 * Окно для ВЭД (Элина).
 * Заказы, где не готовы документы.
 */
export default async function CustomsPage() {
  const orders = await prisma.order.findMany({
    where: {
      deletedAt: null,
      OR: [{ specReady: false }, { declarationReady: false }],
      status: { in: ["READY_SHIP", "IN_TRANSIT", "SEWING", "QC"] },
    },
    include: {
      productVariant: {
        select: {
          sku: true, colorName: true,
          productModel: { select: { name: true } },
        },
      },
      factory: { select: { name: true, country: true } },
    },
    orderBy: { shipmentDate: "asc" },
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Документы ВЭД</h1>
        <p className="text-sm text-slate-500">Заказы без готовых документов: {orders.length}</p>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500">№</th>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500">Изделие</th>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500">Фабрика</th>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500">Статус</th>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500">Отгрузка</th>
              <th className="px-3 py-2 text-center text-xs font-semibold uppercase text-slate-500">Спецификация</th>
              <th className="px-3 py-2 text-center text-xs font-semibold uppercase text-slate-500">Декларация</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {orders.map((o) => (
              <tr key={o.id} className="hover:bg-slate-50">
                <td className="px-3 py-2"><Link href={`/orders/${o.id}`} className="font-mono text-xs hover:underline">{o.orderNumber}</Link></td>
                <td className="px-3 py-2">
                  <div className="text-slate-900">{o.productVariant.productModel.name}</div>
                  <div className="text-xs text-slate-500">{o.productVariant.colorName}</div>
                </td>
                <td className="px-3 py-2 text-xs">
                  {o.factory?.name ?? "—"}
                  {o.factory?.country && <div className="text-slate-400">{o.factory.country}</div>}
                </td>
                <td className="px-3 py-2">
                  <span className={`rounded px-2 py-0.5 text-xs ${ORDER_STATUS_COLORS[o.status]}`}>
                    {ORDER_STATUS_LABELS[o.status]}
                  </span>
                </td>
                <td className="px-3 py-2 text-xs">{formatDate(o.shipmentDate)}</td>
                <td className="px-3 py-2 text-center">
                  {o.specReady
                    ? <span className="text-emerald-600">✓</span>
                    : <span className="rounded bg-red-100 px-2 py-0.5 text-xs text-red-700">не готова</span>}
                </td>
                <td className="px-3 py-2 text-center">
                  {o.declarationReady
                    ? <span className="text-emerald-600">✓</span>
                    : <span className="rounded bg-red-100 px-2 py-0.5 text-xs text-red-700">не готова</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {orders.length === 0 && (
          <div className="p-12 text-center text-sm text-slate-500">
            Все документы в порядке ✓
          </div>
        )}
      </div>
    </div>
  );
}
