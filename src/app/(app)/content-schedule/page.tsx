import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/format";
import { VariantVisual } from "@/components/common/variant-visual";
import { ColorChip } from "@/components/common/color-chip";
import { ORDER_STATUS_LABELS, ORDER_STATUS_COLORS } from "@/lib/constants";

/**
 * Артикулы для фотосессии — список того, что приедет в ближайшие 2 недели
 * и нужно подготовить под съёмку.
 */
export default async function ContentSchedulePage() {
  const in14Days = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);

  const incomingOrders = await prisma.order.findMany({
    where: {
      deletedAt: null,
      status: { in: ["IN_TRANSIT", "WAREHOUSE_MSK", "PACKING"] },
      arrivalPlannedDate: { lte: in14Days },
    },
    include: {
      productModel: { select: { name: true, photoUrls: true } },
      lines: {
        select: {
          productVariant: { select: { sku: true, colorName: true, photoUrls: true } },
        },
        orderBy: { createdAt: "asc" },
      },
    },
    orderBy: { arrivalPlannedDate: "asc" },
  });

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Артикулы для фотосессии</h1>
        <p className="mt-1 text-sm text-slate-500">
          Что приедет в ближайшие 2 недели — планируем съёмку.
          Всего: {incomingOrders.length}
        </p>
      </header>

      {incomingOrders.length === 0 ? (
        <div className="rounded-2xl bg-white p-12 text-center text-sm text-slate-400">
          В ближайшие 2 недели поставок нет
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl bg-white">
          <ul className="divide-y divide-slate-100">
            {incomingOrders.map((o) => {
              const firstLine = o.lines[0];
              const colorNames = o.lines.map((l) => l.productVariant.colorName);
              return (
                <li key={o.id} className="flex items-center gap-3 px-4 py-3">
                  <VariantVisual
                    variantPhotoUrl={firstLine?.productVariant.photoUrls[0] ?? null}
                    modelPhotoUrl={o.productModel.photoUrls[0] ?? null}
                    colorName={firstLine?.productVariant.colorName ?? null}
                    size={44}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-slate-900">{o.productModel.name}</div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500">
                      {colorNames.length > 0
                        ? colorNames.map((c, i) => <ColorChip key={i} name={c} size={10} />)
                        : "—"}
                    </div>
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${ORDER_STATUS_COLORS[o.status]}`}>
                    {ORDER_STATUS_LABELS[o.status]}
                  </span>
                  <span className="shrink-0 text-xs text-slate-400 w-20 text-right">
                    {formatDate(o.arrivalPlannedDate)}
                  </span>
                  <span className="shrink-0 text-xs">
                    {o.wbCardReady ? (
                      <span className="text-emerald-600">✓ карточка</span>
                    ) : (
                      <span className="text-amber-600">нет карточки</span>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
