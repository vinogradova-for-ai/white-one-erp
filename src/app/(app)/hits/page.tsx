import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { formatCurrency, formatNumber, formatPercent } from "@/lib/format";
import { BRAND_LABELS } from "@/lib/constants";

export default async function HitsPage() {
  const products = await prisma.product.findMany({
    where: { deletedAt: null },
    include: {
      orders: {
        where: { deletedAt: null },
        select: { quantity: true, plannedRevenue: true, plannedMargin: true, status: true },
      },
    },
  });

  const rows = products
    .map((p) => {
      const totalQty = p.orders.reduce((s, o) => s + o.quantity, 0);
      const totalRevenue = p.orders.reduce((s, o) => s + Number(o.plannedRevenue ?? 0), 0);
      const totalMargin = p.orders.reduce((s, o) => s + Number(o.plannedMargin ?? 0), 0);
      return {
        id: p.id,
        sku: p.sku,
        name: p.name,
        brand: p.brand,
        category: p.category,
        ordersCount: p.orders.length,
        totalQty,
        totalRevenue,
        totalMargin,
        roi: Number(p.roi ?? 0),
        factRedemption: p.factRedemptionPct ? Number(p.factRedemptionPct) : null,
        plannedRedemption: p.plannedRedemptionPct ? Number(p.plannedRedemptionPct) : null,
      };
    })
    .filter((r) => r.ordersCount > 0)
    .sort((a, b) => b.totalMargin - a.totalMargin);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Хиты для масштабирования</h1>
        <p className="text-sm text-slate-500">Сортировка по суммарной марже всех заказов</p>
      </div>
      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500">#</th>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500">Изделие</th>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500">Бренд</th>
              <th className="px-3 py-2 text-right text-xs font-semibold uppercase text-slate-500">Заказов</th>
              <th className="px-3 py-2 text-right text-xs font-semibold uppercase text-slate-500">Тираж</th>
              <th className="px-3 py-2 text-right text-xs font-semibold uppercase text-slate-500">Выручка</th>
              <th className="px-3 py-2 text-right text-xs font-semibold uppercase text-slate-500">Маржа</th>
              <th className="px-3 py-2 text-right text-xs font-semibold uppercase text-slate-500">ROI</th>
              <th className="px-3 py-2 text-right text-xs font-semibold uppercase text-slate-500">% выкупа</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r, i) => (
              <tr key={r.id} className="hover:bg-slate-50">
                <td className="px-3 py-2 text-slate-500">{i + 1}</td>
                <td className="px-3 py-2">
                  <Link href={`/products/${r.id}`} className="text-slate-900 hover:underline">{r.name}</Link>
                  <div className="font-mono text-xs text-slate-500">{r.sku}</div>
                </td>
                <td className="px-3 py-2 text-xs">{BRAND_LABELS[r.brand]}</td>
                <td className="px-3 py-2 text-right text-xs">{r.ordersCount}</td>
                <td className="px-3 py-2 text-right">{formatNumber(r.totalQty)}</td>
                <td className="px-3 py-2 text-right">{formatCurrency(r.totalRevenue)}</td>
                <td className="px-3 py-2 text-right font-medium text-emerald-700">{formatCurrency(r.totalMargin)}</td>
                <td className="px-3 py-2 text-right">{formatPercent(r.roi)}</td>
                <td className="px-3 py-2 text-right">
                  {r.factRedemption !== null ? formatPercent(r.factRedemption) : (
                    <span className="text-slate-400">{r.plannedRedemption !== null ? `план ${formatPercent(r.plannedRedemption)}` : "—"}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
