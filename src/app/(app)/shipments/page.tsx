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
                <th className="px-4 py-3 font-medium">Номер</th>
                <th className="px-4 py-3 font-medium">Статус</th>
                <th className="px-4 py-3 font-medium">Заказов</th>
                <th className="px-4 py-3 font-medium">Штук</th>
                <th className="px-4 py-3 font-medium">Выезд</th>
                <th className="px-4 py-3 font-medium">Прибытие</th>
              </tr>
            </thead>
            <tbody>
              {shipments.map((s) => {
                const orders = new Set(s.batches.map((b) => b.orderId)).size;
                const units = s.batches.reduce(
                  (a, b) => a + b.items.reduce((x, i) => x + i.plannedQty, 0),
                  0,
                );
                return (
                  <ClickableRow
                    key={s.id}
                    href={`/shipments/${s.id}`}
                    className="border-b border-slate-50 last:border-0 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50"
                  >
                    <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-100">{s.number}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-lg px-2 py-0.5 text-xs font-medium ${SHIPMENT_STATUS_COLORS[s.status]}`}>
                        {SHIPMENT_STATUS_LABELS[s.status]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{orders}</td>
                    <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{formatNumber(units)}</td>
                    <td className="px-4 py-3 text-slate-500 dark:text-slate-400">{s.departDate ? formatDate(s.departDate) : "—"}</td>
                    <td className="px-4 py-3 text-slate-500 dark:text-slate-400">{s.arriveDate ? formatDate(s.arriveDate) : "—"}</td>
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
