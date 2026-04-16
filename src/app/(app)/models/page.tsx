import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatNumber } from "@/lib/format";
import { PRODUCT_MODEL_STATUS_LABELS, PRODUCT_MODEL_STATUS_COLORS, CATEGORIES } from "@/lib/constants";
import { PhotoThumb } from "@/components/common/photo-thumb";
import { ProductModelStatus } from "@prisma/client";

export default async function ModelsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; category?: string; tag?: string; q?: string }>;
}) {
  const sp = await searchParams;
  const where: {
    deletedAt: null;
    status?: ProductModelStatus;
    category?: string;
    tags?: { has: string };
    OR?: Array<{ name?: { contains: string; mode: "insensitive" } }>;
  } = { deletedAt: null };
  if (sp.status && sp.status in PRODUCT_MODEL_STATUS_LABELS) where.status = sp.status as ProductModelStatus;
  if (sp.category) where.category = sp.category;
  if (sp.tag) where.tags = { has: sp.tag };
  if (sp.q) where.OR = [{ name: { contains: sp.q, mode: "insensitive" } }];

  const models = await prisma.productModel.findMany({
    where,
    orderBy: { updatedAt: "desc" },
    take: 200,
    include: {
      owner: { select: { name: true } },
      preferredFactory: { select: { name: true } },
      sizeGrid: { select: { name: true } },
      _count: { select: { variants: true, samples: true } },
    },
  });

  // Собираем все использованные теги для автоподсказок в фильтре
  const allTags = Array.from(new Set(models.flatMap((m) => m.tags))).sort();

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

      <form method="get" className="flex flex-wrap gap-2">
        <input
          name="q"
          defaultValue={sp.q ?? ""}
          placeholder="Поиск по названию…"
          className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
        />
        <select name="status" defaultValue={sp.status ?? ""} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
          <option value="">Все статусы</option>
          {Object.entries(PRODUCT_MODEL_STATUS_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <select name="category" defaultValue={sp.category ?? ""} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
          <option value="">Все категории</option>
          {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        {allTags.length > 0 && (
          <select name="tag" defaultValue={sp.tag ?? ""} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
            <option value="">Все теги</option>
            {allTags.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        )}
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
                  {m.category}{m.subcategory ? ` · ${m.subcategory}` : ""}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-1">
                  <span className={`inline-block rounded px-2 py-0.5 text-xs ${PRODUCT_MODEL_STATUS_COLORS[m.status]}`}>
                    {PRODUCT_MODEL_STATUS_LABELS[m.status]}
                  </span>
                  {m.isRepeat && <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600">повтор</span>}
                </div>
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3 text-xs text-slate-500">
              <span>{formatNumber(m._count.variants)} цветов</span>
              <span>{m.preferredFactory?.name ?? m.countryOfOrigin}</span>
              <span>{m.owner.name}</span>
            </div>
            {m.tags.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {m.tags.slice(0, 3).map((t) => (
                  <span key={t} className="rounded bg-slate-50 px-1.5 py-0.5 text-[10px] text-slate-500">
                    #{t}
                  </span>
                ))}
              </div>
            )}
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
