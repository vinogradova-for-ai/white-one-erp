import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { formatCurrency, formatNumber } from "@/lib/format";
import {
  PRODUCT_VARIANT_STATUS_LABELS,
  PRODUCT_VARIANT_STATUS_COLORS,
  BRAND_LABELS,
} from "@/lib/constants";
import { PhotoGallery } from "@/components/common/photo-thumb";
import { VariantVisual } from "@/components/common/variant-visual";
import { ColorChip } from "@/components/common/color-chip";
import { DeleteButton } from "@/components/common/delete-button";

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
        include: { _count: { select: { orderLines: true } } },
      },
    },
  });

  if (!model) return notFound();

  // Собираем «факты» в один компактный список — без секций по 2 поля.
  const facts: Array<{ label: string; value: string | null }> = [
    { label: "Бренд", value: BRAND_LABELS[model.brand] },
    { label: "Категория", value: model.category },
    { label: "Страна", value: model.countryOfOrigin },
    { label: "Фабрика", value: model.preferredFactory?.name ?? null },
    { label: "Размерная сетка", value: model.sizeGrid?.name ?? null },
    { label: "Ответственный", value: model.owner.name },
  ].filter((f) => f.value != null) as Array<{ label: string; value: string }>;

  const target = model.targetCostCny ?? model.targetCostRub ?? null;
  const targetCur = model.targetCostCny ? "¥" : "₽";
  const purchase = model.purchasePriceCny ?? model.purchasePriceRub ?? null;
  const purchaseCur = model.purchasePriceCny ? "¥" : "₽";

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {/* Шапка */}
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="text-xs uppercase tracking-wider text-slate-400">
            {BRAND_LABELS[model.brand]} · {model.category}
          </div>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-900">{model.name}</h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <span>{model.variants.length} цветов</span>
            <span>·</span>
            <span>{model.owner.name}</span>
            {model.isRepeat && (
              <>
                <span>·</span>
                <span className="text-amber-700">повтор</span>
              </>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/models/${model.id}/edit`}
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
          >
            Редактировать
          </Link>
          <DeleteButton
            apiPath={`/api/models/${model.id}`}
            redirectTo="/models"
            confirmText={`Удалить фасон «${model.name}»? Все его цвета и связи тоже скроются. Восстановить будет нельзя.`}
          />
        </div>
      </header>

      {/* Фото слева, факты + экономика справа */}
      <div className="grid gap-5 lg:grid-cols-[1fr_1.4fr]">
        <div className="rounded-2xl bg-white p-3">
          <PhotoGallery urls={model.photoUrls} alt={model.name} />
        </div>

        <div className="space-y-3">
          {/* Себестоимость как KPI */}
          <div className="grid grid-cols-3 gap-3">
            <KpiCard
              label="Таргет"
              value={target != null ? `${targetCur}${formatNumber(target.toString())}` : "—"}
              hint={model.targetCostNote ?? undefined}
            />
            <KpiCard
              label="Закуп"
              value={purchase != null ? `${purchaseCur}${formatNumber(purchase.toString())}` : "—"}
            />
            <KpiCard
              label="Себестоимость"
              value={model.fullCost != null ? formatCurrency(model.fullCost.toString()) : "—"}
              accent
            />
          </div>

          {/* Факты — одной плиткой */}
          <div className="rounded-2xl bg-white p-5">
            <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
              {facts.map((f) => (
                <div key={f.label} className="flex justify-between gap-3">
                  <dt className="text-slate-500">{f.label}</dt>
                  <dd className="text-right text-slate-900">{f.value}</dd>
                </div>
              ))}
            </dl>

            {/* Документация и ткань — мелким шрифтом ниже, без отдельной карточки */}
            {(model.patternsUrl || model.fabricName) && (
              <div className="mt-4 space-y-1.5 border-t border-slate-100 pt-4 text-xs text-slate-500">
                {model.fabricName && (
                  <div>
                    <span className="text-slate-400">Ткань:</span>{" "}
                    {model.fabricName}
                    {model.fabricComposition ? ` · ${model.fabricComposition}` : ""}
                  </div>
                )}
                {model.patternsUrl && (
                  <div>
                    <span className="text-slate-400">Материалы:</span>{" "}
                    <a href={model.patternsUrl} target="_blank" rel="noopener" className="text-slate-700 underline-offset-2 hover:underline">
                      открыть папку
                    </a>
                  </div>
                )}
              </div>
            )}

            {model.notes && (
              <p className="mt-3 whitespace-pre-line border-t border-slate-100 pt-3 text-xs text-slate-600">
                {model.notes}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Цветомодели */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">Цветомодели</h2>
          <Link
            href={`/models/${model.id}/variants/new`}
            className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800"
          >
            + Цветомодель
          </Link>
        </div>
        {model.variants.length === 0 ? (
          <div className="rounded-2xl bg-white p-8 text-center text-sm text-slate-400">
            Цветов пока нет
          </div>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {model.variants.map((v) => (
              <Link
                key={v.id}
                href={`/variants/${v.id}`}
                className="group flex items-center gap-3 rounded-2xl bg-white p-3 transition hover:bg-slate-50"
              >
                <VariantVisual
                  variantPhotoUrl={v.photoUrls[0] ?? null}
                  modelPhotoUrl={model.photoUrls[0] ?? null}
                  colorName={v.colorName}
                  size={48}
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-slate-900">
                    <ColorChip name={v.colorName} />
                  </div>
                  <div className="truncate font-mono text-[11px] text-slate-400">{v.sku}</div>
                </div>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${PRODUCT_VARIANT_STATUS_COLORS[v.status]}`}>
                  {PRODUCT_VARIANT_STATUS_LABELS[v.status]}
                </span>
              </Link>
            ))}
          </div>
        )}
      </section>

    </div>
  );
}

function KpiCard({ label, value, hint, accent }: { label: string; value: string; hint?: string; accent?: boolean }) {
  return (
    <div className={`rounded-2xl px-4 py-3 ${accent ? "bg-slate-900 text-white" : "bg-white"}`}>
      <div className={`text-[11px] uppercase tracking-wider ${accent ? "text-slate-400" : "text-slate-400"}`}>{label}</div>
      <div className={`mt-0.5 truncate text-lg font-semibold ${accent ? "text-white" : "text-slate-900"}`}>{value}</div>
      {hint && <div className={`mt-0.5 truncate text-[10px] ${accent ? "text-slate-400" : "text-slate-400"}`}>{hint}</div>}
    </div>
  );
}
