import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatDate, formatNumber } from "@/lib/format";
import { ORDER_STATUS_LABELS, ORDER_STATUS_COLORS, QC_DEFECT_LABELS } from "@/lib/constants";
import { PhotoThumb } from "@/components/common/photo-thumb";

/**
 * Окно для склада — приёмка и QC.
 * Заказы на складе Москва + только приехавшие (IN_TRANSIT с фактом).
 */
export default async function WarehouseReceiptPage() {
  const orders = await prisma.order.findMany({
    where: {
      deletedAt: null,
      status: { in: ["QC", "WAREHOUSE_MSK", "PACKING"] },
    },
    include: {
      productVariant: {
        select: {
          sku: true, colorName: true, photoUrls: true,
          productModel: { select: { name: true } },
        },
      },
    },
    orderBy: { arrivalActualDate: "asc" },
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Приёмка склада</h1>
        <p className="text-sm text-slate-500">К приёмке и упаковке: {orders.length}</p>
      </div>

      <div className="space-y-3">
        {orders.map((o) => {
          const sizeDist = o.sizeDistribution as Record<string, number> | null;
          const actualDist = o.sizeDistributionActual as Record<string, number> | null;
          const hasQcData = o.qcQuantityOk !== null || o.qcQuantityDefects !== null;
          const needsReceiving = !o.arrivalActualDate;

          return (
            <Link
              key={o.id}
              href={`/orders/${o.id}`}
              className="block rounded-2xl border border-slate-200 bg-white p-5 hover:shadow-md"
            >
              <div className="flex gap-4">
                <PhotoThumb url={o.productVariant.photoUrls[0]} size={72} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-mono text-xs text-slate-500">{o.orderNumber}</div>
                      <div className="font-medium text-slate-900">{o.productVariant.productModel.name}</div>
                      <div className="text-xs text-slate-500">{o.productVariant.colorName}</div>
                    </div>
                    <div className="text-right">
                      <span className={`rounded px-2 py-0.5 text-xs ${ORDER_STATUS_COLORS[o.status]}`}>
                        {ORDER_STATUS_LABELS[o.status]}
                      </span>
                      <div className="mt-1 text-xs text-slate-500">
                        Прибытие план: {formatDate(o.arrivalPlannedDate)}
                      </div>
                      {o.arrivalActualDate && (
                        <div className="text-xs text-emerald-600">Факт: {formatDate(o.arrivalActualDate)}</div>
                      )}
                    </div>
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-3 text-sm md:grid-cols-3">
                    <div>
                      <div className="text-xs text-slate-500">Количество</div>
                      <div className="text-slate-900">{formatNumber(o.quantity)} шт</div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-500">Упаковка</div>
                      <div className={o.packagingOrdered ? "text-emerald-600" : "text-red-600"}>
                        {o.packagingOrdered ? "заказана ✓" : "не заказана ⚠"}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-500">ОТК</div>
                      <div>
                        {hasQcData ? (
                          <>
                            <span className="text-emerald-600">{formatNumber(o.qcQuantityOk ?? 0)} ОК</span>
                            {(o.qcQuantityDefects ?? 0) > 0 && (
                              <span className="ml-2 text-red-600">{o.qcQuantityDefects} брак</span>
                            )}
                          </>
                        ) : (
                          <span className="text-slate-400">ещё не пройден</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {o.qcDefectCategory && (
                    <div className="mt-2 text-xs text-slate-600">
                      Категория брака: {QC_DEFECT_LABELS[o.qcDefectCategory]}
                      {o.qcReplacedByFactory && " · Заменено фабрикой"}
                    </div>
                  )}

                  {sizeDist && (
                    <div className="mt-3 flex flex-wrap gap-1">
                      <span className="text-xs text-slate-500 mr-1">План:</span>
                      {Object.entries(sizeDist).map(([size, qty]) => (
                        <span key={size} className="rounded bg-slate-100 px-2 py-0.5 text-xs">
                          {size}: {qty}
                        </span>
                      ))}
                    </div>
                  )}
                  {actualDist && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      <span className="text-xs text-slate-500 mr-1">Факт:</span>
                      {Object.entries(actualDist).map(([size, qty]) => (
                        <span key={size} className="rounded bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700">
                          {size}: {qty}
                        </span>
                      ))}
                    </div>
                  )}

                  {needsReceiving && (
                    <div className="mt-3 rounded-lg bg-amber-50 px-3 py-1.5 text-xs text-amber-700">
                      Требуется отметить прибытие и пройти ОТК
                    </div>
                  )}
                </div>
              </div>
            </Link>
          );
        })}
        {orders.length === 0 && (
          <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center text-sm text-slate-500">
            Очередь пуста
          </div>
        )}
      </div>
    </div>
  );
}
