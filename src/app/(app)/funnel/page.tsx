import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { PRODUCT_STATUS_LABELS, PRODUCT_STATUS_ORDER, PRODUCT_STATUS_COLORS, BRAND_LABELS } from "@/lib/constants";

export default async function FunnelPage() {
  const products = await prisma.product.findMany({
    where: { deletedAt: null, status: { not: "READY_FOR_PRODUCTION" } },
    include: { owner: { select: { name: true } } },
    orderBy: { updatedAt: "desc" },
  });

  const byStatus = PRODUCT_STATUS_ORDER.filter((s) => s !== "READY_FOR_PRODUCTION").map((s) => ({
    status: s,
    label: PRODUCT_STATUS_LABELS[s],
    items: products.filter((p) => p.status === s),
  }));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Воронка новинок</h1>
        <p className="text-sm text-slate-500">Изделия в разработке — {products.length}</p>
      </div>

      <div className="flex gap-3 overflow-x-auto pb-4">
        {byStatus.map((col) => (
          <div key={col.status} className="w-64 flex-shrink-0">
            <div className={`mb-2 rounded-lg px-3 py-2 text-sm font-medium ${PRODUCT_STATUS_COLORS[col.status]}`}>
              {col.label} <span className="ml-1 text-xs">({col.items.length})</span>
            </div>
            <div className="space-y-2">
              {col.items.map((p) => (
                <Link
                  key={p.id}
                  href={`/products/${p.id}`}
                  className="block rounded-xl border border-slate-200 bg-white p-3 text-sm hover:shadow-sm"
                >
                  <div className="font-medium text-slate-900">{p.name}</div>
                  <div className="font-mono text-xs text-slate-500">{p.sku}</div>
                  <div className="mt-1 text-xs text-slate-500">
                    {BRAND_LABELS[p.brand]} · {p.category}
                  </div>
                  <div className="mt-1 text-xs text-slate-400">{p.owner.name}</div>
                </Link>
              ))}
              {col.items.length === 0 && (
                <div className="rounded-xl border-2 border-dashed border-slate-200 p-4 text-center text-xs text-slate-400">
                  пусто
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
