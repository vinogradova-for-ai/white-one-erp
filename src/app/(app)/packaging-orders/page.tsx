import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatDate, formatNumber, formatCurrency } from "@/lib/format";
import { PACKAGING_ORDER_STATUS_LABELS, PACKAGING_ORDER_STATUS_COLORS } from "@/lib/packaging-orders";
import { PhotoThumb } from "@/components/common/photo-thumb";
import { ClickableRow } from "@/components/common/clickable-row";

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

export default async function PackagingOrdersPage() {
  const orders = await prisma.packagingOrder.findMany({
    orderBy: [{ orderedDate: "desc" }],
    take: 200,
    include: {
      lines: {
        include: {
          packagingItem: { select: { id: true, name: true, photoUrl: true } },
        },
      },
      factory: { select: { id: true, name: true } },
      owner: { select: { name: true } },
    },
  });

  const inProgress = orders.filter((o) => o.status !== "ARRIVED" && o.status !== "CANCELLED").length;

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Заказы упаковки</h1>
          <p className="text-sm text-slate-500">
            Всего: {orders.length} · В работе: {inProgress}
          </p>
        </div>
        <Link
          href="/packaging-orders/new"
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          + Новый заказ
        </Link>
      </div>

      {/* Мобильная версия — карточки */}
      <div className="md:hidden space-y-2">
        {orders.map((o) => {
          const totalQty = o.lines.reduce((a, l) => a + l.quantity, 0);
          const total = o.lines.reduce((a, l) => a + lineTotalRub(l), 0);
          const overdue =
            o.expectedDate &&
            o.expectedDate < new Date() &&
            o.status !== "ARRIVED" &&
            o.status !== "CANCELLED";
          return (
            <Link
              key={o.id}
              href={`/packaging-orders/${o.id}`}
              className="block rounded-xl border border-slate-200 bg-white p-3 active:bg-slate-50"
            >
              <div className="flex items-center gap-3">
                <div className="flex shrink-0 -space-x-2">
                  {o.lines.slice(0, 3).map((l) => (
                    <div key={l.id} className="rounded ring-2 ring-white">
                      <PhotoThumb url={l.packagingItem.photoUrl} size={36} />
                    </div>
                  ))}
                  {o.lines.length > 3 && (
                    <div className="flex h-9 w-9 items-center justify-center rounded bg-slate-200 text-[10px] font-semibold text-slate-600 ring-2 ring-white">
                      +{o.lines.length - 3}
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono text-xs text-slate-700">{o.orderNumber}</span>
                    {overdue && <span className="text-red-600">⚠</span>}
                  </div>
                  <div className="truncate text-xs text-slate-500">{o.factory?.name ?? o.supplierName ?? "—"}</div>
                </div>
                <span className={`shrink-0 rounded px-2 py-0.5 text-[11px] ${PACKAGING_ORDER_STATUS_COLORS[o.status]}`}>
                  {PACKAGING_ORDER_STATUS_LABELS[o.status]}
                </span>
              </div>
              <div className="mt-2 grid grid-cols-3 gap-2 text-[11px]">
                <div>
                  <div className="text-slate-400">Шт</div>
                  <div className="font-medium text-slate-900">{formatNumber(totalQty)}</div>
                </div>
                <div>
                  <div className="text-slate-400">Сумма</div>
                  <div className="font-medium text-slate-900">{total > 0 ? formatCurrency(total) : "—"}</div>
                </div>
                <div>
                  <div className="text-slate-400">Ожидание</div>
                  <div className={`font-medium ${overdue ? "text-red-600" : "text-slate-900"}`}>{formatDate(o.expectedDate)}</div>
                </div>
              </div>
            </Link>
          );
        })}
        {orders.length === 0 && (
          <div className="rounded-xl border border-slate-200 bg-white p-12 text-center text-sm text-slate-500">Заказов на упаковку пока нет</div>
        )}
      </div>

      {/* Десктопная версия — таблица */}
      <div className="hidden overflow-x-auto rounded-2xl border border-slate-200 bg-white md:block">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500">Позиции</th>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500">Номер</th>
              <th className="px-3 py-2 text-right text-xs font-semibold uppercase text-slate-500">Всего шт</th>
              <th className="px-3 py-2 text-right text-xs font-semibold uppercase text-slate-500">Сумма</th>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500">Поставщик</th>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500">Статус</th>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500">Заказано</th>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500">Ожидание</th>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500">Ответственный</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {orders.map((o) => {
              const totalQty = o.lines.reduce((a, l) => a + l.quantity, 0);
              const total = o.lines.reduce((a, l) => a + lineTotalRub(l), 0);
              const overdue =
                o.expectedDate &&
                o.expectedDate < new Date() &&
                o.status !== "ARRIVED" &&
                o.status !== "CANCELLED";
              return (
                <ClickableRow key={o.id} href={`/packaging-orders/${o.id}`} className="hover:bg-slate-50">
                  <td className="px-3 py-2">
                    <div className="flex -space-x-2">
                      {o.lines.slice(0, 3).map((l) => (
                        <div key={l.id} className="rounded ring-2 ring-white">
                          <PhotoThumb url={l.packagingItem.photoUrl} size={32} />
                        </div>
                      ))}
                      {o.lines.length > 3 && (
                        <div className="flex h-8 w-8 items-center justify-center rounded bg-slate-200 text-[10px] font-semibold text-slate-600 ring-2 ring-white">
                          +{o.lines.length - 3}
                        </div>
                      )}
                    </div>
                    <div className="mt-1 text-[10px] text-slate-500">
                      {o.lines.slice(0, 2).map((l) => l.packagingItem.name).join(", ")}
                      {o.lines.length > 2 && ` +${o.lines.length - 2}`}
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <Link href={`/packaging-orders/${o.id}`} className="font-mono text-xs hover:underline">
                      {o.orderNumber}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-right text-xs">{formatNumber(totalQty)}</td>
                  <td className="px-3 py-2 text-right text-xs">{total > 0 ? formatCurrency(total) : "—"}</td>
                  <td className="px-3 py-2 text-xs">{o.factory?.name ?? o.supplierName ?? "—"}</td>
                  <td className="px-3 py-2">
                    <span className={`rounded px-2 py-0.5 text-xs ${PACKAGING_ORDER_STATUS_COLORS[o.status]}`}>
                      {PACKAGING_ORDER_STATUS_LABELS[o.status]}
                    </span>
                    {overdue && <span className="ml-1 text-xs text-red-600">⚠</span>}
                  </td>
                  <td className="px-3 py-2 text-xs">{formatDate(o.orderedDate)}</td>
                  <td className={`px-3 py-2 text-xs ${overdue ? "text-red-600" : ""}`}>
                    {formatDate(o.expectedDate)}
                  </td>
                  <td className="px-3 py-2 text-xs">{o.owner?.name ?? "—"}</td>
                </ClickableRow>
              );
            })}
          </tbody>
        </table>
        {orders.length === 0 && (
          <div className="p-12 text-center text-sm text-slate-500">Заказов на упаковку пока нет</div>
        )}
      </div>
    </div>
  );
}
