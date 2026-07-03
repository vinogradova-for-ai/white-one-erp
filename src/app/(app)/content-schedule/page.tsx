import Link from "next/link";
import { prisma } from "@/lib/prisma";
import type { OrderStatus } from "@prisma/client";
import { formatDate } from "@/lib/format";
import { VariantVisual } from "@/components/common/variant-visual";
import { ColorChip } from "@/components/common/color-chip";
import { ORDER_STATUS_LABELS, ORDER_STATUS_COLORS } from "@/lib/constants";

/**
 * Артикулы для фотосессии — все цветомодели, которые запущены в заказ.
 * Для каждой показываем самый ранний активный заказ и его статус.
 * §4 UX-аудита: фильтр «на складе / в пути» — Кате важно, что уже можно снимать.
 */
export default async function ContentSchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ f?: string }>;
}) {
  const sp = await searchParams;
  const filter: "all" | "warehouse" | "transit" =
    sp.f === "warehouse" || sp.f === "transit" ? sp.f : "all";

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
  const allRows = Array.from(byVariant.values());

  // Фильтр по местоположению: «на складе» = заказ уже в Москве, можно снимать;
  // «в пути» — всё, что ещё не приехало (от подготовки до доставки).
  const warehouseCount = allRows.filter((r) => r.order.status === "WAREHOUSE_MSK").length;
  const rows =
    filter === "warehouse"
      ? allRows.filter((r) => r.order.status === "WAREHOUSE_MSK")
      : filter === "transit"
      ? allRows.filter((r) => r.order.status !== "WAREHOUSE_MSK")
      : allRows;

  // Группируем по фасону — 127 строк простынёй не читаются; Кате нужно
  // «весь фасон одним блоком»: название один раз, под ним все цвета.
  const byModel = new Map<string, { name: string; items: Row[] }>();
  for (const line of rows) {
    const m = line.productVariant.productModel;
    const g = byModel.get(m.id) ?? { name: m.name, items: [] };
    g.items.push(line);
    byModel.set(m.id, g);
  }
  const groups = Array.from(byModel.entries()).map(([id, g]) => ({ id, ...g }));

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Артикулы для фотосессии</h1>
        <p className="mt-1 text-sm text-slate-500">
          Все цветомодели, запущенные в заказ. Всего: {rows.length}
        </p>
      </header>

      {/* Фильтр «где вещь»: снимать можно то, что на складе */}
      <div className="flex flex-wrap items-center gap-1.5">
        <FilterPill href="/content-schedule" active={filter === "all"} label={`Все (${allRows.length})`} />
        <FilterPill href="/content-schedule?f=warehouse" active={filter === "warehouse"} label={`На складе (${warehouseCount})`} />
        <FilterPill href="/content-schedule?f=transit" active={filter === "transit"} label={`В пути (${allRows.length - warehouseCount})`} />
      </div>

      {rows.length === 0 ? (
        <div className="rounded-2xl bg-white p-12 text-center text-sm text-slate-400">
          {filter === "warehouse"
            ? "На складе пока ничего нет — всё ещё едет."
            : filter === "transit"
            ? "В пути ничего нет — всё уже на складе."
            : "Пока нет ни одной цветомодели в заказе"}
        </div>
      ) : (
        <div className="space-y-4">
          {groups.map((g) => (
            <ModelSection key={g.id} g={g} />
          ))}
        </div>
      )}
    </div>
  );
}

function FilterPill({ href, active, label }: { href: string; active: boolean; label: string }) {
  return (
    <Link
      href={href}
      className={`inline-flex min-h-[40px] shrink-0 items-center rounded-full px-4 text-sm font-medium ${
        active ? "bg-slate-900 text-white" : "border border-slate-200 bg-white text-slate-700 hover:border-slate-300"
      }`}
    >
      {label}
    </Link>
  );
}

type SectionLine = {
  id: string;
  productVariant: {
    id: string;
    colorName: string;
    sku: string;
    photoUrls: string[];
    productModel: { id: string; name: string; photoUrls: string[] };
  };
  order: {
    id: string;
    orderNumber: string;
    status: OrderStatus;
    arrivalPlannedDate: Date | null;
    arrivalActualDate: Date | null;
  };
};

function ModelSection({ g }: { g: { id: string; name: string; items: SectionLine[] } }) {
  return (
    <section className="overflow-hidden rounded-2xl bg-white">
              <div className="flex items-baseline justify-between gap-2 border-b border-slate-100 px-4 py-2.5">
                <Link
                  href={`/models/${g.id}`}
                  className="truncate text-sm font-semibold text-slate-900 hover:underline"
                >
                  {g.name}
                </Link>
                <span className="shrink-0 text-xs text-slate-400">
                  {g.items.length} цв.
                </span>
              </div>
              <ul className="divide-y divide-slate-100">
                {g.items.map((line) => {
                  const v = line.productVariant;
                  const m = v.productModel;
                  return (
                    <li key={line.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50">
                      <Link href={`/variants/${v.id}`} className="contents">
                        <VariantVisual
                          variantPhotoUrl={v.photoUrls[0] ?? null}
                          modelPhotoUrl={m.photoUrls[0] ?? null}
                          colorName={v.colorName}
                          size={40}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500">
                            {/* §4 UX-аудита: имя цвета один раз — оно уже внутри ColorChip */}
                            <ColorChip name={v.colorName} size={10} textClassName="text-sm text-slate-900" />
                            <span className="font-mono">{v.sku}</span>
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
    </section>
  );
}
