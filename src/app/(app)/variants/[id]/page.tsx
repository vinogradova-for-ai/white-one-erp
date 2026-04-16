import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { formatCurrency, formatDate, formatPercent } from "@/lib/format";
import { ORDER_STATUS_LABELS, ORDER_STATUS_COLORS, PRODUCT_VARIANT_STATUS_LABELS, PRODUCT_VARIANT_STATUS_COLORS } from "@/lib/constants";
import { PhotoGallery } from "@/components/common/photo-thumb";

export default async function VariantDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const variant = await prisma.productVariant.findFirst({
    where: { id, deletedAt: null },
    include: {
      productModel: { include: { sizeGrid: true, preferredFactory: true } },
      orders: { where: { deletedAt: null }, orderBy: { createdAt: "desc" }, take: 20 },
    },
  });

  if (!variant) return notFound();

  const proportion = variant.defaultSizeProportion as Record<string, number> | null;

  return (
    <div className="space-y-6">
      <div>
        <div className="font-mono text-xs text-slate-500">{variant.sku}</div>
        <h1 className="text-2xl font-semibold text-slate-900">
          <Link href={`/models/${variant.productModel.id}`} className="hover:underline">
            {variant.productModel.name}
          </Link>
          {" · "}
          <span className="text-slate-700">{variant.colorName}</span>
        </h1>
        <div className="mt-1">
          <span className={`inline-block rounded px-2 py-0.5 text-xs ${PRODUCT_VARIANT_STATUS_COLORS[variant.status]}`}>
            {PRODUCT_VARIANT_STATUS_LABELS[variant.status]}
          </span>
          {variant.pantoneCode && (
            <span className="ml-2 text-xs text-slate-500">Pantone: {variant.pantoneCode}</span>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-1">
          <PhotoGallery urls={variant.photoUrls} alt={variant.colorName} />
        </div>

        <div className="space-y-6 lg:col-span-2">
          <Card title="Экономика">
            <Row label="Закупка" value={
              variant.purchasePriceCny
                ? `${variant.purchasePriceCny.toString()} ¥ (курс ${variant.cnyRubRate?.toString() ?? "?"})`
                : variant.purchasePriceRub
                  ? formatCurrency(variant.purchasePriceRub.toString())
                  : "—"
            } />
            <Row label="Упаковка" value={formatCurrency(variant.packagingCost.toString())} />
            <Row label="Логистика WB" value={formatCurrency(variant.wbLogisticsCost.toString())} />
            <Row label="Себестоимость полная" value={<strong>{formatCurrency(variant.fullCost?.toString())}</strong>} />
            <Row label="Цена WB (до СПП)" value={formatCurrency(variant.wbPrice?.toString())} />
            <Row label="Цена клиенту" value={formatCurrency(variant.customerPrice?.toString())} />
            <Row label="Комиссия WB" value={formatPercent(variant.wbCommissionPct.toString())} />
            <Row label="% выкупа (план)" value={formatPercent(variant.plannedRedemptionPct?.toString())} />
            <Row label="Маржа до ДРР" value={formatCurrency(variant.marginBeforeDrr?.toString())} />
            <Row label="Маржа после ДРР" value={formatPercent(variant.marginAfterDrrPct?.toString())} />
            <Row label="ROI" value={formatPercent(variant.roi?.toString())} />
            <Row label="Наценка" value={formatPercent(variant.markupPct?.toString())} />
          </Card>

          {proportion && (
            <Card title={`Размерная пропорция (${variant.productModel.sizeGrid?.name ?? "—"})`}>
              <div className="grid grid-cols-6 gap-2">
                {Object.entries(proportion).map(([size, pct]) => (
                  <div key={size} className="rounded-lg bg-slate-50 p-2 text-center">
                    <div className="text-sm font-medium text-slate-900">{size}</div>
                    <div className="text-xs text-slate-500">{pct}%</div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          <Card title="Габариты и литраж">
            <Row label="Размеры" value={[variant.lengthCm, variant.widthCm, variant.heightCm].map((x) => x?.toString() ?? "—").join(" × ") + " см"} />
            <Row label="Вес" value={variant.weightG ? `${variant.weightG} г` : "—"} />
            <Row label="Литраж" value={variant.liters?.toString() ?? "—"} />
          </Card>
        </div>
      </div>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Заказы ({variant.orders.length})</h2>
          <Link
            href={`/orders/new?variantId=${variant.id}`}
            className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800"
          >
            + Создать заказ
          </Link>
        </div>
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500">№</th>
                <th className="px-3 py-2 text-right text-xs font-semibold uppercase text-slate-500">Кол-во</th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500">Статус</th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500">Прибытие</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {variant.orders.map((o) => (
                <tr key={o.id}>
                  <td className="px-3 py-2"><Link href={`/orders/${o.id}`} className="font-mono text-xs hover:underline">{o.orderNumber}</Link></td>
                  <td className="px-3 py-2 text-right">{o.quantity}</td>
                  <td className="px-3 py-2">
                    <span className={`inline-block rounded px-2 py-0.5 text-xs ${ORDER_STATUS_COLORS[o.status]}`}>
                      {ORDER_STATUS_LABELS[o.status]}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-xs">{formatDate(o.arrivalPlannedDate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {variant.orders.length === 0 && <div className="p-6 text-center text-sm text-slate-500">Заказов нет</div>}
        </div>
      </section>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</h2>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3 text-sm">
      <span className="text-slate-600">{label}</span>
      <span className="text-right text-slate-900">{value}</span>
    </div>
  );
}
