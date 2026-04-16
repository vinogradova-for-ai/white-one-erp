import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/format";
import { PhotoThumb } from "@/components/common/photo-thumb";
import { SAMPLE_STATUS_LABELS, SAMPLE_STATUS_COLORS, ORDER_STATUS_LABELS, ORDER_STATUS_COLORS } from "@/lib/constants";

/**
 * Окно для контент-отдела (Катя).
 * Показывает:
 * - Образцы в статусе READY_FOR_SHOOT (готовы для съёмки)
 * - Заказы с прибытием в ближайшие 14 дней (планировать съёмку заранее)
 */
export default async function ContentSchedulePage() {
  const in14Days = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);

  const [readySamples, incomingOrders] = await Promise.all([
    prisma.sample.findMany({
      where: { status: "READY_FOR_SHOOT" },
      include: {
        productModel: { select: { name: true, category: true } },
        productVariant: { select: { sku: true, colorName: true, photoUrls: true } },
      },
      orderBy: { readyForShootDate: "desc" },
    }),
    prisma.order.findMany({
      where: {
        deletedAt: null,
        status: { in: ["IN_TRANSIT", "WAREHOUSE_MSK", "PACKING"] },
        arrivalPlannedDate: { lte: in14Days },
      },
      include: {
        productVariant: {
          select: {
            sku: true,
            colorName: true,
            photoUrls: true,
            productModel: { select: { name: true } },
          },
        },
      },
      orderBy: { arrivalPlannedDate: "asc" },
    }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Фото-график</h1>
        <p className="text-sm text-slate-500">Что снимать сейчас и что готовить заранее</p>
      </div>

      <section>
        <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold text-slate-900">
          📷 Готовы к съёмке прямо сейчас
          <span className="rounded bg-pink-100 px-2 py-0.5 text-xs text-pink-700">{readySamples.length}</span>
        </h2>
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {readySamples.map((s) => (
            <Link
              key={s.id}
              href={`/samples/${s.id}`}
              className="block rounded-2xl border border-pink-200 bg-pink-50/40 p-4 hover:shadow-md"
            >
              <div className="flex gap-3">
                <PhotoThumb url={s.productVariant?.photoUrls[0]} size={64} />
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-slate-900">{s.productModel.name}</div>
                  <div className="text-xs text-slate-500">
                    {s.productVariant?.colorName ?? "—"} · {s.productModel.category}
                  </div>
                  <div className="mt-1">
                    <span className={`rounded px-2 py-0.5 text-xs ${SAMPLE_STATUS_COLORS[s.status]}`}>
                      {SAMPLE_STATUS_LABELS[s.status]}
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-slate-600">
                    В Москве с {formatDate(s.deliveredDate)}
                  </div>
                  {s.plannedShootDate && (
                    <div className="mt-1 text-xs text-pink-700">Съёмка на {formatDate(s.plannedShootDate)}</div>
                  )}
                </div>
              </div>
            </Link>
          ))}
          {readySamples.length === 0 && (
            <div className="col-span-full rounded-2xl border-2 border-dashed border-slate-200 p-8 text-center text-sm text-slate-500">
              Сейчас нет готовых для съёмки образцов
            </div>
          )}
        </div>
      </section>

      <section>
        <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold text-slate-900">
          📦 Приедет в ближайшие 2 недели (планировать съёмку)
          <span className="rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-700">{incomingOrders.length}</span>
        </h2>
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500">Фото</th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500">Изделие</th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500">Статус</th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500">Прибытие</th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500">Карточка WB</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {incomingOrders.map((o) => (
                <tr key={o.id} className="hover:bg-slate-50">
                  <td className="px-3 py-2"><PhotoThumb url={o.productVariant.photoUrls[0]} size={40} /></td>
                  <td className="px-3 py-2">
                    <div className="text-slate-900">{o.productVariant.productModel.name}</div>
                    <div className="text-xs text-slate-500">{o.productVariant.colorName} · <span className="font-mono">{o.productVariant.sku}</span></div>
                  </td>
                  <td className="px-3 py-2">
                    <span className={`rounded px-2 py-0.5 text-xs ${ORDER_STATUS_COLORS[o.status]}`}>
                      {ORDER_STATUS_LABELS[o.status]}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-xs">{formatDate(o.arrivalPlannedDate)}</td>
                  <td className="px-3 py-2 text-xs">
                    {o.wbCardReady ? <span className="text-emerald-600">✓ готова</span> : <span className="text-amber-600">не готова</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {incomingOrders.length === 0 && (
            <div className="p-8 text-center text-sm text-slate-500">В ближайшие 2 недели поставок нет</div>
          )}
        </div>
      </section>
    </div>
  );
}
