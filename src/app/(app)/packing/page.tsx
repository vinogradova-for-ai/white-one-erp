import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { formatDate } from "@/lib/format";
import { ORDER_STATUS_LABELS, ORDER_STATUS_COLORS } from "@/lib/constants";

export default async function PackingPage() {
  const orders = await prisma.order.findMany({
    where: {
      deletedAt: null,
      status: { in: ["WAREHOUSE_MSK", "PACKING"] },
    },
    include: { product: { select: { sku: true, name: true } } },
    orderBy: { arrivalActualDate: "asc" },
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Упаковка</h1>
        <p className="text-sm text-slate-500">Очередь: {orders.length}</p>
      </div>
      <div className="space-y-2">
        {orders.map((o) => (
          <Link
            key={o.id}
            href={`/orders/${o.id}`}
            className="block rounded-2xl border border-slate-200 bg-white p-4 hover:shadow-sm"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <div className="font-mono text-xs text-slate-500">{o.orderNumber}</div>
                <div className="font-medium text-slate-900">{o.product.name}</div>
                <div className="text-xs text-slate-500">{o.product.sku} · {o.quantity} шт</div>
              </div>
              <div className="text-right">
                <span className={`inline-block rounded px-2 py-0.5 text-xs ${ORDER_STATUS_COLORS[o.status]}`}>
                  {ORDER_STATUS_LABELS[o.status]}
                </span>
                <div className="mt-1 text-xs text-slate-500">
                  На складе с {formatDate(o.arrivalActualDate)}
                </div>
                <div className="text-xs">
                  Упаковка: <span className={o.packagingOrdered ? "text-green-600" : "text-red-600 font-medium"}>
                    {o.packagingOrdered ? "заказана ✓" : "не заказана ⚠"}
                  </span>
                </div>
                {o.packagingType && <div className="text-xs text-slate-500">{o.packagingType}</div>}
              </div>
            </div>
          </Link>
        ))}
        {orders.length === 0 && (
          <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center text-sm text-slate-500">
            Очередь упаковки пуста
          </div>
        )}
      </div>
    </div>
  );
}
