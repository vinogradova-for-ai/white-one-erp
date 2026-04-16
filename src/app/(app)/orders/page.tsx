import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatCurrency, formatDate, formatNumber, yearMonthToLabel } from "@/lib/format";
import { ORDER_STATUS_LABELS, ORDER_STATUS_COLORS, ORDER_TYPE_LABELS, BRAND_LABELS } from "@/lib/constants";
import { OrderStatus } from "@prisma/client";

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; delayed?: string }>;
}) {
  const sp = await searchParams;
  const where: {
    deletedAt: null;
    status?: OrderStatus;
    isDelayed?: boolean;
  } = { deletedAt: null };
  if (sp.status && sp.status in ORDER_STATUS_LABELS) where.status = sp.status as OrderStatus;
  if (sp.delayed === "true") where.isDelayed = true;

  const orders = await prisma.order.findMany({
    where,
    orderBy: { updatedAt: "desc" },
    take: 200,
    include: {
      product: { select: { sku: true, name: true, brand: true, category: true } },
      factory: { select: { name: true } },
      owner: { select: { name: true } },
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Заказы на производство</h1>
          <p className="text-sm text-slate-500">Всего: {orders.length}</p>
        </div>
        <Link
          href="/orders/new"
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          + Создать заказ
        </Link>
      </div>

      <form method="get" className="flex flex-wrap gap-2">
        <select name="status" defaultValue={sp.status ?? ""} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
          <option value="">Все статусы</option>
          {Object.entries(ORDER_STATUS_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <label className="flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
          <input type="checkbox" name="delayed" value="true" defaultChecked={sp.delayed === "true"} />
          С задержкой
        </label>
        <button type="submit" className="rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200">
          Применить
        </button>
      </form>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50">
            <tr>
              <Th>№</Th>
              <Th>Изделие</Th>
              <Th>Бренд</Th>
              <Th>Тип</Th>
              <Th>Месяц</Th>
              <Th className="text-right">Кол-во</Th>
              <Th className="text-right">Себест.</Th>
              <Th className="text-right">Выручка</Th>
              <Th>Статус</Th>
              <Th>Фабрика</Th>
              <Th>Прибытие</Th>
              <Th>Ответ.</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {orders.map((o) => (
              <tr key={o.id} className={`hover:bg-slate-50 ${o.isDelayed ? "bg-red-50/40" : ""}`}>
                <td className="px-3 py-2 whitespace-nowrap">
                  <Link href={`/orders/${o.id}`} className="font-mono text-xs text-slate-700 hover:underline">
                    {o.orderNumber}
                  </Link>
                </td>
                <td className="px-3 py-2">
                  <div className="text-slate-900">{o.product.name}</div>
                  <div className="font-mono text-xs text-slate-500">{o.product.sku}</div>
                </td>
                <td className="px-3 py-2 text-xs text-slate-600">{BRAND_LABELS[o.product.brand]}</td>
                <td className="px-3 py-2 text-xs text-slate-600">{ORDER_TYPE_LABELS[o.orderType]}</td>
                <td className="px-3 py-2 text-xs text-slate-600 capitalize">{yearMonthToLabel(o.launchMonth)}</td>
                <td className="px-3 py-2 text-right text-xs text-slate-700">{formatNumber(o.quantity)}</td>
                <td className="px-3 py-2 text-right text-xs text-slate-700">{formatCurrency(o.batchCost?.toString())}</td>
                <td className="px-3 py-2 text-right text-xs text-slate-700">{formatCurrency(o.plannedRevenue?.toString())}</td>
                <td className="px-3 py-2">
                  <span className={`inline-block rounded px-2 py-0.5 text-xs ${ORDER_STATUS_COLORS[o.status]}`}>
                    {ORDER_STATUS_LABELS[o.status]}
                  </span>
                  {o.isDelayed && <span className="ml-1 text-xs text-red-600">⚠</span>}
                  {o.hasIssue && <span className="ml-1 text-xs text-red-600">🔴</span>}
                </td>
                <td className="px-3 py-2 text-xs text-slate-600">{o.factory?.name ?? "—"}</td>
                <td className="px-3 py-2 text-xs text-slate-600">{formatDate(o.arrivalPlannedDate)}</td>
                <td className="px-3 py-2 text-xs text-slate-600">{o.owner.name}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {orders.length === 0 && (
          <div className="p-12 text-center text-sm text-slate-500">Заказов не найдено</div>
        )}
      </div>
    </div>
  );
}

function Th({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <th className={`px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 ${className}`}>
      {children}
    </th>
  );
}
