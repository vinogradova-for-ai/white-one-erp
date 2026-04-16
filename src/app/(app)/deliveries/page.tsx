import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { formatDate } from "@/lib/format";
import { ORDER_STATUS_LABELS, ORDER_STATUS_COLORS, DELIVERY_METHOD_LABELS } from "@/lib/constants";

export default async function DeliveriesPage() {
  const orders = await prisma.order.findMany({
    where: {
      deletedAt: null,
      status: { in: ["READY_SHIP", "IN_TRANSIT", "WAREHOUSE_MSK"] },
    },
    include: { product: { select: { sku: true, name: true } } },
    orderBy: { arrivalPlannedDate: "asc" },
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Календарь поставок</h1>
        <p className="text-sm text-slate-500">Заказы в пути или к отгрузке: {orders.length}</p>
      </div>
      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50">
            <tr>
              <Th>№</Th>
              <Th>Изделие</Th>
              <Th className="text-right">Кол-во</Th>
              <Th>Способ</Th>
              <Th>Статус</Th>
              <Th>Прибытие (план)</Th>
              <Th>Прибытие (факт)</Th>
              <Th>Спец.</Th>
              <Th>Деклар.</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {orders.map((o) => (
              <tr key={o.id} className="hover:bg-slate-50">
                <td className="px-3 py-2"><Link href={`/orders/${o.id}`} className="font-mono text-xs hover:underline">{o.orderNumber}</Link></td>
                <td className="px-3 py-2">{o.product.name}<div className="font-mono text-xs text-slate-500">{o.product.sku}</div></td>
                <td className="px-3 py-2 text-right">{o.quantity}</td>
                <td className="px-3 py-2 text-xs">{o.deliveryMethod ? DELIVERY_METHOD_LABELS[o.deliveryMethod] : "—"}</td>
                <td className="px-3 py-2"><span className={`inline-block rounded px-2 py-0.5 text-xs ${ORDER_STATUS_COLORS[o.status]}`}>{ORDER_STATUS_LABELS[o.status]}</span></td>
                <td className="px-3 py-2 text-xs">{formatDate(o.arrivalPlannedDate)}</td>
                <td className="px-3 py-2 text-xs">{formatDate(o.arrivalActualDate)}</td>
                <td className="px-3 py-2 text-xs">{o.specReady ? "✓" : "—"}</td>
                <td className="px-3 py-2 text-xs">{o.declarationReady ? "✓" : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {orders.length === 0 && <div className="p-12 text-center text-sm text-slate-500">Поставок в движении нет</div>}
      </div>
    </div>
  );
}

function Th({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <th className={`px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 ${className}`}>{children}</th>;
}
