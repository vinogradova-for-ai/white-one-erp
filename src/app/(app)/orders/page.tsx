import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatDate, formatNumber } from "@/lib/format";
import { ORDER_STATUS_LABELS, ORDER_STATUS_COLORS, ORDER_TYPE_LABELS } from "@/lib/constants";
import { VariantVisual } from "@/components/common/variant-visual";
import { ColorChip } from "@/components/common/color-chip";
import { ClickableRow } from "@/components/common/clickable-row";
import { OrderStatus } from "@prisma/client";

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const sp = await searchParams;
  const where: {
    deletedAt: null;
    status?: OrderStatus;
  } = { deletedAt: null };
  if (sp.status && sp.status in ORDER_STATUS_LABELS) where.status = sp.status as OrderStatus;

  const orders = await prisma.order.findMany({
    where,
    orderBy: { updatedAt: "desc" },
    take: 200,
    include: {
      productModel: { select: { name: true, photoUrls: true } },
      lines: {
        include: {
          productVariant: { select: { colorName: true, photoUrls: true } },
        },
        orderBy: { createdAt: "asc" },
      },
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
          className="rounded-lg bg-slate-900 px-4 py-3 text-sm font-medium text-white hover:bg-slate-800 md:py-2"
        >
          + Создать заказ
        </Link>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs uppercase tracking-wide text-slate-400 mr-1">Статус:</span>
        <Link
          href="/orders"
          className={`rounded-full px-3 py-1 text-xs font-medium ${!sp.status ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
        >
          Все
        </Link>
        {Object.entries(ORDER_STATUS_LABELS).map(([k, v]) => (
          <Link
            key={k}
            href={`/orders?status=${k}`}
            className={`rounded-full px-3 py-1 text-xs font-medium ${sp.status === k ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
          >
            {v}
          </Link>
        ))}
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500">Фото</th>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500">№</th>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500">Изделие</th>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500">Тип</th>
              <th className="px-3 py-2 text-right text-xs font-semibold uppercase text-slate-500">Кол-во</th>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500">Статус</th>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500">Фабрика</th>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500">Прибытие</th>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500">Старт продаж</th>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500">Ответ.</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {orders.map((o) => {
              const totalQty = o.lines.reduce((a, l) => a + l.quantity, 0);
              const colorNames = o.lines.map((l) => l.productVariant.colorName);
              const firstLine = o.lines[0];
              return (
                <ClickableRow key={o.id} href={`/orders/${o.id}`} className={`hover:bg-slate-50 ${o.isDelayed ? "bg-red-50/40" : ""}`}>
                  <td className="px-3 py-2">
                    <VariantVisual
                      variantPhotoUrl={firstLine?.productVariant.photoUrls[0] ?? null}
                      modelPhotoUrl={o.productModel.photoUrls[0] ?? null}
                      colorName={firstLine?.productVariant.colorName ?? null}
                      size={40}
                    />
                  </td>
                  <td className="px-3 py-2"><Link href={`/orders/${o.id}`} className="font-mono text-xs hover:underline">{o.orderNumber}</Link></td>
                  <td className="px-3 py-2">
                    <div className="text-slate-900">{o.productModel.name}</div>
                    <div className="mt-0.5 flex flex-wrap gap-x-2 gap-y-0.5 text-xs text-slate-500">
                      {colorNames.length > 0 ? colorNames.map((c, i) => <ColorChip key={i} name={c} size={10} />) : "—"}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-xs text-slate-600">{ORDER_TYPE_LABELS[o.orderType]}</td>
                  <td className="px-3 py-2 text-right text-xs">{formatNumber(totalQty)}</td>
                  <td className="px-3 py-2">
                    <span className={`inline-block rounded px-2 py-0.5 text-xs ${ORDER_STATUS_COLORS[o.status]}`}>
                      {ORDER_STATUS_LABELS[o.status]}
                    </span>
                    {o.isDelayed && <span className="ml-1 text-xs text-red-600">⚠</span>}
                    {o.hasIssue && <span className="ml-1 text-xs text-red-600">🔴</span>}
                  </td>
                  <td className="px-3 py-2 text-xs text-slate-600">{o.factory?.name ?? "—"}</td>
                  <td className="px-3 py-2 text-xs text-slate-600">{formatDate(o.arrivalPlannedDate)}</td>
                  <td className="px-3 py-2 text-xs text-slate-600 capitalize">
                    {salesStartMonth(o.arrivalPlannedDate)}
                  </td>
                  <td className="px-3 py-2 text-xs text-slate-600">{o.owner.name}</td>
                </ClickableRow>
              );
            })}
          </tbody>
        </table>
        {orders.length === 0 && <div className="p-12 text-center text-sm text-slate-500">Заказов не найдено</div>}
      </div>
    </div>
  );
}

const MONTH_NAMES_RU = [
  "январь", "февраль", "март", "апрель", "май", "июнь",
  "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь",
];

// Старт продаж: если доставка прибывает 20-го числа или раньше — продажи в том же
// месяце; иначе переносим на следующий. Если даты прибытия нет — прочерк.
function salesStartMonth(arrival: Date | null | undefined): string {
  if (!arrival) return "—";
  const d = new Date(arrival);
  const day = d.getDate();
  let month = d.getMonth();
  let year = d.getFullYear();
  if (day > 20) {
    month += 1;
    if (month > 11) { month = 0; year += 1; }
  }
  return `${MONTH_NAMES_RU[month]} ${year}`;
}
