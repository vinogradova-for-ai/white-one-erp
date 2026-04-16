import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatCurrency, formatPercent } from "@/lib/format";
import { PRODUCT_VARIANT_STATUS_LABELS, PRODUCT_VARIANT_STATUS_COLORS } from "@/lib/constants";
import { PhotoThumb } from "@/components/common/photo-thumb";
import { ProductVariantStatus } from "@prisma/client";

export default async function VariantsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string }>;
}) {
  const sp = await searchParams;
  const where: {
    deletedAt: null;
    status?: ProductVariantStatus;
    OR?: Array<{ sku?: { contains: string; mode: "insensitive" }; colorName?: { contains: string; mode: "insensitive" } }>;
  } = { deletedAt: null };
  if (sp.status && sp.status in PRODUCT_VARIANT_STATUS_LABELS) where.status = sp.status as ProductVariantStatus;
  if (sp.q) {
    where.OR = [
      { sku: { contains: sp.q, mode: "insensitive" } },
      { colorName: { contains: sp.q, mode: "insensitive" } },
    ];
  }

  const variants = await prisma.productVariant.findMany({
    where,
    orderBy: { updatedAt: "desc" },
    take: 200,
    include: {
      productModel: { select: { id: true, name: true, category: true } },
      _count: { select: { orders: true } },
    },
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Цветовые варианты</h1>
        <p className="text-sm text-slate-500">Всего: {variants.length}</p>
      </div>

      <form method="get" className="flex flex-wrap gap-2">
        <input
          name="q"
          defaultValue={sp.q ?? ""}
          placeholder="Поиск по артикулу или цвету…"
          className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
        />
        <select name="status" defaultValue={sp.status ?? ""} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
          <option value="">Все статусы</option>
          {Object.entries(PRODUCT_VARIANT_STATUS_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <button type="submit" className="rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200">
          Применить
        </button>
      </form>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500">Фото</th>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500">Артикул</th>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500">Фасон</th>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500">Цвет</th>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500">Статус</th>
              <th className="px-3 py-2 text-right text-xs font-semibold uppercase text-slate-500">Себест.</th>
              <th className="px-3 py-2 text-right text-xs font-semibold uppercase text-slate-500">Цена WB</th>
              <th className="px-3 py-2 text-right text-xs font-semibold uppercase text-slate-500">ROI</th>
              <th className="px-3 py-2 text-right text-xs font-semibold uppercase text-slate-500">Заказов</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {variants.map((v) => (
              <tr key={v.id} className="hover:bg-slate-50">
                <td className="px-3 py-2"><PhotoThumb url={v.photoUrls[0]} size={48} /></td>
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
                <td className="px-3 py-2 text-slate-700">{v.colorName}</td>
                <td className="px-3 py-2">
                  <span className={`inline-block rounded px-2 py-0.5 text-xs ${PRODUCT_VARIANT_STATUS_COLORS[v.status]}`}>
                    {PRODUCT_VARIANT_STATUS_LABELS[v.status]}
                  </span>
                </td>
                <td className="px-3 py-2 text-right text-xs">{formatCurrency(v.fullCost?.toString())}</td>
                <td className="px-3 py-2 text-right text-xs">{formatCurrency(v.wbPrice?.toString())}</td>
                <td className="px-3 py-2 text-right text-xs">{formatPercent(v.roi?.toString())}</td>
                <td className="px-3 py-2 text-right text-xs">{v._count.orders}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {variants.length === 0 && <div className="p-12 text-center text-sm text-slate-500">Ничего не найдено</div>}
      </div>
    </div>
  );
}
