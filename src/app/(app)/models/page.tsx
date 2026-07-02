import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatNumber } from "@/lib/format";
import { CATEGORIES, BRAND_LABELS } from "@/lib/constants";
import { PhotoThumb } from "@/components/common/photo-thumb";
import { Brand } from "@prisma/client";
import { ModelsFilters } from "@/components/models/models-filters";
import { parseCategoryParam } from "@/components/models/models-filters-shared";
import { ListCapNotice } from "@/components/common/list-cap-notice";

// Потолок каталога фасонов (аудит блок ④).
const MODELS_CAP = 200;

export default async function ModelsPage({
  searchParams,
}: {
  searchParams: Promise<{ brand?: string; category?: string; owner?: string; q?: string; show?: string }>;
}) {
  const sp = await searchParams;
  // По умолчанию показываем только активированные фасоны.
  // Черновики (созданные через образец, ещё не запущенные) — отдельным фильтром show=drafts.
  const showDrafts = sp.show === "drafts";
  const showAll = sp.show === "all";
  const categoryList = parseCategoryParam(sp.category, CATEGORIES);
  const where: {
    deletedAt: null;
    brand?: Brand;
    category?: string | { in: string[] };
    ownerId?: string;
    activated?: boolean;
    OR?: Array<{ name?: { contains: string; mode: "insensitive" } }>;
  } = { deletedAt: null };
  if (showDrafts) where.activated = false;
  else if (!showAll) where.activated = true;
  if (sp.brand && sp.brand in BRAND_LABELS) where.brand = sp.brand as Brand;
  if (categoryList.length === 1) where.category = categoryList[0];
  else if (categoryList.length > 1) where.category = { in: categoryList };
  if (sp.owner) where.ownerId = sp.owner;
  if (sp.q) where.OR = [{ name: { contains: sp.q, mode: "insensitive" } }];

  const [draftCount, totalCount, models, owners] = await Promise.all([
    prisma.productModel.count({
      where: { deletedAt: null, activated: false },
    }),
    // Реальное количество под текущий фильтр — чтобы «Всего» не показывало
    // размер среза (аудит блок ④).
    prisma.productModel.count({ where }),
    prisma.productModel.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      take: MODELS_CAP,
      include: {
        owner: { select: { name: true } },
        preferredFactory: { select: { name: true } },
        sizeGrid: { select: { name: true } },
        // Считаем только живые варианты — soft-deleted цвета не должны попадать в «N цветов».
        _count: { select: { variants: { where: { deletedAt: null } } } },
      },
    }),
    prisma.user.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 md:text-2xl">Каталог фасонов</h1>
          <p className="text-sm text-slate-500">
            Всего: {totalCount}
            {totalCount > models.length && ` · показаны ${models.length}`}
          </p>
        </div>
        <Link
          href="/models/new"
          className="flex h-11 shrink-0 items-center rounded-lg bg-slate-900 px-4 text-sm font-medium text-white hover:bg-slate-800 active:bg-slate-800"
        >
          + Создать
        </Link>
      </div>

      <div className="no-scrollbar -mx-4 flex items-center gap-1.5 overflow-x-auto px-4 md:mx-0 md:flex-wrap md:px-0">
        <span className="mr-1 shrink-0 text-xs uppercase tracking-wide text-slate-400">Показ:</span>
        <Link
          href="/models"
          className={`inline-flex min-h-[36px] shrink-0 items-center rounded-full border px-3 text-xs font-medium ${
            !showDrafts && !showAll
              ? "border-slate-900 bg-slate-900 text-white"
              : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
          }`}
        >
          Активные
        </Link>
        {draftCount > 0 && (
          <Link
            href="/models?show=drafts"
            className={`inline-flex min-h-[36px] shrink-0 items-center rounded-full border px-3 text-xs font-medium ${
              showDrafts
                ? "border-amber-500 bg-amber-500 text-white"
                : "border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100"
            }`}
          >
            Черновики из образцов ({draftCount})
          </Link>
        )}
        <Link
          href="/models?show=all"
          className={`inline-flex min-h-[36px] shrink-0 items-center rounded-full border px-3 text-xs font-medium ${
            showAll
              ? "border-slate-900 bg-slate-900 text-white"
              : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
          }`}
        >
          Все
        </Link>
      </div>

      <ModelsFilters
        brands={Object.entries(BRAND_LABELS).map(([key, label]) => ({ key, label }))}
        categories={CATEGORIES}
        owners={owners}
        selected={{
          q: sp.q ?? "",
          brand: sp.brand ?? "",
          categoryList,
          owner: sp.owner ?? "",
        }}
      />

      <ListCapNotice shown={models.length} cap={MODELS_CAP} unit="фасонов" />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {models.map((m) => (
          <Link
            key={m.id}
            href={`/models/${m.id}`}
            className="group block rounded-2xl border border-slate-200 bg-white p-4 hover:shadow-md"
          >
            <div className="flex gap-3">
              <PhotoThumb url={m.photoUrls[0]} size={72} />
              <div className="min-w-0 flex-1">
                <div className="font-medium text-slate-900 group-hover:text-slate-700 line-clamp-2">
                  {m.name}
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  {BRAND_LABELS[m.brand]} · {m.category}{m.subcategory && m.subcategory !== m.category ? ` · ${m.subcategory}` : ""}
                </div>
                {m.isRepeat && (
                  <div className="mt-2">
                    <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600">повтор</span>
                  </div>
                )}
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3 text-xs text-slate-500">
              <span>{formatNumber(m._count.variants)} цветов</span>
              <span>{m.preferredFactory?.name ?? m.countryOfOrigin}</span>
              <span>{m.owner.name}</span>
            </div>
          </Link>
        ))}
      </div>

      {models.length === 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white px-6 py-12 text-center text-sm text-slate-500">
          <div className="mb-2 text-3xl">⬢</div>
          Ничего не найдено
        </div>
      )}
    </div>
  );
}
