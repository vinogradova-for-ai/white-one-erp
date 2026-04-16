import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { formatCurrency, formatDate, formatDateTime, formatPercent } from "@/lib/format";
import { PRODUCT_STATUS_LABELS, PRODUCT_STATUS_COLORS, BRAND_LABELS, DEV_TYPE_LABELS } from "@/lib/constants";
import { ProductStatusChanger } from "@/components/products/product-status-changer";

export default async function ProductDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const product = await prisma.product.findFirst({
    where: { id, deletedAt: null },
    include: {
      owner: { select: { name: true } },
      preferredFactory: true,
      statusLogs: {
        orderBy: { changedAt: "desc" },
        take: 20,
        include: { changedBy: { select: { name: true } } },
      },
      orders: {
        where: { deletedAt: null },
        orderBy: { createdAt: "desc" },
        take: 10,
      },
    },
  });

  if (!product) return notFound();

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="font-mono text-xs text-slate-500">{product.sku}</div>
          <h1 className="text-2xl font-semibold text-slate-900">{product.name}</h1>
          <div className="mt-1 flex items-center gap-2">
            <span className={`inline-block rounded px-2 py-0.5 text-xs ${PRODUCT_STATUS_COLORS[product.status]}`}>
              {PRODUCT_STATUS_LABELS[product.status]}
            </span>
            <span className="text-xs text-slate-500">· {BRAND_LABELS[product.brand]} · {product.category}</span>
          </div>
        </div>
        <ProductStatusChanger productId={product.id} currentStatus={product.status} />
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <Card title="Классификация">
          <Row label="Подкатегория" value={product.subcategory ?? "—"} />
          <Row label="Цвет" value={product.color} />
          <Row label="Ткань" value={product.fabric ?? "—"} />
          <Row label="Размерная сетка" value={product.sizeChart ?? "—"} />
          <Row label="ТНВЭД" value={product.hsCode ?? "—"} />
          <Row label="Тип разработки" value={DEV_TYPE_LABELS[product.developmentType]} />
        </Card>

        <Card title="Производство">
          <Row label="Фабрика" value={product.preferredFactory?.name ?? "—"} />
          <Row label="Страна" value={product.countryOfOrigin} />
          <Row label="Упаковка" value={product.packagingType ?? "—"} />
          <Row label="Ответственный" value={product.owner.name} />
        </Card>

        <Card title="Экономика">
          <Row label="Закупка CNY" value={formatCurrency(product.purchasePriceCny?.toString(), { currency: "CNY" })} />
          <Row label="Курс" value={product.cnyRubRate?.toString() ?? "—"} />
          <Row label="Себестоимость" value={formatCurrency(product.fullCost?.toString())} />
          <Row label="Цена WB" value={formatCurrency(product.wbPrice?.toString())} />
          <Row label="Цена клиенту" value={formatCurrency(product.customerPrice?.toString())} />
          <Row label="Маржа до ДРР" value={formatCurrency(product.marginBeforeDrr?.toString())} />
          <Row label="Маржа после ДРР" value={formatPercent(product.marginAfterDrrPct?.toString())} />
          <Row label="ROI" value={formatPercent(product.roi?.toString())} />
          <Row label="Наценка" value={formatPercent(product.markupPct?.toString())} />
          <Row label="% выкупа (план)" value={formatPercent(product.plannedRedemptionPct?.toString())} />
        </Card>

        <Card title="Габариты">
          <Row label="Длина × Ширина × Высота" value={
            [product.lengthCm, product.widthCm, product.heightCm]
              .map((x) => x?.toString() ?? "—").join(" × ") + " см"
          } />
          <Row label="Вес" value={product.weightG ? `${product.weightG} г` : "—"} />
          <Row label="Литраж" value={product.liters?.toString() ?? "—"} />
        </Card>

        <Card title="Ссылки">
          {product.patternsUrl && <Row label="Лекала" value={<a href={product.patternsUrl} target="_blank" rel="noopener" className="text-blue-600 hover:underline">Открыть</a>} />}
          {product.techDocsUrl && <Row label="Тех. документация" value={<a href={product.techDocsUrl} target="_blank" rel="noopener" className="text-blue-600 hover:underline">Открыть</a>} />}
          {product.sampleUrl && <Row label="Фото образца" value={<a href={product.sampleUrl} target="_blank" rel="noopener" className="text-blue-600 hover:underline">Открыть</a>} />}
          {!product.patternsUrl && !product.techDocsUrl && !product.sampleUrl && (
            <p className="text-sm text-slate-500">Ссылок нет</p>
          )}
        </Card>

        <Card title="Даты этапов">
          <Row label="Эскиз" value={formatDate(product.sketchDate)} />
          <Row label="Лекала" value={formatDate(product.patternsDate)} />
          <Row label="Образец" value={formatDate(product.sampleDate)} />
          <Row label="Корректировки" value={formatDate(product.correctionsDate)} />
          <Row label="Размерная сетка" value={formatDate(product.sizeChartDate)} />
          <Row label="Утверждение" value={formatDate(product.approvedDate)} />
          <Row label="Готов к пр-ву" value={formatDate(product.readyForProdDate)} />
        </Card>
      </div>

      {product.notes && (
        <Card title="Примечания">
          <p className="whitespace-pre-line text-sm text-slate-700">{product.notes}</p>
        </Card>
      )}

      <Card title={`Заказы (${product.orders.length})`}>
        {product.orders.length === 0 ? (
          <p className="text-sm text-slate-500">Заказов нет</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {product.orders.map((o) => (
              <li key={o.id}>
                <Link href={`/orders/${o.id}`} className="text-slate-700 hover:underline">
                  {o.orderNumber} · {o.quantity} шт · {o.status}
                </Link>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-3">
          <Link href={`/orders/new?productId=${product.id}`} className="text-sm text-blue-600 hover:underline">
            + Создать заказ
          </Link>
        </div>
      </Card>

      <Card title="История статусов">
        <ul className="space-y-2 text-sm">
          {product.statusLogs.map((log) => (
            <li key={log.id} className="flex justify-between gap-4 border-b border-slate-100 pb-2 last:border-0">
              <div>
                <span className="text-slate-500">{log.fromStatus ? PRODUCT_STATUS_LABELS[log.fromStatus] : "—"}</span>
                <span className="mx-2 text-slate-400">→</span>
                <span className="font-medium text-slate-900">{PRODUCT_STATUS_LABELS[log.toStatus]}</span>
                {log.comment && <div className="text-xs text-slate-500">{log.comment}</div>}
              </div>
              <div className="text-right text-xs text-slate-500">
                {formatDateTime(log.changedAt)}
                <div>{log.changedBy.name}</div>
              </div>
            </li>
          ))}
        </ul>
      </Card>
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
