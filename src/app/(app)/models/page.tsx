import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatNumber } from "@/lib/format";
import { CATEGORIES, BRAND_LABELS } from "@/lib/constants";
import { PhotoThumb } from "@/components/common/photo-thumb";
import { Brand } from "@prisma/client";

export default async function ModelsPage({
  searchParams,
}: {
  searchParams: Promise<{ brand?: string; category?: string; q?: string; show?: string }>;
}) {
  const sp = await searchParams;
  // По умолчанию показываем только активированные фасоны.
  // Черновики (созданные через образец, ещё не запущенные) — отдельным фильтром show=drafts.
  const showDrafts = sp.show === "drafts";
  const showAll = sp.show === "all";
  const where: {
    deletedAt: null;
    brand?: Brand;
    category?: string;
    activated?: boolean;
    OR?: Array<{ name?: { contains: string; mode: "insensitive" } }>;
  } = { deletedAt: null };
  if (showDrafts) where.activated = false;
  else if (!showAll) where.activated = true;
  if (sp.brand && sp.brand in BRAND_LABELS) where.brand = sp.brand as Brand;
  if (sp.category) where.category = sp.category;
  if (sp.q) where.OR = [{ name: { contains: sp.q, mode: "insensitive" } }];

  const draftCount = await prisma.productModel.count({
    where: { deletedAt: null, activated: false },
  });

  const models = await prisma.productModel.findMany({
    where,
    orderBy: { updatedAt: "desc" },
    take: 200,
    include: {
      owner: { select: { name: true } },
      preferredFactory: { select: { name: true } },
      sizeGrid: { select: { name: true } },
      _count: { select: { variants: true } },
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Каталог фасонов</h1>
          <p className="text-sm text-slate-500">Всего: {models.length}</p>
        </div>
        <Link
          href="/models/new"
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          + Создать фасон
        </Link>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs uppercase tracking-wide text-slate-400 mr-1">Показ:</span>
        <Link
          href="/models"
          className={`rounded-full border px-3 py-1 text-xs font-medium ${
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
            className={`rounded-full border px-3 py-1 text-xs font-medium ${
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
          className={`rounded-full border px-3 py-1 text-xs font-medium ${
            showAll
              ? "border-slate-900 bg-slate-900 text-white"
              : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
          }`}
        >
          Все
        </Link>
      </div>

      <form method="get" className="flex flex-wrap gap-2">
        <input
          name="q"
          defaultValue={sp.q ?? ""}
          placeholder="Поиск по названию…"
          className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
        />
        <select name="brand" defaultValue={sp.brand ?? ""} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
          <option value="">Все бренды</option>
          {Object.entries(BRAND_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <select name="category" defaultValue={sp.category ?? ""} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
          <option value="">Все категории</option>
          {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <button type="submit" className="rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200">
          Применить
        </button>
      </form>

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
        <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center text-sm text-slate-500">
          Ничего не найдено
        </div>
      )}
    </div>
  );
}
