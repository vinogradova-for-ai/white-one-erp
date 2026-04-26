import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { formatCurrency, formatDate } from "@/lib/format";
import { ORDER_STATUS_LABELS, ORDER_STATUS_COLORS, PACKAGING_TYPE_ICONS, PACKAGING_TYPE_LABELS } from "@/lib/constants";
import { PhotoGallery, PhotoThumb } from "@/components/common/photo-thumb";
import { ColorChip } from "@/components/common/color-chip";
import { VariantStatusChanger } from "@/components/variants/variant-status-changer";

export default async function VariantDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const variant = await prisma.productVariant.findFirst({
    where: { id, deletedAt: null },
    include: {
      productModel: {
        include: {
          sizeGrid: true,
          preferredFactory: true,
          packagingItems: {
            include: {
              packagingItem: {
                select: {
                  id: true, name: true, type: true, photoUrl: true,
                  unitPriceRub: true, unitPriceCny: true, priceCurrency: true, cnyRubRate: true,
                },
              },
            },
            orderBy: { createdAt: "asc" },
          },
        },
      },
      orderLines: {
        where: { order: { deletedAt: null } },
        orderBy: { createdAt: "desc" },
        take: 20,
        include: {
          order: {
            select: { id: true, orderNumber: true, status: true, arrivalPlannedDate: true },
          },
        },
      },
    },
  });

  if (!variant) return notFound();

  const variantOrders = variant.orderLines.map((l) => ({
    id: l.order.id,
    orderNumber: l.order.orderNumber,
    status: l.order.status,
    arrivalPlannedDate: l.order.arrivalPlannedDate,
    quantity: l.quantity,
  }));

  // Себестоимость закупа в одной строке
  const purchaseLine = variant.productModel.purchasePriceCny
    ? `${variant.productModel.purchasePriceCny.toString()} ¥ · курс ${variant.productModel.cnyRubRate?.toString() ?? "—"}`
    : variant.productModel.purchasePriceRub
      ? formatCurrency(variant.productModel.purchasePriceRub.toString())
      : null;

  // Стоимость комплекта упаковки на единицу — одной цифрой
  let packagingPerUnit: number | null = null;
  for (const mp of variant.productModel.packagingItems) {
    const pi = mp.packagingItem;
    const unitRub = pi.priceCurrency === "CNY" && pi.unitPriceCny && pi.cnyRubRate
      ? Number(pi.unitPriceCny) * Number(pi.cnyRubRate)
      : pi.unitPriceRub
        ? Number(pi.unitPriceRub)
        : null;
    if (unitRub != null) {
      packagingPerUnit = (packagingPerUnit ?? 0) + unitRub * Number(mp.quantityPerUnit);
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {/* Шапка */}
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0 flex-1">
          <Link
            href={`/models/${variant.productModel.id}`}
            className="text-xs uppercase tracking-wider text-slate-400 hover:text-slate-600"
          >
            {variant.productModel.name}
          </Link>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-900">
            <ColorChip name={variant.colorName} />
          </h1>
          <div className="mt-1 flex items-center gap-2 font-mono text-xs text-slate-400">
            {variant.sku}
            {variant.fabricColorCode && (
              <>
                <span className="text-slate-300">·</span>
                <span>цв.ткани {variant.fabricColorCode}</span>
              </>
            )}
          </div>
          {variant.status === "DRAFT" && (
            <p className="mt-2 max-w-md text-xs text-amber-700">
              Черновик. Чтобы добавить в заказ — переведите в «Готов к заказу».
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <VariantStatusChanger variantId={variant.id} currentStatus={variant.status} />
          <Link
            href={`/variants/${variant.id}/edit`}
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
          >
            Редактировать
          </Link>
        </div>
      </header>

      <div className="grid gap-5 lg:grid-cols-[1fr_1.4fr]">
        <div className="rounded-2xl bg-white p-3">
          <PhotoGallery urls={variant.photoUrls} alt={variant.colorName} />
        </div>

        <div className="space-y-3">
          {/* Закуп + упаковка одной плиткой */}
          <div className="grid grid-cols-2 gap-3">
            <KpiCard label="Закуп с фабрики" value={purchaseLine ?? "—"} />
            <KpiCard label="Упаковка на штуку" value={packagingPerUnit != null ? formatCurrency(packagingPerUnit) : "—"} />
          </div>

          {/* Комплект упаковки — компактный список без отдельной карточки */}
          {variant.productModel.packagingItems.length > 0 && (
            <div className="rounded-2xl bg-white p-4">
              <div className="mb-3 text-[11px] uppercase tracking-wider text-slate-400">
                Комплект упаковки
              </div>
              <ul className="space-y-2">
                {variant.productModel.packagingItems.map((mp) => (
                  <li key={mp.id} className="flex items-center gap-3">
                    {mp.packagingItem.photoUrl ? (
                      <PhotoThumb url={mp.packagingItem.photoUrl} size={32} />
                    ) : (
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-slate-100 text-xs">
                        {PACKAGING_TYPE_ICONS[mp.packagingItem.type]}
                      </div>
                    )}
                    <div className="min-w-0 flex-1 text-sm">
                      <div className="truncate text-slate-900">{mp.packagingItem.name}</div>
                      <div className="text-[11px] text-slate-400">
                        {PACKAGING_TYPE_LABELS[mp.packagingItem.type]} · {Number(mp.quantityPerUnit)} на единицу
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      {/* Заказы — компактный список */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">Заказы</h2>
          <Link
            href={`/orders/new?variantId=${variant.id}`}
            className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800"
          >
            + Заказ
          </Link>
        </div>
        {variantOrders.length === 0 ? (
          <div className="rounded-2xl bg-white p-8 text-center text-sm text-slate-400">Заказов нет</div>
        ) : (
          <div className="overflow-hidden rounded-2xl bg-white">
            <ul className="divide-y divide-slate-100">
              {variantOrders.map((o) => (
                <li key={`${o.id}-${o.orderNumber}`}>
                  <Link href={`/orders/${o.id}`} className="flex items-center gap-3 px-4 py-3 transition hover:bg-slate-50">
                    <span className="font-mono text-xs text-slate-500">{o.orderNumber}</span>
                    <span className="flex-1 text-sm text-slate-700">{o.quantity} шт</span>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${ORDER_STATUS_COLORS[o.status]}`}>
                      {ORDER_STATUS_LABELS[o.status]}
                    </span>
                    <span className="shrink-0 text-xs text-slate-400">{formatDate(o.arrivalPlannedDate)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </div>
  );
}

function KpiCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-white px-4 py-3">
      <div className="text-[11px] uppercase tracking-wider text-slate-400">{label}</div>
      <div className="mt-0.5 truncate text-sm font-semibold text-slate-900">{value}</div>
    </div>
  );
}
