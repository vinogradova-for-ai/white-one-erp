import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatDate, formatNumber } from "@/lib/format";
import { ORDER_STATUS_LABELS, ORDER_STATUS_COLORS, DELIVERY_METHOD_LABELS } from "@/lib/constants";
import { VariantVisual } from "@/components/common/variant-visual";
import { ClickableRow } from "@/components/common/clickable-row";
import { ColorChip } from "@/components/common/color-chip";

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
      productModel: { select: { name: true, photoUrls: true } },
      lines: {
        select: {
          quantity: true,
          productVariant: { select: { sku: true, colorName: true, photoUrls: true } },
        },
        orderBy: { createdAt: "asc" },
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

      {/* Мобильная версия */}
      <div className="space-y-2 md:hidden">
        {orders.map((o) => {
          const totalQty = o.lines.reduce((a, l) => a + l.quantity, 0);
          const colorNames = o.lines.map((l) => l.productVariant.colorName);
          const firstLine = o.lines[0];
          return (
            <Link
              key={o.id}
              href={`/orders/${o.id}`}
              className="block rounded-xl border border-slate-200 bg-white p-3 active:bg-slate-50"
            >
              <div className="flex items-center gap-3">
                <VariantVisual
                  variantPhotoUrl={firstLine?.productVariant.photoUrls[0] ?? null}
                  modelPhotoUrl={o.productModel.photoUrls[0] ?? null}
                  colorName={firstLine?.productVariant.colorName ?? null}
                  size={44}
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium text-slate-900">{o.productModel.name}</div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500">
                    <span className="font-mono text-[11px]">{o.orderNumber}</span>
                    {colorNames.slice(0, 4).map((c, i) => <ColorChip key={i} name={c} size={10} />)}
                  </div>
                </div>
                <span className={`shrink-0 rounded px-2 py-0.5 text-[11px] ${ORDER_STATUS_COLORS[o.status]}`}>
                  {ORDER_STATUS_LABELS[o.status]}
                </span>
              </div>
              <div className="mt-2 grid grid-cols-3 gap-2 text-[11px]">
                <div>
                  <div className="text-slate-400">Кол-во</div>
                  <div className="font-semibold text-slate-900">{formatNumber(totalQty)}</div>
                </div>
                <div>
                  <div className="text-slate-400">План</div>
                  <div className="font-medium text-slate-900">{formatDate(o.arrivalPlannedDate)}</div>
                </div>
                <div>
                  <div className="text-slate-400">Факт</div>
                  <div className="font-medium text-slate-900">{formatDate(o.arrivalActualDate)}</div>
                </div>
              </div>
            </Link>
          );
        })}
        {orders.length === 0 && (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white p-12 text-center text-sm text-slate-500">
            Пока ничего не едет. Будет что-то на отгрузке — появится здесь.
          </div>
        )}
      </div>

      {/* Десктопная версия — таблица */}
      <div className="hidden overflow-x-auto rounded-2xl border border-slate-200 bg-white md:block">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="sticky top-0 z-10 bg-slate-50 shadow-[inset_0_-1px_0_rgb(226_232_240)]">
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
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {orders.map((o) => {
              const totalQty = o.lines.reduce((a, l) => a + l.quantity, 0);
              const colorNames = o.lines.map((l) => l.productVariant.colorName);
              const firstLine = o.lines[0];
              return (
              <ClickableRow key={o.id} href={`/orders/${o.id}`} className="hover:bg-slate-50">
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
                <td className="px-3 py-2 text-right">{formatNumber(totalQty)}</td>
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
              </ClickableRow>
              );
            })}
          </tbody>
        </table>
        {orders.length === 0 && <div className="p-12 text-center text-sm text-slate-500">Поставок в движении нет</div>}
      </div>
    </div>
  );
}
