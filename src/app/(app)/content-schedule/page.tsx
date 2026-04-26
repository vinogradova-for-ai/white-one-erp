import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/format";
import { VariantVisual } from "@/components/common/variant-visual";
import { ColorChip } from "@/components/common/color-chip";
import { ORDER_STATUS_LABELS, ORDER_STATUS_COLORS } from "@/lib/constants";

/**
 * Артикулы для фотосессии — все цветомодели, которые запущены в заказ.
 * Для каждой показываем самый ранний активный заказ и его статус.
 */
export default async function ContentSchedulePage() {
  // Все строки заказов с активным (не отгруженным/не проданным) заказом
  const lines = await prisma.orderLine.findMany({
    where: {
      productVariant: { deletedAt: null },
      order: {
        deletedAt: null,
        status: { notIn: ["SHIPPED_WB", "ON_SALE"] },
      },
    },
    include: {
      productVariant: {
        include: {
          productModel: { select: { id: true, name: true, photoUrls: true } },
        },
      },
      order: {
        select: {
          id: true,
          orderNumber: true,
          status: true,
          arrivalPlannedDate: true,
          arrivalActualDate: true,
        },
      },
    },
    orderBy: [{ order: { arrivalPlannedDate: "asc" } }, { createdAt: "asc" }],
  });

  // Группируем по variantId — оставляем строку с самым ранним прибытием
  type Row = (typeof lines)[number];
  const byVariant = new Map<string, Row>();
  for (const line of lines) {
    const existing = byVariant.get(line.productVariant.id);
    if (!existing) {
      byVariant.set(line.productVariant.id, line);
      continue;
    }
    const a = existing.order.arrivalPlannedDate?.getTime() ?? Infinity;
    const b = line.order.arrivalPlannedDate?.getTime() ?? Infinity;
    if (b < a) byVariant.set(line.productVariant.id, line);
  }
  const rows = Array.from(byVariant.values());

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Артикулы для фотосессии</h1>
        <p className="mt-1 text-sm text-slate-500">
          Все цветомодели, запущенные в заказ. Всего: {rows.length}
        </p>
      </header>

      {rows.length === 0 ? (
        <div className="rounded-2xl bg-white p-12 text-center text-sm text-slate-400">
          Пока нет ни одной цветомодели в заказе
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl bg-white">
          <ul className="divide-y divide-slate-100">
            {rows.map((line) => {
              const v = line.productVariant;
              const m = v.productModel;
              return (
                <li key={line.id} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50">
                  <Link href={`/variants/${v.id}`} className="contents">
                    <VariantVisual
                      variantPhotoUrl={v.photoUrls[0] ?? null}
                      modelPhotoUrl={m.photoUrls[0] ?? null}
                      colorName={v.colorName}
                      size={44}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-slate-900">{m.name}</div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500">
                        <span className="font-mono">{v.sku}</span>
                        <span>·</span>
                        <ColorChip name={v.colorName} size={10} />
                      </div>
                    </div>
                  </Link>
                  <Link
                    href={`/orders/${line.order.id}`}
                    className="shrink-0 text-xs text-slate-400 hover:text-slate-700 hover:underline"
                  >
                    #{line.order.orderNumber}
                  </Link>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${ORDER_STATUS_COLORS[line.order.status]}`}>
                    {ORDER_STATUS_LABELS[line.order.status]}
                  </span>
                  <span className="hidden shrink-0 text-xs text-slate-400 w-20 text-right sm:inline">
                    {formatDate(line.order.arrivalActualDate ?? line.order.arrivalPlannedDate)}
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
