import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { formatCurrency, formatDate, formatDateTime, formatNumber, formatPercent } from "@/lib/format";
import {
  PRODUCT_MODEL_STATUS_LABELS,
  PRODUCT_MODEL_STATUS_COLORS,
  PRODUCT_VARIANT_STATUS_LABELS,
  PRODUCT_VARIANT_STATUS_COLORS,
  DEV_TYPE_LABELS,
  CURRENCY_LABELS,
  SAMPLE_STATUS_LABELS,
  SAMPLE_STATUS_COLORS,
} from "@/lib/constants";
import { PhotoThumb, PhotoGallery } from "@/components/common/photo-thumb";
import { ModelStatusChanger } from "@/components/models/model-status-changer";

export default async function ModelDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const model = await prisma.productModel.findFirst({
    where: { id, deletedAt: null },
    include: {
      owner: { select: { name: true } },
      preferredFactory: true,
      sizeGrid: true,
      variants: {
        where: { deletedAt: null },
        orderBy: { createdAt: "asc" },
        include: { _count: { select: { orders: true } } },
      },
      samples: { orderBy: { createdAt: "desc" }, include: { productVariant: { select: { colorName: true } } } },
      statusLogs: {
        orderBy: { changedAt: "desc" },
        take: 10,
        include: { changedBy: { select: { name: true } } },
      },
    },
  });

  if (!model) return notFound();

  const hasFabricInfo = model.fabricName || model.fabricConsumption || model.fabricPricePerMeter;
  const fabricCost = model.fabricConsumption && model.fabricPricePerMeter
    ? Number(model.fabricConsumption) * Number(model.fabricPricePerMeter)
    : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold text-slate-900">{model.name}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <span className={`inline-block rounded px-2 py-0.5 text-xs ${PRODUCT_MODEL_STATUS_COLORS[model.status]}`}>
              {PRODUCT_MODEL_STATUS_LABELS[model.status]}
            </span>
            <span className="text-xs text-slate-500">
              {model.category}{model.subcategory ? ` · ${model.subcategory}` : ""}
            </span>
            {model.isRepeat && <span className="rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-700">Повтор</span>}
          </div>
          {model.tags.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {model.tags.map((t) => (
                <span key={t} className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600">#{t}</span>
              ))}
            </div>
          )}
        </div>
        <ModelStatusChanger modelId={model.id} currentStatus={model.status} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-1">
          <PhotoGallery urls={model.photoUrls} alt={model.name} />
        </div>

        <div className="space-y-6 lg:col-span-2">
          <Card title="Основное">
            <Row label="Тип разработки" value={DEV_TYPE_LABELS[model.developmentType]} />
            <Row label="Страна" value={model.countryOfOrigin} />
            <Row label="Фабрика" value={model.preferredFactory?.name ?? "—"} />
            <Row label="Размерная сетка" value={model.sizeGrid?.name ?? "—"} />
            <Row label="Ответственный" value={model.owner.name} />
            {model.plannedLaunchMonth && (
              <Row label="Плановый запуск" value={String(model.plannedLaunchMonth).replace(/(\d{4})(\d{2})/, "$2/$1")} />
            )}
          </Card>

          {hasFabricInfo && (
            <Card title="Ткань">
              <Row label="Название" value={model.fabricName ?? "—"} />
              {model.fabricConsumption && (
                <Row label="Расход" value={`${formatNumber(Number(model.fabricConsumption), 2)} м/шт`} />
              )}
              {model.fabricPricePerMeter && (
                <Row
                  label="Цена метра"
                  value={`${formatNumber(Number(model.fabricPricePerMeter), 2)} ${model.fabricCurrency ? CURRENCY_LABELS[model.fabricCurrency] : "₽"}`}
                />
              )}
              {fabricCost !== null && (
                <Row
                  label="Ткань на штуку"
                  value={`${formatNumber(fabricCost, 2)} ${model.fabricCurrency ? CURRENCY_LABELS[model.fabricCurrency] : "₽"}`}
                />
              )}
            </Card>
          )}

          <Card title="Ссылки">
            {model.patternsUrl && <Row label={`Лекала${model.patternVersion ? ` (${model.patternVersion})` : ""}`} value={<a href={model.patternsUrl} target="_blank" rel="noopener" className="text-blue-600 hover:underline">открыть</a>} />}
            {model.techPackUrl && <Row label="Тех. пакет" value={<a href={model.techPackUrl} target="_blank" rel="noopener" className="text-blue-600 hover:underline">открыть</a>} />}
            {model.sampleApprovalUrl && <Row label="Утверждённый образец" value={<a href={model.sampleApprovalUrl} target="_blank" rel="noopener" className="text-blue-600 hover:underline">открыть</a>} />}
            {!model.patternsUrl && !model.techPackUrl && !model.sampleApprovalUrl && (
              <p className="text-sm text-slate-500">Ссылок нет</p>
            )}
          </Card>

          {model.notes && (
            <Card title="Примечания">
              <p className="whitespace-pre-line text-sm text-slate-700">{model.notes}</p>
            </Card>
          )}
        </div>
      </div>

      {/* Варианты — ключевое */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">
            Цветовые варианты ({model.variants.length})
          </h2>
          <Link
            href={`/models/${model.id}/variants/new`}
            className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800"
          >
            + Добавить цвет
          </Link>
        </div>
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {model.variants.map((v) => (
            <Link
              key={v.id}
              href={`/variants/${v.id}`}
              className="block rounded-2xl border border-slate-200 bg-white p-4 hover:shadow-md"
            >
              <div className="flex gap-3">
                <PhotoThumb url={v.photoUrls[0]} size={64} />
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-slate-900">{v.colorName}</div>
                  <div className="font-mono text-xs text-slate-500">{v.sku}</div>
                  <div className="mt-1">
                    <span className={`inline-block rounded px-2 py-0.5 text-xs ${PRODUCT_VARIANT_STATUS_COLORS[v.status]}`}>
                      {PRODUCT_VARIANT_STATUS_LABELS[v.status]}
                    </span>
                  </div>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-1 text-xs text-slate-500">
                <div>Себест.: <span className="text-slate-700">{formatCurrency(v.fullCost?.toString())}</span></div>
                <div>ROI: <span className="text-slate-700">{formatPercent(v.roi?.toString())}</span></div>
                <div>Цена WB: <span className="text-slate-700">{formatCurrency(v.wbPrice?.toString())}</span></div>
                <div>Заказов: <span className="text-slate-700">{v._count.orders}</span></div>
              </div>
            </Link>
          ))}
        </div>
        {model.variants.length === 0 && (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
            Вариантов пока нет. Добавьте первый цвет.
          </div>
        )}
      </section>

      {/* Образцы */}
      {model.samples.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-semibold text-slate-900">
            Образцы ({model.samples.length})
          </h2>
          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500">Вариант</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500">Статус</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500">Заказан</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500">Доставлен</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500">Утверждён</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {model.samples.map((s) => (
                  <tr key={s.id}>
                    <td className="px-3 py-2">
                      <Link href={`/samples/${s.id}`} className="hover:underline">
                        {s.productVariant?.colorName ?? "—"}
                      </Link>
                    </td>
                    <td className="px-3 py-2">
                      <span className={`inline-block rounded px-2 py-0.5 text-xs ${SAMPLE_STATUS_COLORS[s.status]}`}>
                        {SAMPLE_STATUS_LABELS[s.status]}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs">{formatDate(s.requestDate)}</td>
                    <td className="px-3 py-2 text-xs">{formatDate(s.deliveredDate)}</td>
                    <td className="px-3 py-2 text-xs">{formatDate(s.approvedDate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <Card title="История статусов">
        <ul className="space-y-2 text-sm">
          {model.statusLogs.map((log) => (
            <li key={log.id} className="flex justify-between gap-4 border-b border-slate-100 pb-2 last:border-0">
              <div>
                <span className="text-slate-500">{log.fromStatus ? PRODUCT_MODEL_STATUS_LABELS[log.fromStatus] : "—"}</span>
                <span className="mx-2 text-slate-400">→</span>
                <span className="font-medium text-slate-900">{PRODUCT_MODEL_STATUS_LABELS[log.toStatus]}</span>
                {log.comment && <div className="text-xs text-slate-500">{log.comment}</div>}
              </div>
              <div className="text-right text-xs text-slate-500">
                {formatDateTime(log.changedAt)}
                <div>{log.changedBy.name}</div>
              </div>
            </li>
          ))}
          {model.statusLogs.length === 0 && <li className="text-slate-500">История пуста</li>}
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
