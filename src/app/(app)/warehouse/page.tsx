import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { ORDER_STATUS_LABELS, PACKAGING_TYPE_ICONS } from "@/lib/constants";
import { ExportButton } from "./export-button";

// Окно «Склад» — выгрузка для внешней системы управления загрузкой склада.
// Считаем заказы, которые ещё ожидаются на складе или уже там (не отгружены в WB).
const PENDING_STATUSES = [
  "PREPARATION",
  "FABRIC_ORDERED",
  "SEWING",
  "QC",
  "IN_TRANSIT",
  "WAREHOUSE_MSK",
  "PACKING",
] as const;

export default async function WarehousePage() {
  const orders = await prisma.order.findMany({
    where: { deletedAt: null, status: { in: [...PENDING_STATUSES] } },
    select: { status: true, arrivalPlannedDate: true },
  });

  // Склад упаковки — та же математика, что на /packaging: остаток, в пути
  // (какими карго едет), в производстве, потребность открытых заказов.
  const packagingItems = await prisma.packagingItem.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
    include: {
      orderUsages: {
        where: { order: { deletedAt: null, status: { notIn: ["ON_SALE", "SHIPPED_WB"] } } },
        select: {
          quantityPerUnit: true,
          consumedQty: true,
          order: { select: { lines: { select: { quantity: true } } } },
        },
      },
      packagingOrderLines: {
        where: { packagingOrder: { status: { notIn: ["ARRIVED", "CANCELLED"] } } },
        select: {
          quantity: true,
          packagingOrder: { select: { status: true, shipment: { select: { number: true } } } },
        },
      },
    },
  });
  const packagingRows = packagingItems.map((i) => {
    const required = i.orderUsages.reduce((sum, u) => {
      const orderQty = u.order.lines.reduce((a, l) => a + l.quantity, 0);
      return sum + Math.max(0, Math.ceil(orderQty * Number(u.quantityPerUnit)) - (u.consumedQty ?? 0));
    }, 0);
    const transitLines = i.packagingOrderLines.filter((l) => l.packagingOrder.status === "IN_TRANSIT");
    const inTransit = transitLines.reduce((a, l) => a + l.quantity, 0);
    const inProduction = i.packagingOrderLines
      .filter((l) => l.packagingOrder.status !== "IN_TRANSIT")
      .reduce((a, l) => a + l.quantity, 0);
    const transitCargo = [...new Set(transitLines.map((l) => l.packagingOrder.shipment?.number).filter(Boolean))] as string[];
    const shortage = Math.max(0, required - (i.stock + inProduction + inTransit));
    return { id: i.id, name: i.name, type: i.type, stock: i.stock, inTransit, transitCargo, inProduction, required, shortage };
  });

  const total = orders.length;
  const byStatus = orders.reduce<Record<string, number>>((acc, o) => {
    acc[o.status] = (acc[o.status] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900 md:text-2xl">Склад</h1>
        <p className="text-sm text-slate-500">
          Выгрузка заказов для внешней системы управления загрузкой склада. 1 строка = 1 заказ.
        </p>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-sm text-slate-500">К выгрузке</div>
            <div className="mt-1 text-3xl font-semibold text-slate-900">{total}</div>
            <div className="mt-1 text-xs text-slate-500">
              заказов в статусах: подготовка → на складе → упаковка
            </div>
          </div>
          <ExportButton />
        </div>

        {total > 0 && (
          <div className="mt-5 grid gap-2 sm:grid-cols-2 md:grid-cols-4">
            {PENDING_STATUSES.map((s) => (
              <div
                key={s}
                className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm"
              >
                <span className="text-slate-600">{ORDER_STATUS_LABELS[s]}</span>
                <span className="font-semibold text-slate-900">{byStatus[s] ?? 0}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {packagingRows.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <div className="font-medium text-slate-900">Склад упаковки</div>
              <div className="text-xs text-slate-500">
                Остатки, что едет и что уже нужно под открытые заказы. Управление — в разделе{" "}
                <Link href="/packaging" className="text-slate-900 underline">Упаковка</Link>.
              </div>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead>
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500">Упаковка</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold uppercase text-slate-500">На складе</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold uppercase text-slate-500">В пути</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold uppercase text-slate-500">В производстве</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold uppercase text-slate-500">Потребность</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold uppercase text-slate-500">Итог</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {packagingRows.map((r) => (
                  <tr key={r.id}>
                    <td className="px-3 py-2">
                      <Link href={`/packaging/${r.id}`} className="font-medium text-slate-900 hover:underline">
                        <span className="mr-1">{PACKAGING_TYPE_ICONS[r.type]}</span>
                        {r.name}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-right font-semibold tabular-nums">{r.stock.toLocaleString("ru-RU")}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {r.inTransit > 0 ? r.inTransit.toLocaleString("ru-RU") : "—"}
                      {r.transitCargo.length > 0 && (
                        <div className="text-[10px] text-slate-400">карго {r.transitCargo.join(", ")}</div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {r.inProduction > 0 ? r.inProduction.toLocaleString("ru-RU") : "—"}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {r.required > 0 ? r.required.toLocaleString("ru-RU") : "—"}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {r.shortage > 0 ? (
                        <span className="rounded bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700 dark:bg-red-400/10 dark:text-red-300">
                          дефицит {r.shortage.toLocaleString("ru-RU")}
                        </span>
                      ) : (
                        <span className="text-xs text-emerald-600 dark:text-emerald-300">✓ Хватает</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-600">
        <div className="font-medium text-slate-900">Что в файле</div>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>№ заказа, артикул (SKU), название фасона, цвета</li>
          <li>Количество (факт ОТК, иначе план)</li>
          <li>Ожидаемая дата прибытия на склад (план и факт)</li>
          <li>Статус, фабрика, способ доставки</li>
          <li>Абсолютная ссылка на 1 фото изделия — можно скачивать по HTTPS</li>
        </ul>
      </div>
    </div>
  );
}
