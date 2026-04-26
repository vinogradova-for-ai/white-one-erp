import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PACKAGING_TYPE_LABELS, PACKAGING_TYPE_ICONS, ORDER_STATUS_LABELS, ORDER_STATUS_COLORS } from "@/lib/constants";
import { PACKAGING_STATUS_LABELS, PACKAGING_STATUS_COLORS } from "@/lib/status-machine/packaging-statuses";
import { InlineNumberField } from "@/components/common/inline-number-field";
import { PackagingStatusChanger } from "@/components/packaging/packaging-status-changer";
import { PhotoThumb } from "@/components/common/photo-thumb";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/format";

export default async function PackagingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const item = await prisma.packagingItem.findUnique({
    where: { id },
    include: {
      owner: { select: { name: true } },
      statusLogs: {
        orderBy: { changedAt: "desc" },
        take: 20,
        include: { changedBy: { select: { name: true } } },
      },
      orderUsages: {
        include: {
          order: {
            select: {
              id: true,
              orderNumber: true,
              status: true,
              deletedAt: true,
              productModel: { select: { name: true } },
              lines: {
                select: {
                  quantity: true,
                  productVariant: { select: { colorName: true } },
                },
              },
            },
          },
        },
      },
      packagingOrderLines: {
        where: { packagingOrder: { status: { notIn: ["ARRIVED", "CANCELLED"] } } },
        select: { id: true, quantity: true, packagingOrder: { select: { id: true, orderNumber: true, status: true, expectedDate: true } } },
      },
    },
  });
  if (!item) return notFound();

  const activeUsages = item.orderUsages.filter(
    (u) => u.order.deletedAt === null && !["ON_SALE", "SHIPPED_WB"].includes(u.order.status),
  );
  const orderTotalQty = (u: (typeof item.orderUsages)[number]) =>
    u.order.lines.reduce((a, l) => a + l.quantity, 0);
  const required = activeUsages.reduce((s, u) => s + orderTotalQty(u) * Number(u.quantityPerUnit), 0);
  // «В производстве» = сумма количеств активных линий заказов упаковки (не ARRIVED/CANCELLED)
  const inProduction = item.packagingOrderLines.reduce((a, l) => a + l.quantity, 0);
  const available = item.stock + inProduction;
  const shortage = Math.max(0, Math.ceil(required) - available);

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-start">
        <div className="flex min-w-0 flex-1 gap-3">
          {item.photoUrl && (
            <div className="shrink-0">
              <PhotoThumb url={item.photoUrl} size={80} />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="text-xs text-slate-500">
              <span className="mr-1">{PACKAGING_TYPE_ICONS[item.type]}</span>
              {PACKAGING_TYPE_LABELS[item.type]}
            </div>
            <h1 className="text-2xl font-semibold text-slate-900">{item.name}</h1>
            {item.sku && <div className="font-mono text-xs text-slate-500">{item.sku}</div>}
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className={`rounded px-2 py-0.5 text-xs ${PACKAGING_STATUS_COLORS[item.status]}`}>
                {PACKAGING_STATUS_LABELS[item.status]}
              </span>
              {item.owner && <span className="text-xs text-slate-500">Ответственный: {item.owner.name}</span>}
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <PackagingStatusChanger id={item.id} currentStatus={item.status} />
          <Link
            href={`/packaging/${item.id}/edit`}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
          >
            Редактировать
          </Link>
        </div>
      </div>

      {/* Этапы разработки */}
      {(item.decisionDate || item.designReadyDate || item.sampleRequestedDate || item.sampleApprovedDate || item.productionStartDate) && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Этапы разработки</h2>
          <div className="grid gap-2 md:grid-cols-5">
            {[
              { label: "Решение", date: item.decisionDate },
              { label: "Макет готов", date: item.designReadyDate },
              { label: "Образец заказан", date: item.sampleRequestedDate },
              { label: "Образец утверждён", date: item.sampleApprovedDate },
              { label: "Запуск в производство", date: item.productionStartDate },
            ].map((s) => (
              <div key={s.label} className="rounded-lg border border-slate-200 bg-slate-50 p-2 text-center">
                <div className="text-[11px] uppercase tracking-wide text-slate-500">{s.label}</div>
                <div className={`mt-0.5 text-sm ${s.date ? "font-medium text-slate-900" : "text-slate-400"}`}>
                  {s.date ? formatDate(s.date) : "—"}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Стоимость */}
      {(item.unitPriceRub || item.unitPriceCny) && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Стоимость единицы</h2>
          {item.priceCurrency === "CNY" && item.unitPriceCny ? (
            <div className="text-sm">
              <div className="text-lg font-semibold text-slate-900">
                {Number(item.unitPriceCny).toLocaleString("ru-RU", { maximumFractionDigits: 2 })} ¥
              </div>
              {item.cnyRubRate && (
                <div className="text-xs text-slate-500">
                  ≈ {(Number(item.unitPriceCny) * Number(item.cnyRubRate)).toLocaleString("ru-RU", { maximumFractionDigits: 2 })} ₽ по курсу {item.cnyRubRate.toString()}
                </div>
              )}
            </div>
          ) : item.unitPriceRub ? (
            <div className="text-lg font-semibold text-slate-900">
              {formatCurrency(Number(item.unitPriceRub))}
            </div>
          ) : null}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <Metric
          label="На складе"
          value={item.stock}
          accent={item.minStock != null && item.stock < item.minStock ? "warn" : undefined}
          footer={item.minStock != null ? `мин: ${item.minStock}` : undefined}
          inline={
            <InlineNumberField
              label=""
              value={item.stock.toString()}
              endpoint={`/api/packaging/${item.id}`}
              field="stock"
              suffix="шт"
            />
          }
        />
        <Metric
          label="В производстве"
          value={inProduction}
          footer={
            item.packagingOrderLines.length > 0
              ? `${item.packagingOrderLines.length} активных заказ(а) упаковки`
              : "Нет активных заказов"
          }
        />
        <Metric
          label="Потребность по заказам"
          value={Math.ceil(required)}
          accent={shortage > 0 ? "danger" : "ok"}
          footer={shortage > 0 ? `Дефицит: ${shortage} шт — нужно запустить в производство` : "Хватает"}
        />
      </div>

      {item.description && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Описание</h2>
          <p className="whitespace-pre-line text-sm text-slate-700">{item.description}</p>
        </div>
      )}

      {item.notes && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Заметки</h2>
          <p className="whitespace-pre-line text-sm text-slate-700">{item.notes}</p>
        </div>
      )}

      <section>
        <h2 className="mb-3 text-lg font-semibold text-slate-900">
          Используется в заказах ({item.orderUsages.length})
        </h2>
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500">Заказ</th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500">Товар</th>
                <th className="px-3 py-2 text-right text-xs font-semibold uppercase text-slate-500">Тираж</th>
                <th className="px-3 py-2 text-right text-xs font-semibold uppercase text-slate-500">На единицу</th>
                <th className="px-3 py-2 text-right text-xs font-semibold uppercase text-slate-500">Всего</th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500">Статус</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {item.orderUsages.map((u) => {
                const qty = orderTotalQty(u);
                const colors = u.order.lines.map((l) => l.productVariant.colorName).join(", ");
                return (
                <tr key={u.id}>
                  <td className="px-3 py-2">
                    <Link href={`/orders/${u.order.id}`} className="font-mono text-xs hover:underline">
                      {u.order.orderNumber}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {u.order.productModel.name}{colors ? " · " + colors : ""}
                  </td>
                  <td className="px-3 py-2 text-right">{qty.toLocaleString("ru-RU")}</td>
                  <td className="px-3 py-2 text-right">{Number(u.quantityPerUnit)}</td>
                  <td className="px-3 py-2 text-right font-semibold">
                    {Math.ceil(qty * Number(u.quantityPerUnit)).toLocaleString("ru-RU")}
                  </td>
                  <td className="px-3 py-2">
                    <span className={`inline-block rounded px-2 py-0.5 text-xs ${ORDER_STATUS_COLORS[u.order.status]}`}>
                      {ORDER_STATUS_LABELS[u.order.status]}
                    </span>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
          {item.orderUsages.length === 0 && (
            <div className="p-8 text-center text-sm text-slate-500">
              Пока ни один заказ не использует эту упаковку. Привязать можно на карточке заказа.
            </div>
          )}
        </div>
      </section>

      {item.statusLogs.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-semibold text-slate-900">История статусов</h2>
          <div className="rounded-2xl border border-slate-200 bg-white">
            <ul className="divide-y divide-slate-100">
              {item.statusLogs.map((log) => (
                <li key={log.id} className="flex items-center justify-between gap-4 px-4 py-3 text-sm">
                  <div>
                    <span className="text-slate-500">{log.fromStatus ? PACKAGING_STATUS_LABELS[log.fromStatus] : "—"}</span>
                    <span className="mx-2 text-slate-400">→</span>
                    <span className="font-medium text-slate-900">{PACKAGING_STATUS_LABELS[log.toStatus]}</span>
                    {log.comment && <div className="text-xs text-slate-500">{log.comment}</div>}
                  </div>
                  <div className="text-right text-xs text-slate-500">
                    {formatDateTime(log.changedAt)}
                    <div>{log.changedBy.name}</div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}
    </div>
  );
}

function Metric({
  label,
  value,
  footer,
  accent,
  inline,
}: {
  label: string;
  value: number;
  footer?: string;
  accent?: "ok" | "warn" | "danger";
  inline?: React.ReactNode;
}) {
  const accentClass =
    accent === "danger" ? "border-red-200 bg-red-50" : accent === "warn" ? "border-amber-200 bg-amber-50" : "border-slate-200 bg-white";
  return (
    <div className={`rounded-2xl border p-4 ${accentClass}`}>
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-slate-900">{value.toLocaleString("ru-RU")}</div>
      {inline && <div className="mt-2">{inline}</div>}
      {footer && <div className="mt-1 text-xs text-slate-500">{footer}</div>}
    </div>
  );
}
