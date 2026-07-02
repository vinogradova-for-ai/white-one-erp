import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatNumber } from "@/lib/format";
import { ORDER_STATUS_LABELS, ORDER_STATUS_COLORS } from "@/lib/constants";
import { ColorChip } from "@/components/common/color-chip";
import { IncomingExportButton } from "../export-button";
import { moscowTodayStart } from "@/lib/dates";

// Календарный вид Поставок. Заказы группируются по arrivalPlannedDate
// (дате плановой даты прибытия). Если факт-дата стоит — карточка переезжает
// на факт-дату, и помечается зелёным как «приехала».
// Навигация ◀/▶ переключает месяц через ?month=YYYY-MM.

function parseMonthParam(monthStr: string | undefined): Date {
  if (monthStr && /^\d{4}-\d{2}$/.test(monthStr)) {
    const [y, m] = monthStr.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, 1));
  }
  const t = moscowTodayStart();
  return new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), 1));
}

function fmtMonth(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

const MONTH_RU = ["Январь","Февраль","Март","Апрель","Май","Июнь","Июль","Август","Сентябрь","Октябрь","Ноябрь","Декабрь"];
const DAY_RU = ["Пн","Вт","Ср","Чт","Пт","Сб","Вс"];

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export default async function IncomingCalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const sp = await searchParams;
  const monthStart = parseMonthParam(sp.month);
  const y = monthStart.getUTCFullYear();
  const m = monthStart.getUTCMonth();
  const monthEnd = new Date(Date.UTC(y, m + 1, 1));
  const today = moscowTodayStart();

  // Календарная сетка: начинаем с понедельника недели, в которой 1-е число,
  // и заканчиваем воскресеньем недели, в которой последнее число месяца.
  const firstDay = new Date(Date.UTC(y, m, 1));
  const firstDayWeekday = (firstDay.getUTCDay() + 6) % 7; // 0=Пн ... 6=Вс
  const gridStart = new Date(firstDay);
  gridStart.setUTCDate(firstDay.getUTCDate() - firstDayWeekday);

  const lastDay = new Date(Date.UTC(y, m + 1, 0));
  const lastDayWeekday = (lastDay.getUTCDay() + 6) % 7;
  const gridEnd = new Date(lastDay);
  gridEnd.setUTCDate(lastDay.getUTCDate() + (6 - lastDayWeekday));

  // Прогрев на 2 недели в каждую сторону — чтобы карточки заказов из
  // соседних месяцев тоже показывались в clipping cells.
  const queryStart = new Date(gridStart);
  queryStart.setUTCDate(queryStart.getUTCDate() - 14);
  const queryEnd = new Date(gridEnd);
  queryEnd.setUTCDate(queryEnd.getUTCDate() + 14);

  const orders = await prisma.order.findMany({
    where: {
      deletedAt: null,
      status: { in: ["READY_SHIP", "IN_TRANSIT", "WAREHOUSE_MSK"] },
      OR: [
        { arrivalPlannedDate: { gte: queryStart, lte: queryEnd } },
        { arrivalActualDate: { gte: queryStart, lte: queryEnd } },
      ],
    },
    include: {
      productModel: { select: { name: true, photoUrls: true } },
      lines: {
        select: {
          quantity: true,
          quantityActual: true,
          productVariant: { select: { colorName: true, photoUrls: true } },
        },
        orderBy: { createdAt: "asc" },
      },
      factory: { select: { name: true, country: true } },
    },
    orderBy: { arrivalPlannedDate: "asc" },
  });

  // Сгруппируем по дате (берём actual если есть, иначе planned)
  type CalCard = {
    id: string;
    orderNumber: string;
    name: string;
    qty: number;
    qtyIsFact: boolean;     // показываемое qty — это факт (true) или план (false)
    colors: string[];
    photo: string | null;
    status: typeof orders[number]["status"];
    arrived: boolean;       // фактически прибыл (есть arrivalActualDate)
    factoryName: string | null;
  };
  const byDay: Record<string, CalCard[]> = {};
  for (const o of orders) {
    const dateToUse = o.arrivalActualDate ?? o.arrivalPlannedDate;
    if (!dateToUse) continue;
    const k = dayKey(dateToUse);
    if (!byDay[k]) byDay[k] = [];
    // В Поставки уходит ФАКТ если он проставлен (фабрика накроила больше/
    // меньше плана). Иначе план.
    const hasAnyFact = o.lines.some((l) => l.quantityActual !== null);
    const totalQty = o.lines.reduce((a, l) => a + (l.quantityActual ?? l.quantity), 0);
    const colors = [...new Set(o.lines.map((l) => l.productVariant.colorName))];
    byDay[k].push({
      id: o.id,
      orderNumber: o.orderNumber,
      name: o.productModel.name,
      qty: totalQty,
      qtyIsFact: hasAnyFact,
      colors,
      photo: o.lines[0]?.productVariant?.photoUrls?.[0] ?? o.productModel.photoUrls?.[0] ?? null,
      status: o.status,
      arrived: !!o.arrivalActualDate,
      factoryName: o.factory?.name ?? null,
    });
  }

  // Соберём дни сетки
  type GridDay = { date: Date; key: string; inMonth: boolean; isToday: boolean; isWeekend: boolean };
  const days: GridDay[] = [];
  const cur = new Date(gridStart);
  while (cur <= gridEnd) {
    const k = dayKey(cur);
    const dow = (cur.getUTCDay() + 6) % 7;
    days.push({
      date: new Date(cur),
      key: k,
      inMonth: cur.getUTCMonth() === m,
      isToday: k === dayKey(today),
      isWeekend: dow >= 5,
    });
    cur.setUTCDate(cur.getUTCDate() + 1);
  }

  // Навигация по месяцам
  const prevMonth = new Date(Date.UTC(y, m - 1, 1));
  const nextMonth = new Date(Date.UTC(y, m + 1, 1));
  const isCurrentMonth = today.getUTCMonth() === m && today.getUTCFullYear() === y;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Заказы в пути</h1>
          <p className="text-sm text-slate-500">В пути и к отгрузке: {orders.length}</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <IncomingExportButton />
          <div className="flex gap-1 bg-slate-100 rounded-lg p-0.5">
            <Link href="/incoming" className="px-3 py-1 text-sm rounded-md text-slate-600 hover:bg-white">Таблица</Link>
            <span className="px-3 py-1 text-sm rounded-md bg-white text-slate-900 font-medium shadow-sm">Календарь</span>
          </div>
        </div>
      </div>

      {/* Навигация по месяцам */}
      <div className="flex items-center gap-2">
        <Link
          href={`/incoming/calendar?month=${fmtMonth(prevMonth)}`}
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-50"
        >
          ◀
        </Link>
        <div className="text-lg font-semibold text-slate-900">
          {MONTH_RU[m]} {y}
        </div>
        <Link
          href={`/incoming/calendar?month=${fmtMonth(nextMonth)}`}
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-50"
        >
          ▶
        </Link>
        {!isCurrentMonth && (
          <Link
            href="/incoming/calendar"
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
          >
            Сегодня
          </Link>
        )}
        <div className="ml-auto flex items-center gap-3 text-xs text-slate-500">
          <span className="inline-flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-full bg-amber-400" /> в пути</span>
          <span className="inline-flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-full bg-emerald-500" /> приехало</span>
        </div>
      </div>

      {/* Сетка календаря */}
      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        {/* Шапка дней недели */}
        <div className="grid grid-cols-7 bg-slate-50 border-b border-slate-200">
          {DAY_RU.map((d, i) => (
            <div
              key={d}
              className={`px-2 py-2 text-[11px] font-semibold uppercase text-center ${
                i >= 5 ? "text-rose-600 dark:text-rose-300" : "text-slate-600"
              }`}
            >
              {d}
            </div>
          ))}
        </div>

        {/* Дни */}
        <div className="grid grid-cols-7 auto-rows-fr">
          {days.map((day) => {
            const cards = byDay[day.key] ?? [];
            return (
              <div
                key={day.key}
                className={`min-h-[110px] p-1.5 border-r border-b border-slate-100 flex flex-col gap-1 ${
                  !day.inMonth ? "bg-slate-50/50" : "bg-white"
                } ${day.isToday ? "ring-2 ring-inset ring-blue-400 dark:ring-blue-400/30" : ""}`}
              >
                <div
                  className={`text-[11px] font-semibold leading-tight ${
                    !day.inMonth ? "text-slate-400" :
                    day.isToday ? "text-blue-600 dark:text-blue-300" :
                    day.isWeekend ? "text-rose-500 dark:text-rose-400" :
                    "text-slate-700"
                  }`}
                >
                  {day.date.getUTCDate()}
                </div>
                <div className="flex flex-col gap-1 overflow-hidden">
                  {cards.slice(0, 4).map((c) => (
                    <Link
                      key={c.id}
                      href={`/orders/${c.id}`}
                      className={`block rounded px-1.5 py-1 text-[10px] hover:shadow-sm transition ${
                        c.arrived
                          ? "bg-emerald-50 border border-emerald-200 dark:bg-emerald-400/10 dark:border-emerald-400/20"
                          : "bg-amber-50 border border-amber-200 dark:bg-amber-400/10 dark:border-amber-400/20"
                      }`}
                      title={`${c.name} · ${c.orderNumber} · ${formatNumber(c.qty)} шт${c.factoryName ? ` · ${c.factoryName}` : ""}`}
                    >
                      <div className="flex items-center gap-1">
                        {c.photo && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={c.photo} alt="" className="w-5 h-5 rounded object-cover shrink-0" />
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="font-semibold text-slate-900 truncate leading-tight">{c.name}</div>
                          <div className="flex items-center gap-1 leading-tight">
                            <span className="font-mono text-slate-500 text-[9px]">{c.orderNumber.replace("ORD-", "")}</span>
                            <span className="text-slate-400">·</span>
                            <span className={c.qtyIsFact ? "text-emerald-700 font-semibold dark:text-emerald-300" : "text-slate-700"}>
                              {formatNumber(c.qty)}{c.qtyIsFact ? " ф" : ""}
                            </span>
                          </div>
                        </div>
                      </div>
                      {c.colors.length > 0 && (
                        <div className="flex flex-wrap gap-0.5 mt-0.5">
                          {c.colors.slice(0, 4).map((cn, i) => (
                            <ColorChip key={i} name={cn} size={8} textClassName="hidden" />
                          ))}
                          {c.colors.length > 4 && <span className="text-[9px] text-slate-400">+{c.colors.length - 4}</span>}
                        </div>
                      )}
                    </Link>
                  ))}
                  {cards.length > 4 && (
                    <div className="text-[10px] text-slate-500 px-1">+{cards.length - 4} ещё</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {orders.length === 0 && (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-12 text-center text-sm text-slate-500">
          Поставок в этом окне нет. Прокрути на ◀ или ▶ месяц.
        </div>
      )}
    </div>
  );
}
