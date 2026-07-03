import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { formatNumber, formatDate, pluralRu } from "@/lib/format";
import {
  PRODUCT_VARIANT_STATUS_LABELS,
  PRODUCT_VARIANT_STATUS_COLORS,
  ORDER_STATUS_LABELS,
  ORDER_STATUS_COLORS,
  BRAND_LABELS,
} from "@/lib/constants";
import { PhotoGallery } from "@/components/common/photo-thumb";
import { VariantVisual } from "@/components/common/variant-visual";
import { ColorChip } from "@/components/common/color-chip";
import { DeleteButton } from "@/components/common/delete-button";
import { syncModelPackagingToOrders } from "@/server/sync-model-packaging";
import { CommentsThread } from "@/components/comments/comments-thread";
import { SamplesSection } from "@/components/models/samples-section";
import { ModelStageBadge } from "@/components/models/model-stage-badge";
import { auth } from "@/lib/auth";
import { can } from "@/lib/rbac";
import type { Role } from "@prisma/client";

export default async function ModelDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // Авто-синк упаковки фасона → открытые заказы (идемпотентно).
  await syncModelPackagingToOrders(id);
  const session = await auth();
  const sessionUser = session?.user as { id?: string; role?: string } | undefined;
  const currentUserId = sessionUser?.id;
  const isAdmin = sessionUser?.role === "OWNER" || sessionUser?.role === "DIRECTOR";

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
      packagingItems: {
        include: { packagingItem: { select: { id: true, name: true, type: true, photoUrl: true } } },
        orderBy: { createdAt: "asc" },
      },
      samples: {
        where: { deletedAt: null },
        orderBy: { createdAt: "desc" },
        include: { factory: { select: { name: true } } },
      },
      orders: {
        where: { deletedAt: null },
        orderBy: { createdAt: "desc" },
        take: 50,
        select: {
          id: true,
          orderNumber: true,
          status: true,
          arrivalPlannedDate: true,
          lines: { select: { quantity: true } },
        },
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

  // Себестоимость — одно поле в UI. Источник по приоритету:
  //   1) purchasePriceRub / purchasePriceCny (закупка у фабрики — самое точное)
  //   2) fullCost                              (расчёт со всеми составляющими)
  //   3) targetCostRub / targetCostCny         (legacy «таргет»)
  const cost = (() => {
    if (model.purchasePriceRub != null) return { value: model.purchasePriceRub, cur: "₽" };
    if (model.purchasePriceCny != null) return { value: model.purchasePriceCny, cur: "¥" };
    if (model.fullCost != null)         return { value: model.fullCost, cur: "₽" };
    if (model.targetCostRub != null)    return { value: model.targetCostRub, cur: "₽" };
    if (model.targetCostCny != null)    return { value: model.targetCostCny, cur: "¥" };
    return null;
  })();

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {/* Шапка */}
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="text-xs uppercase tracking-wider text-slate-400">
            {BRAND_LABELS[model.brand]} · {model.category}
          </div>
          <h1 className="mt-1 text-xl font-semibold tracking-tight text-slate-900 md:text-3xl">{model.name}</h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <ModelStageBadge
              modelId={model.id}
              status={model.status}
              sizeChartReady={model.sizeChartReady}
              canEdit={
                sessionUser?.role
                  ? can(sessionUser.role as Role, "product.updateStatus", model.ownerId, currentUserId)
                  : false
              }
              hasActiveOrder={model.orders.length > 0}
            />
            <span>·</span>
            <span>{model.variants.length} {pluralRu(model.variants.length, ["цвет", "цвета", "цветов"])}</span>
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
            className="flex h-10 items-center rounded-lg border border-slate-200 bg-white px-4 text-sm text-slate-700 hover:bg-slate-50 active:bg-slate-100"
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
          {/* Себестоимость — одна плитка, во всю ширину. Пустая — кликабельный
              призыв «задать цену» вместо немого прочерка (§4 UX-аудита). */}
          {cost != null ? (
            <KpiCard
              label="Себестоимость"
              value={`${cost.cur}${formatNumber(cost.value.toString())}`}
              accent
            />
          ) : (
            <Link
              href={`/models/${model.id}/edit#economy`}
              className="block rounded-2xl border-2 border-dashed border-slate-300 px-4 py-3 hover:border-slate-400 hover:bg-slate-50"
            >
              <div className="text-[11px] uppercase tracking-wider text-slate-400">Себестоимость</div>
              <div className="mt-0.5 text-lg font-semibold text-slate-500">не задана — задать цену →</div>
            </Link>
          )}

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

            {/* Маркировка ЧЗ — состав и ТНВЭД видны прямо в карточке;
                пустые подсвечены красным (дыра для Честного знака). */}
            <div className="mt-4 space-y-1.5 border-t border-slate-100 pt-4 text-xs">
              <div>
                <span className="text-slate-400">Состав (для ЧЗ):</span>{" "}
                {model.fabricComposition ? (
                  <span className="text-slate-700">{model.fabricComposition}</span>
                ) : (
                  <Link href={`/models/${model.id}/edit`} className="font-medium text-red-600 hover:underline dark:text-red-300">
                    не заполнено — заполнить
                  </Link>
                )}
              </div>
              <div>
                <span className="text-slate-400">ТНВЭД:</span>{" "}
                {model.tnvedCode ? (
                  <span className="text-slate-700">{model.tnvedCode}</span>
                ) : (
                  <Link href={`/models/${model.id}/edit`} className="font-medium text-red-600 hover:underline dark:text-red-300">
                    не заполнено — заполнить
                  </Link>
                )}
              </div>
            </div>

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

      {/* Образцы — заказан → едет → получен → вердикт */}
      <SamplesSection
        modelId={model.id}
        isAdmin={isAdmin}
        samples={model.samples.map((s) => ({
          id: s.id,
          label: s.label,
          status: s.status,
          orderedDate: s.orderedDate?.toISOString() ?? null,
          receivedDate: s.receivedDate?.toISOString() ?? null,
          verdictDate: s.verdictDate?.toISOString() ?? null,
          verdictNote: s.verdictNote,
          photoUrls: s.photoUrls,
          factoryName: s.factory?.name ?? null,
        }))}
      />

      {/* Комплект упаковки — что прикреплено к фасону */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">Комплект упаковки</h2>
          <Link
            href={`/models/${model.id}/edit`}
            className="inline-flex h-9 items-center rounded-lg border border-slate-300 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-50 active:bg-slate-100"
          >
            {model.packagingItems.length > 0 ? "Изменить" : "+ Прикрепить"}
          </Link>
        </div>
        {model.packagingItems.length === 0 ? (
          <div className="rounded-2xl bg-white px-6 py-8 text-center text-sm text-slate-400">
            <div className="mb-1 text-2xl">▯</div>
            Упаковка ещё не прикреплена
          </div>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {model.packagingItems.map((mp) => (
              <Link
                key={mp.id}
                href={`/packaging/${mp.packagingItem.id}`}
                className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 hover:bg-slate-50"
              >
                {mp.packagingItem.photoUrl ? (
                  <img src={mp.packagingItem.photoUrl} alt="" className="h-10 w-10 shrink-0 rounded object-cover" />
                ) : (
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-slate-100 text-[10px] text-slate-400">
                    нет фото
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-slate-900">{mp.packagingItem.name}</div>
                  <div className="text-xs text-slate-500">
                    {Number(mp.quantityPerUnit) === 1 ? "1 шт на изделие" : `${mp.quantityPerUnit} шт на изделие`}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* Заказы — компактный список (как на странице цветомодели) */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">Заказы</h2>
          <Link
            href={`/orders/new?modelId=${model.id}`}
            className="inline-flex h-9 items-center rounded-lg bg-slate-900 px-3 text-xs font-medium text-white hover:bg-slate-800 active:bg-slate-800"
          >
            + Заказ
          </Link>
        </div>
        {model.orders.length === 0 ? (
          <div className="rounded-2xl bg-white px-6 py-8 text-center text-sm text-slate-400">
            <div className="mb-1 text-2xl">⬡</div>
            Заказов нет
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl bg-white">
            <ul className="divide-y divide-slate-100">
              {model.orders.map((o) => {
                const totalQty = o.lines.reduce((a, l) => a + l.quantity, 0);
                return (
                  <li key={o.id}>
                    <Link href={`/orders/${o.id}`} className="flex items-center gap-3 px-4 py-3 transition hover:bg-slate-50">
                      <span className="font-mono text-xs text-slate-500">{o.orderNumber}</span>
                      <span className="flex-1 text-sm text-slate-700">{formatNumber(totalQty)} шт</span>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${ORDER_STATUS_COLORS[o.status]}`}>
                        {ORDER_STATUS_LABELS[o.status]}
                      </span>
                      <span className="shrink-0 text-xs text-slate-400">{formatDate(o.arrivalPlannedDate)}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </section>

      {/* Цветомодели */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">Цветомодели</h2>
          <Link
            href={`/models/${model.id}/variants/new`}
            className="inline-flex h-9 items-center rounded-lg bg-slate-900 px-3 text-xs font-medium text-white hover:bg-slate-800 active:bg-slate-800"
          >
            + Цветомодель
          </Link>
        </div>
        {model.variants.length === 0 ? (
          <div className="rounded-2xl bg-white px-6 py-8 text-center text-sm text-slate-400">
            <div className="mb-1 text-2xl">◎</div>
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

      <CommentsThread
        entityType="model"
        entityId={model.id}
        currentUserId={currentUserId}
        isAdmin={isAdmin}
        includeOrders
      />
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
