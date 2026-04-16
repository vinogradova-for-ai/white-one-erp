import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatCurrency, formatNumber, formatPercent } from "@/lib/format";
import { PRODUCT_STATUS_LABELS, PRODUCT_STATUS_COLORS, BRAND_LABELS } from "@/lib/constants";
import { ProductStatus, Brand } from "@prisma/client";

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; brand?: string; q?: string }>;
}) {
  const sp = await searchParams;
  const where: {
    deletedAt: null;
    status?: ProductStatus;
    brand?: Brand;
    OR?: Array<{ sku?: { contains: string; mode: "insensitive" }; name?: { contains: string; mode: "insensitive" } }>;
  } = { deletedAt: null };
  if (sp.status && sp.status in PRODUCT_STATUS_LABELS) where.status = sp.status as ProductStatus;
  if (sp.brand && sp.brand in BRAND_LABELS) where.brand = sp.brand as Brand;
  if (sp.q) {
    where.OR = [
      { sku: { contains: sp.q, mode: "insensitive" } },
      { name: { contains: sp.q, mode: "insensitive" } },
    ];
  }

  const products = await prisma.product.findMany({
    where,
    orderBy: { updatedAt: "desc" },
    take: 200,
    include: {
      owner: { select: { name: true } },
      preferredFactory: { select: { name: true } },
      _count: { select: { orders: true } },
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Каталог изделий</h1>
          <p className="text-sm text-slate-500">Всего: {products.length}</p>
        </div>
        <Link
          href="/products/new"
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          + Создать изделие
        </Link>
      </div>

      <form method="get" className="flex flex-wrap gap-2">
        <input
          name="q"
          defaultValue={sp.q ?? ""}
          placeholder="Поиск по артикулу или названию…"
          className="flex-1 min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
        />
        <select name="status" defaultValue={sp.status ?? ""} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
          <option value="">Все статусы</option>
          {Object.entries(PRODUCT_STATUS_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <select name="brand" defaultValue={sp.brand ?? ""} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
          <option value="">Все бренды</option>
          {Object.entries(BRAND_LABELS).map(([k, v]) => (
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
              <Th>Артикул</Th>
              <Th>Название</Th>
              <Th>Бренд</Th>
              <Th>Категория</Th>
              <Th>Статус</Th>
              <Th className="text-right">Себест.</Th>
              <Th className="text-right">Цена WB</Th>
              <Th className="text-right">ROI</Th>
              <Th className="text-right">% выкупа</Th>
              <Th>Ответственный</Th>
              <Th>Заказов</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {products.map((p) => (
              <tr key={p.id} className="hover:bg-slate-50">
                <td className="px-3 py-2 whitespace-nowrap">
                  <Link href={`/products/${p.id}`} className="font-mono text-xs text-slate-700 hover:underline">
                    {p.sku}
                  </Link>
                </td>
                <td className="px-3 py-2">
                  <Link href={`/products/${p.id}`} className="text-slate-900 hover:underline">
                    {p.name}
                  </Link>
                </td>
                <td className="px-3 py-2 text-xs text-slate-600">{BRAND_LABELS[p.brand]}</td>
                <td className="px-3 py-2 text-xs text-slate-600">{p.category}</td>
                <td className="px-3 py-2">
                  <span className={`inline-block rounded px-2 py-0.5 text-xs ${PRODUCT_STATUS_COLORS[p.status]}`}>
                    {PRODUCT_STATUS_LABELS[p.status]}
                  </span>
                </td>
                <td className="px-3 py-2 text-right text-xs text-slate-700">{formatCurrency(p.fullCost?.toString())}</td>
                <td className="px-3 py-2 text-right text-xs text-slate-700">{formatCurrency(p.wbPrice?.toString())}</td>
                <td className="px-3 py-2 text-right text-xs text-slate-700">{formatPercent(p.roi?.toString())}</td>
                <td className="px-3 py-2 text-right text-xs text-slate-700">{formatPercent(p.plannedRedemptionPct?.toString())}</td>
                <td className="px-3 py-2 text-xs text-slate-600">{p.owner.name}</td>
                <td className="px-3 py-2 text-xs text-slate-600">{formatNumber(p._count.orders)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {products.length === 0 && (
          <div className="p-12 text-center text-sm text-slate-500">Ничего не найдено</div>
        )}
      </div>
    </div>
  );
}

function Th({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <th className={`px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 ${className}`}>
      {children}
    </th>
  );
}
