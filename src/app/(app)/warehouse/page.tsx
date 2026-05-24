import { prisma } from "@/lib/prisma";
import { ORDER_STATUS_LABELS } from "@/lib/constants";
import { ExportButton } from "./export-button";

// Окно «Склад» — выгрузка для внешней системы управления загрузкой склада.
// Считаем заказы, которые ещё ожидаются на складе или уже там (не отгружены в WB).
const PENDING_STATUSES = [
  "PREPARATION",
  "FABRIC_ORDERED",
  "SEWING",
  "QC",
  "READY_SHIP",
  "IN_TRANSIT",
  "WAREHOUSE_MSK",
  "PACKING",
] as const;

export default async function WarehousePage() {
  const orders = await prisma.order.findMany({
    where: { deletedAt: null, status: { in: [...PENDING_STATUSES] } },
    select: { status: true, arrivalPlannedDate: true },
  });

  const total = orders.length;
  const byStatus = orders.reduce<Record<string, number>>((acc, o) => {
    acc[o.status] = (acc[o.status] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Склад</h1>
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
