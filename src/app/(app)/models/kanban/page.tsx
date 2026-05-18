import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { BRAND_LABELS, ORDER_STATUS_ORDER } from "@/lib/constants";
import { OrderStatus, ProductModelStatus, Brand } from "@prisma/client";

// 8 колонок: 3 model-status + 5 order-status. По образу Лешиной канбан-доски,
// адаптированы под наш домен. PATTERNS лежит в «Образце» (по словам Алёны,
// отдельной стадии «Лекала» у нас нет, фактически это часть Образца).
const COLUMNS = [
  { key: "idea",       title: "Идея",          dot: "#af52de" },
  { key: "sample",     title: "Образец",       dot: "#5856d6" },
  { key: "approved",   title: "Утверждён",     dot: "#0071e3" },
  { key: "production", title: "В производстве", dot: "#34c759" },
  { key: "qc",         title: "ОТК",           dot: "#a8d870" },
  { key: "transit",    title: "В пути",        dot: "#ff9500" },
  { key: "warehouse",  title: "На складе МСК", dot: "#ffcc00" },
  { key: "on_sale",    title: "В продаже",     dot: "#30b0c7" },
] as const;
type ColumnKey = typeof COLUMNS[number]["key"];

const MODEL_STATUS_TO_COL: Record<ProductModelStatus, ColumnKey> = {
  IDEA: "idea",
  PATTERNS: "sample",
  SAMPLE: "sample",
  APPROVED: "approved",
  IN_PRODUCTION: "production",
};

const ORDER_STATUS_TO_COL: Record<OrderStatus, ColumnKey> = {
  PREPARATION: "production",
  FABRIC_ORDERED: "production",
  SEWING: "production",
  QC: "qc",
  READY_SHIP: "qc",
  IN_TRANSIT: "transit",
  WAREHOUSE_MSK: "warehouse",
  PACKING: "warehouse",
  SHIPPED_WB: "warehouse",
  ON_SALE: "on_sale",
};

// Пастельные градиенты для плейсхолдера фото (когда фото нет) — берём
// детерминированный по id, чтобы было стабильно.
const PLACEHOLDER_PALETTES: Array<[string, string]> = [
  ["#fce4ec", "#f8bbd0"], ["#e8eaf6", "#c5cae9"], ["#fff3e0", "#ffe0b2"],
  ["#e0f2f1", "#b2dfdb"], ["#f3e5f5", "#e1bee7"], ["#fffde7", "#fff59d"],
  ["#e3f2fd", "#bbdefb"], ["#e8f5e9", "#c8e6c9"], ["#fff9c4", "#fff59d"],
  ["#dcedc8", "#aed581"], ["#fff8e1", "#ffecb3"], ["#ffe0b2", "#ffcc80"],
  ["#ffccbc", "#ffab91"],
];
function pickPalette(id: string): [string, string] {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) & 0xffffffff;
  return PLACEHOLDER_PALETTES[Math.abs(h) % PLACEHOLDER_PALETTES.length];
}

function isoDate(d: Date | null | undefined): string | null {
  return d ? d.toISOString().slice(0, 10) : null;
}

function moscowToday(): string {
  const now = new Date();
  const mskMs = now.getTime() + 3 * 60 * 60 * 1000;
  return new Date(mskMs).toISOString().slice(0, 10);
}

function formatDM(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${d}.${m}`;
}

function dayDiff(aIso: string, bIso: string): number {
  return Math.round(
    (new Date(`${bIso}T00:00:00Z`).getTime() - new Date(`${aIso}T00:00:00Z`).getTime()) / 86400000
  );
}

// Берём «самый продвинутый» активный заказ по pipeline ORDER_STATUS_ORDER.
type OrderForKanban = {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  readyAtFactoryDate: Date | null;
  qcDate: Date | null;
  arrivalPlannedDate: Date | null;
  saleStartDate: Date | null;
  factory: { name: string } | null;
  _count: { lines: number };
  lines: Array<{ quantity: number }>;
};
function mostAdvanced(orders: OrderForKanban[]): OrderForKanban | null {
  if (orders.length === 0) return null;
  return [...orders].sort(
    (a, b) => ORDER_STATUS_ORDER.indexOf(b.status) - ORDER_STATUS_ORDER.indexOf(a.status)
  )[0];
}

// Какое поле даты показывать как «ближайший дедлайн» в зависимости от колонки.
function pickDeadline(col: ColumnKey, model: { sampleDate: Date | null; approvedDate: Date | null; productionStartDate: Date | null; plannedLaunchMonth: number | null }, order: OrderForKanban | null): { iso: string; label: string } | null {
  if (col === "idea") {
    if (!model.plannedLaunchMonth) return null;
    const ym = String(model.plannedLaunchMonth);
    return { iso: `${ym.slice(0,4)}-${ym.slice(4,6)}-01`, label: "запуск" };
  }
  if (col === "sample") return model.sampleDate
    ? { iso: isoDate(model.sampleDate)!, label: "образец" } : null;
  if (col === "approved") return model.approvedDate
    ? { iso: isoDate(model.approvedDate)!, label: "утв." } : null;
  if (!order) return null;
  if (col === "production") return order.readyAtFactoryDate
    ? { iso: isoDate(order.readyAtFactoryDate)!, label: "готов на фабрике" } : null;
  if (col === "qc") return order.qcDate
    ? { iso: isoDate(order.qcDate)!, label: "ОТК" } : null;
  if (col === "transit") return order.arrivalPlannedDate
    ? { iso: isoDate(order.arrivalPlannedDate)!, label: "прибытие" } : null;
  if (col === "warehouse") return order.saleStartDate
    ? { iso: isoDate(order.saleStartDate)!, label: "старт продаж" } : null;
  if (col === "on_sale") return order.saleStartDate
    ? { iso: isoDate(order.saleStartDate)!, label: "продажи" } : null;
  return null;
}

export default async function ModelsKanbanPage({
  searchParams,
}: {
  searchParams: Promise<{ brand?: string; category?: string; q?: string }>;
}) {
  const sp = await searchParams;
  const todayIso = moscowToday();

  const where: {
    deletedAt: null;
    activated: boolean;
    brand?: Brand;
    category?: string;
    OR?: Array<{ name: { contains: string; mode: "insensitive" } }>;
  } = { deletedAt: null, activated: true };
  if (sp.brand && sp.brand in BRAND_LABELS) where.brand = sp.brand as Brand;
  if (sp.category) where.category = sp.category;
  if (sp.q) where.OR = [{ name: { contains: sp.q, mode: "insensitive" } }];

  const models = await prisma.productModel.findMany({
    where,
    orderBy: { updatedAt: "desc" },
    take: 500,
    select: {
      id: true,
      name: true,
      brand: true,
      category: true,
      subcategory: true,
      photoUrls: true,
      status: true,
      sampleDate: true,
      approvedDate: true,
      productionStartDate: true,
      plannedLaunchMonth: true,
      preferredFactory: { select: { name: true } },
      orders: {
        where: { deletedAt: null },
        select: {
          id: true,
          orderNumber: true,
          status: true,
          readyAtFactoryDate: true,
          qcDate: true,
          arrivalPlannedDate: true,
          saleStartDate: true,
          factory: { select: { name: true } },
          _count: { select: { lines: true } },
          lines: { select: { quantity: true } },
        },
      },
    },
  });

  // Раскидать карточки по колонкам
  const buckets: Record<ColumnKey, Array<{
    model: typeof models[number];
    order: OrderForKanban | null;
    column: ColumnKey;
    deadline: { iso: string; label: string } | null;
    qty: number;
  }>> = Object.fromEntries(COLUMNS.map((c) => [c.key, []])) as never;

  for (const m of models) {
    const order = mostAdvanced(m.orders as OrderForKanban[]);
    const column: ColumnKey = order ? ORDER_STATUS_TO_COL[order.status] : MODEL_STATUS_TO_COL[m.status];
    const deadline = pickDeadline(column, m, order);
    const qty = order ? order.lines.reduce((a, l) => a + l.quantity, 0) : 0;
    buckets[column].push({ model: m, order, column, deadline, qty });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-4 flex-wrap">
        <h1 className="text-xl font-semibold">Канбан фасонов</h1>
        <div className="flex gap-1 bg-slate-100 rounded-lg p-0.5">
          <Link href="/models" className="px-3 py-1 text-sm rounded-md text-slate-600 hover:bg-white">Список</Link>
          <span className="px-3 py-1 text-sm rounded-md bg-white text-slate-900 font-medium shadow-sm">Канбан</span>
        </div>
        <p className="text-xs text-slate-500">всего: {models.length}</p>
      </div>

      <div className="flex gap-3 overflow-x-auto pb-4 -mx-4 px-4">
        {COLUMNS.map((col) => {
          const cards = buckets[col.key];
          return (
            <div key={col.key} className="flex flex-col w-[210px] bg-white rounded-xl border border-slate-200 shrink-0">
              <div className="flex items-center gap-2 px-3 py-3 border-b border-slate-100 sticky top-0 bg-white rounded-t-xl">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: col.dot }} />
                <span className="text-sm font-semibold flex-1">{col.title}</span>
                <span className="text-xs bg-slate-100 text-slate-600 rounded-full px-2 py-0.5">{cards.length}</span>
              </div>
              <div className="flex flex-col gap-2 p-2 min-h-[120px]">
                {cards.length === 0 && (
                  <div className="text-center text-xs text-slate-400 py-8 border-2 border-dashed border-slate-200 rounded-lg">
                    пусто
                  </div>
                )}
                {cards.map(({ model, order, deadline, qty }) => {
                  const photo = model.photoUrls?.[0];
                  const [c1, c2] = pickPalette(model.id);
                  let dlClass = "text-slate-500 bg-slate-100";
                  let dlPrefix = "📅";
                  if (deadline) {
                    const diff = dayDiff(todayIso, deadline.iso);
                    if (diff < 0) { dlClass = "text-red-700 bg-red-50"; dlPrefix = "🔥"; }
                    else if (diff <= 7) { dlClass = "text-amber-700 bg-amber-50"; dlPrefix = "⚠️"; }
                  }
                  return (
                    <Link
                      key={model.id}
                      href={`/models/${model.id}`}
                      className="block bg-white border border-slate-200 rounded-xl overflow-hidden hover:shadow-md hover:-translate-y-0.5 transition-all"
                    >
                      {photo ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={photo} alt="" className="w-full aspect-square object-cover bg-slate-100" />
                      ) : (
                        <div
                          className="w-full aspect-square flex items-center justify-center text-[11px] text-slate-500/60"
                          style={{ background: `linear-gradient(135deg, ${c1}, ${c2})` }}
                        >
                          {model.name}
                        </div>
                      )}
                      <div className="p-2 space-y-1">
                        <div className="text-[13px] font-semibold text-slate-900 line-clamp-1 leading-tight">{model.name}</div>
                        <div className="text-[11px] text-slate-500 truncate">
                          {BRAND_LABELS[model.brand]} · {model.category}
                        </div>
                        <div className="flex flex-wrap items-center gap-1">
                          {(order?.factory?.name || model.preferredFactory?.name) && (
                            <span className="text-[10px] bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded truncate max-w-[120px]">
                              🏭 {order?.factory?.name || model.preferredFactory?.name}
                            </span>
                          )}
                          {qty > 0 && (
                            <span className="text-[10px] bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded">
                              {qty.toLocaleString("ru-RU")} шт
                            </span>
                          )}
                          {deadline && (
                            <span className={`text-[10px] px-1.5 py-0.5 rounded ${dlClass}`}>
                              {dlPrefix} {formatDM(deadline.iso)}
                            </span>
                          )}
                        </div>
                        {order && (
                          <div className="text-[10px] text-blue-600 truncate">#{order.orderNumber}</div>
                        )}
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
