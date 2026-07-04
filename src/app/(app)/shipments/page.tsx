import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatDate, formatNumber } from "@/lib/format";
import { SHIPMENT_STATUS_LABELS, SHIPMENT_STATUS_COLORS } from "@/lib/constants";
import { auth } from "@/lib/auth";
import { can } from "@/lib/rbac";
import type { Role } from "@prisma/client";
import { ClickableRow } from "@/components/common/clickable-row";
import { NewShipmentButton } from "@/components/shipments/new-shipment-button";

// Раздел «Поставки» — группы партий, едущих на склад МСК.
// Старое окно логистики (заказы в пути) осталось вкладкой «Заказы в пути» (/incoming).
export default async function ShipmentsPage() {
  const session = await auth();
  const role = (session?.user as { role?: string } | undefined)?.role as Role | undefined;
  const canManage = role ? can(role, "shipment.manage") : false;

  const shipments = await prisma.shipment.findMany({
    where: { deletedAt: null },
    orderBy: [{ createdAt: "desc" }],
    take: 200,
    include: {
      createdBy: { select: { name: true } },
      batches: {
        select: {
          orderId: true,
          items: { select: { plannedQty: true } },
        },
      },
      packagingOrders: { select: { id: true } },
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Поставки</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Партии заказов, едущие на склад: {shipments.length}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {canManage ? <NewShipmentButton /> : null}
          <div className="flex gap-1 rounded-lg bg-slate-100 p-0.5 dark:bg-slate-800">
            <span className="rounded-md bg-white px-3 py-1 text-sm font-medium text-slate-900 shadow-sm dark:bg-slate-700 dark:text-slate-100">
              Поставки
            </span>
            <Link
              href="/incoming"
              className="rounded-md px-3 py-1 text-sm text-slate-600 hover:bg-white dark:text-slate-400 dark:hover:bg-slate-700"
            >
              Заказы в пути
            </Link>
          </div>
        </div>
      </div>

      {shipments.length === 0 ? (
        <div className="rounded-2xl bg-white p-8 text-center text-sm text-slate-500 dark:bg-slate-900 dark:text-slate-400">
          Поставок пока нет. Нажмите «+ Поставка», затем добавьте в неё заказы.
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl bg-white dark:bg-slate-900">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400 dark:border-slate-800">
                <th className="px-4 py-3 font-medium">Номер / карго</th>
                <th className="px-4 py-3 font-medium">Статус</th>
                <th className="px-4 py-3 font-medium">Внутри</th>
                <th className="px-4 py-3 font-medium text-right">Мест · вес</th>
                <th className="px-4 py-3 font-medium text-right">Карго, USDT</th>
                <th className="px-4 py-3 font-medium">Выезд</th>
                <th className="px-4 py-3 font-medium">Прибытие план / факт</th>
              </tr>
            </thead>
            <tbody>
              {shipments.map((s) => {
                const orders = new Set(s.batches.map((b) => b.orderId)).size;
                const units = s.batches.reduce(
                  (a, b) => a + b.items.reduce((x, i) => x + i.plannedQty, 0),
                  0,
                );
                const pkgCount = s.packagingOrders.length;
                return (
                  <ClickableRow
                    key={s.id}
                    href={`/shipments/${s.id}`}
                    className="border-b border-slate-50 last:border-0 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50"
                  >
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900 dark:text-slate-100">{s.number}</div>
                      {s.cargoNumber && <div className="font-mono text-[11px] text-slate-500">{s.cargoNumber}</div>}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded-lg px-2 py-0.5 text-xs font-medium ${SHIPMENT_STATUS_COLORS[s.status]}`}>
                        {SHIPMENT_STATUS_LABELS[s.status]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-700 dark:text-slate-300">
                      {orders > 0 && <span>{orders} зак. · {formatNumber(units)} шт</span>}
                      {orders > 0 && pkgCount > 0 && <span className="text-slate-300"> · </span>}
                      {pkgCount > 0 && <span>📦 {pkgCount}</span>}
                      {orders === 0 && pkgCount === 0 && "—"}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-700 dark:text-slate-300">
                      {s.placesCount != null || s.weightKg != null
                        ? `${s.placesCount ?? "—"} · ${s.weightKg != null ? `${Number(s.weightKg).toLocaleString("ru-RU")} кг` : "—"}`
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {s.amountUsdt != null ? (
                        <>
                          <span className="text-slate-900 dark:text-slate-100">{Number(s.amountUsdt).toLocaleString("ru-RU")}</span>
                          <span className={`ml-1.5 rounded px-1.5 py-0.5 text-[10px] font-medium ${
                            s.cargoPaidAt
                              ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-300"
                              : "bg-amber-50 text-amber-700 dark:bg-amber-400/10 dark:text-amber-300"
                          }`}>
                            {s.cargoPaidAt ? "оплачено" : "не оплачено"}
                          </span>
                        </>
                      ) : "—"}
                    </td>
                    <td className="px-4 py-3 text-slate-500 dark:text-slate-400">{s.departDate ? formatDate(s.departDate) : "—"}</td>
                    <td className="px-4 py-3 text-slate-500 dark:text-slate-400">
                      {s.arriveDate ? formatDate(s.arriveDate) : "—"}
                      {s.arrivalActualDate && (
                        <span className="ml-1 text-emerald-700 dark:text-emerald-300">/ {formatDate(s.arrivalActualDate)}</span>
                      )}
                    </td>
                  </ClickableRow>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
