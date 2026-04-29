import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatCurrency } from "@/lib/format";
import { VariantVisual } from "@/components/common/variant-visual";
import { ColorChip } from "@/components/common/color-chip";
import { NewVariantButton } from "@/components/variants/new-variant-button";

export default async function VariantsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const sp = await searchParams;
  const where: {
    deletedAt: null;
    OR?: Array<{ sku?: { contains: string; mode: "insensitive" }; colorName?: { contains: string; mode: "insensitive" } }>;
  } = { deletedAt: null };
  if (sp.q) {
    where.OR = [
      { sku: { contains: sp.q, mode: "insensitive" } },
      { colorName: { contains: sp.q, mode: "insensitive" } },
    ];
  }

  const [variants, models] = await Promise.all([
    prisma.productVariant.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      take: 200,
      include: {
        productModel: {
          select: {
            id: true,
            name: true,
            category: true,
            fullCost: true,
            wbPrice: true,
            roi: true,
            photoUrls: true,
          },
        },
        _count: { select: { orderLines: true } },
      },
    }),
    prisma.productModel.findMany({
      where: { deletedAt: null },
      select: { id: true, name: true },
      orderBy: { updatedAt: "desc" },
    }),
  ]);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Цветомодели</h1>
          <p className="text-sm text-slate-500">Всего: {variants.length}</p>
        </div>
        <NewVariantButton models={models} />
      </div>

      <form method="get" className="flex flex-wrap gap-2">
        <input
          name="q"
          defaultValue={sp.q ?? ""}
          placeholder="Поиск по артикулу или цвету…"
          className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
        />
        <button type="submit" className="rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200">
          Применить
        </button>
      </form>

      {/* Мобильная версия — карточки */}
      <div className="md:hidden space-y-2">
        {variants.map((v) => (
          <Link
            key={v.id}
            href={`/variants/${v.id}`}
            className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 active:bg-slate-50"
          >
            <VariantVisual
              variantPhotoUrl={v.photoUrls[0] ?? null}
              modelPhotoUrl={v.productModel.photoUrls[0] ?? null}
              colorName={v.colorName}
              size={56}
              hideBadge
            />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-slate-900">{v.productModel.name}</div>
              <div className="mt-0.5 flex items-center gap-1.5 text-xs">
                <ColorChip name={v.colorName} />
              </div>
              <div className="mt-1 truncate font-mono text-[11px] text-slate-400">{v.sku}</div>
            </div>
            <div className="shrink-0 text-right text-xs text-slate-500">
              {formatCurrency(v.productModel.fullCost?.toString())}
            </div>
          </Link>
        ))}
        {variants.length === 0 && <div className="rounded-xl border border-slate-200 bg-white p-12 text-center text-sm text-slate-500">Ничего не найдено</div>}
      </div>

      {/* Десктопная версия — таблица */}
      <div className="hidden overflow-x-auto rounded-2xl border border-slate-200 bg-white md:block">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500">Фото</th>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500">Артикул</th>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500">Фасон</th>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500">Цвет</th>
              <th className="px-3 py-2 text-right text-xs font-semibold uppercase text-slate-500">Себест.</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {variants.map((v) => (
              <tr key={v.id} className="hover:bg-slate-50">
                <td className="px-3 py-2">
                  <VariantVisual
                    variantPhotoUrl={v.photoUrls[0] ?? null}
                    modelPhotoUrl={v.productModel.photoUrls[0] ?? null}
                    colorName={v.colorName}
                    size={48}
                  />
                </td>
                <td className="px-3 py-2">
                  <Link href={`/variants/${v.id}`} className="font-mono text-xs text-slate-700 hover:underline">
                    {v.sku}
                  </Link>
                </td>
                <td className="px-3 py-2">
                  <Link href={`/models/${v.productModel.id}`} className="text-slate-900 hover:underline">
                    {v.productModel.name}
                  </Link>
                  <div className="text-xs text-slate-500">{v.productModel.category}</div>
                </td>
                <td className="px-3 py-2 text-slate-700"><ColorChip name={v.colorName} /></td>
                <td className="px-3 py-2 text-right text-xs">{formatCurrency(v.productModel.fullCost?.toString())}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {variants.length === 0 && <div className="p-12 text-center text-sm text-slate-500">Ничего не найдено</div>}
      </div>
    </div>
  );
}
