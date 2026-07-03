import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Prisma, PaymentStatus, PaymentType, type Role } from "@prisma/client";
import { formatCurrency, formatDate } from "@/lib/format";
import { PaymentRowActions } from "@/components/payments/payment-row-actions";
import { moscowTodayIso, moscowTodayStart } from "@/lib/dates";
import { PayoutsPanel, type PayoutListItem } from "@/components/payments/payouts-panel";
import { auth } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { toKopecks } from "@/lib/payments/allocate-payout";
import { getOverdueDebt, formatOverdueDebt } from "@/lib/queries/overdue-debt";
import { paymentTargetLabel } from "@/lib/payments/display-name";

type View = "calendar" | "list" | "archive" | "payouts";

const PAYMENT_INCLUDE = {
  order: {
    select: {
      id: true,
      orderNumber: true,
      productModel: { select: { name: true } },
      lines: {
        select: { productVariant: { select: { colorName: true } } },
        orderBy: { createdAt: "asc" as const },
        take: 3,
      },
    },
  },
  factory: { select: { name: true } },
  packagingItem: { select: { name: true } },
  packagingOrder: {
    select: {
      id: true,
      orderNumber: true,
      supplierName: true,
      lines: { select: { packagingItem: { select: { name: true } } } },
    },
  },
} satisfies Prisma.PaymentInclude;

type PaymentWithRelations = Prisma.PaymentGetPayload<{ include: typeof PAYMENT_INCLUDE }>;

export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; month?: string; type?: string; q?: string }>;
}) {
  const sp = await searchParams;
  const view: View =
    sp.view === "list" || sp.view === "archive" || sp.view === "payouts" ? sp.view : "calendar";

  // «Сегодня» по Москве (UTC+3), а не по локальной зоне сервера — иначе на
  // Vercel (UTC) ночью 00:00–03:00 МСК месяц по умолчанию и просрочка съезжали.
  const today = moscowTodayStart();
  const todayStr = moscowTodayIso().slice(0, 7); // YYYY-MM
  const month = sp.month ?? todayStr;
  const typeFilter = sp.type === "ORDER" || sp.type === "PACKAGING" ? (sp.type as PaymentType) : null;
  const q = (sp.q ?? "").trim();

  // Единая правда о долге (П1): все просроченные PENDING без нулевых,
  // НЕ зависит от выбранного месяца — блок не исчезает при листании.
  const overdueDebt = await getOverdueDebt(today);

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between gap-3">
        <h1 className="text-xl font-semibold text-slate-900 md:text-2xl">Платежи</h1>
        <Link
          href="/payments/new"
          className="flex h-11 shrink-0 items-center rounded-lg bg-slate-900 px-4 text-sm font-medium text-white hover:bg-slate-800 active:bg-slate-800"
        >
          + Создать
        </Link>
      </div>

      {/* Вкладки */}
      <div className="no-scrollbar -mx-4 flex items-center gap-1 overflow-x-auto border-b border-slate-200 px-4 md:mx-0 md:flex-wrap md:px-0">
        <Tab href={`/payments?view=calendar`} active={view === "calendar"} label="Календарь" />
        <Tab href={`/payments?view=list`} active={view === "list"} label="Предстоящие" />
        <Tab href={`/payments?view=archive`} active={view === "archive"} label="Архив" />
        <Tab href={`/payments?view=payouts`} active={view === "payouts"} label="Оплаты" />
      </div>

      {/* Фильтры по типу — общие для вкладок платежей (не для «Оплат») */}
      {view !== "payouts" && (
      <div className="no-scrollbar -mx-4 flex items-center gap-1.5 overflow-x-auto px-4 md:mx-0 md:flex-wrap md:px-0">
        <span className="mr-1 shrink-0 text-xs uppercase tracking-wide text-slate-400">Тип:</span>
        <FilterPill href={hrefWith(sp, { view, type: null })} active={!typeFilter} label="Все" />
        <FilterPill href={hrefWith(sp, { view, type: "ORDER" })} active={typeFilter === "ORDER"} label="Фабрики" />
        <FilterPill href={hrefWith(sp, { view, type: "PACKAGING" })} active={typeFilter === "PACKAGING"} label="Упаковка" />
      </div>
      )}

      {/* Закреплённый блок долга — виден на всех вкладках планов, при любом месяце */}
      {view !== "payouts" && overdueDebt.count > 0 && (
        <Link
          href="/payments?view=list"
          className="flex flex-wrap items-baseline gap-x-2 gap-y-1 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm hover:bg-red-100 dark:border-red-400/30 dark:bg-red-400/10 dark:hover:bg-red-400/20"
        >
          <span className="font-semibold text-red-700 dark:text-red-300">
            Просрочено ранее: {formatOverdueDebt(overdueDebt)}
          </span>
          <span className="text-xs text-red-600/80 dark:text-red-300/80">
            все неоплаченные с датой раньше сегодня, за всё время →
          </span>
        </Link>
      )}

      {view === "calendar" && (
        <CalendarView month={month} typeFilter={typeFilter} sp={sp} />
      )}
      {view === "list" && (
        <ListView typeFilter={typeFilter} todayStart={today} />
      )}
      {view === "archive" && (
        <ArchiveView typeFilter={typeFilter} q={q} sp={sp} />
      )}
      {view === "payouts" && <PayoutsView />}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// VIEW: Оплаты — фактические переводы фабрикам с разнесением по плановым платежам
// ──────────────────────────────────────────────────────────────────────────────
async function PayoutsView() {
  const session = await auth();
  const role = (session?.user as { role?: Role } | undefined)?.role;
  const canDelete = role ? can(role, "payment.delete") : false;
  const canCreate = role ? can(role, "payment.markPaid") : false;

  const [payouts, factories] = await Promise.all([
    prisma.factoryPayout.findMany({
      where: { deletedAt: null },
      orderBy: { date: "desc" },
      take: 300,
      include: {
        factory: { select: { name: true } },
        createdBy: { select: { name: true } },
        allocations: {
          include: {
            payment: {
              select: {
                type: true,
                order: { select: { orderNumber: true, productModel: { select: { name: true } } } },
                packagingOrder: { select: { orderNumber: true } },
                packagingItem: { select: { name: true } },
                supplierName: true,
              },
            },
          },
        },
      },
    }),
    prisma.factory.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  const items: PayoutListItem[] = payouts.map((p) => {
    const allocatedKopecks = p.allocations.reduce((a, x) => a + toKopecks(x.amount.toString()), 0);
    const amountKopecks = toKopecks(p.amount.toString());
    const leftoverKopecks = Math.max(0, amountKopecks - allocatedKopecks);
    return {
      id: p.id,
      date: p.date.toISOString(),
      factoryName: p.factory.name,
      amount: p.amount.toString(),
      currencyNote: p.currencyNote,
      comment: p.comment,
      createdByName: p.createdBy.name,
      allocatedTotal: (allocatedKopecks / 100).toFixed(2),
      leftover: (leftoverKopecks / 100).toFixed(2),
      allocations: p.allocations.map((a) => {
        const pm = a.payment;
        const label =
          pm.type === "ORDER"
            ? `${pm.order?.orderNumber ?? "заказ"}${pm.order?.productModel.name ? " · " + pm.order.productModel.name : ""}`
            : `${pm.packagingOrder?.orderNumber ?? pm.supplierName ?? "упаковка"}${pm.packagingItem?.name ? " · " + pm.packagingItem.name : ""}`;
        return { id: a.id, paymentLabel: label, amount: a.amount.toString() };
      }),
    };
  });

  return <PayoutsPanel payouts={items} factories={factories} canDelete={canDelete} canCreate={canCreate} />;
}

// ──────────────────────────────────────────────────────────────────────────────
// VIEW: Календарь — крупная сетка 7×N на месяц, в каждой ячейке суммы и платежи
// ──────────────────────────────────────────────────────────────────────────────
async function CalendarView({
  month,
  typeFilter,
  sp,
}: {
  month: string;
  typeFilter: PaymentType | null;
  sp: { view?: string; type?: string };
}) {
  const [y, m] = month.split("-").map(Number);
  const firstDay = new Date(Date.UTC(y, m - 1, 1));
  const lastDay = new Date(Date.UTC(y, m, 0));
  const daysInMonth = lastDay.getUTCDate();
  // Понедельник = 0, Воскресенье = 6
  const startWeekday = (firstDay.getUTCDay() + 6) % 7;

  const where: Prisma.PaymentWhereInput = {
    plannedDate: { gte: firstDay, lt: new Date(Date.UTC(y, m, 1)) },
    ...(typeFilter ? { type: typeFilter } : {}),
  };
  const payments = await prisma.payment.findMany({
    where,
    orderBy: { plannedDate: "asc" },
    take: 1000,
    include: PAYMENT_INCLUDE,
  });

  // Группировка по дню месяца
  const byDay: Record<number, PaymentWithRelations[]> = {};
  for (const p of payments) {
    const d = new Date(p.plannedDate);
    const day = d.getUTCDate();
    (byDay[day] ??= []).push(p);
  }

  const total = payments.reduce((a, p) => a + Number(p.amount), 0);
  const paid = payments.filter((p) => p.status === "PAID").reduce((a, p) => a + Number(p.amount), 0);
  const pending = total - paid;
  // МСК-полночь (UTC-база) — согласуется с UTC-датами ячеек календаря ниже.
  const todayStart = moscowTodayStart();

  const prevMonth = new Date(Date.UTC(y, m - 2, 1));
  const nextMonth = new Date(Date.UTC(y, m, 1));
  const monthIso = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;

  // 6 строк × 7 столбцов = 42 ячейки (всегда влезает любой месяц)
  const cells: Array<{ day: number | null; date: Date | null }> = [];
  for (let i = 0; i < startWeekday; i++) cells.push({ day: null, date: null });
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ day: d, date: new Date(Date.UTC(y, m - 1, d)) });
  }
  while (cells.length < 42) cells.push({ day: null, date: null });

  const todayDay = todayStart.getUTCMonth() + 1 === m && todayStart.getUTCFullYear() === y
    ? todayStart.getUTCDate() : null;

  return (
    <>
      {/* Сводка месяца. Просрочка здесь НЕ показывается по месяцу —
          единая цифра долга в красном блоке выше (П1: одна правда о долге). */}
      <div className="grid grid-cols-3 gap-3">
        <Summary title="К оплате в этом месяце" value={formatCurrency(pending)} />
        <Summary title="Оплачено" value={formatCurrency(paid)} muted />
        <Summary title="Всего" value={formatCurrency(total)} muted />
      </div>

      {/* Навигация по месяцам — на мобиле у боковых кнопок только стрелка, чтобы влезало */}
      <div className="flex items-center justify-between gap-2">
        <Link
          href={`/payments?view=calendar&month=${monthIso(prevMonth)}${typeFilter ? `&type=${typeFilter}` : ""}`}
          className="flex h-10 items-center rounded-lg border border-slate-300 bg-white px-3 text-sm hover:bg-slate-50 active:bg-slate-100"
        >
          ◀ <span className="hidden sm:inline">&nbsp;{formatMonthLabel(monthIso(prevMonth))}</span>
        </Link>
        <div className="text-base font-semibold text-slate-900 md:text-lg">{formatMonthLabel(month)}</div>
        <Link
          href={`/payments?view=calendar&month=${monthIso(nextMonth)}${typeFilter ? `&type=${typeFilter}` : ""}`}
          className="flex h-10 items-center rounded-lg border border-slate-300 bg-white px-3 text-sm hover:bg-slate-50 active:bg-slate-100"
        >
          <span className="hidden sm:inline">{formatMonthLabel(monthIso(nextMonth))}&nbsp;</span> ▶
        </Link>
      </div>

      {/* Сетка календаря — только на ≥md, на мобиле дни 28×N не помещаются и
          суммы наезжают на номер дня. */}
      <div className="hidden overflow-hidden rounded-2xl border border-slate-200 bg-white md:block">
        <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50 text-center text-xs font-semibold uppercase tracking-wide text-slate-500">
          {["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"].map((d) => (
            <div key={d} className="px-2 py-2">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {cells.map((c, i) => {
            const dayPays = c.day != null ? (byDay[c.day] ?? []) : [];
            const sum = dayPays.reduce((a, p) => a + Number(p.amount), 0);
            const isToday = c.day === todayDay;
            const isPast = c.date && c.date < todayStart;
            return (
              <div
                key={i}
                className={`min-h-28 border-b border-r border-slate-100 p-2 last:border-r-0 ${
                  c.day == null ? "bg-slate-50/50" : ""
                }`}
              >
                {c.day != null && (
                  <>
                    <div className={`mb-1 flex items-baseline justify-between gap-1 ${isPast ? "text-slate-400" : "text-slate-700"}`}>
                      <span className={`inline-flex h-6 min-w-6 items-center justify-center rounded-full text-sm font-semibold ${isToday ? "bg-blue-600 px-2 text-white shadow ring-2 ring-blue-300 dark:ring-blue-400/30" : ""}`}>
                        {c.day}
                      </span>
                      {sum > 0 && (
                        <span className={`text-[11px] font-semibold ${isPast && dayPays.some((p) => p.status === "PENDING") ? "text-red-600 dark:text-red-300" : "text-slate-600"}`}>
                          {formatCurrency(sum)}
                        </span>
                      )}
                    </div>
                    <div className="space-y-1">
                      {dayPays.slice(0, 3).map((p) => (
                        <CalendarChip key={p.id} p={p} isPast={!!isPast} />
                      ))}
                      {dayPays.length > 3 && (
                        <div className="text-[10px] text-slate-500">+{dayPays.length - 3}</div>
                      )}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Мобильный — лента «по дням месяца» из того же байДея. Только дни
          с платежами. Прошедшие, в которых есть PENDING, помечаем как
          просрочку. */}
      <MobileMonthList
        byDay={byDay}
        todayDay={todayDay}
        y={y}
        m={m}
        todayStart={todayStart}
      />
    </>
  );
}

function MobileMonthList({
  byDay,
  todayDay,
  y,
  m,
  todayStart,
}: {
  byDay: Record<number, PaymentWithRelations[]>;
  todayDay: number | null;
  y: number;
  m: number;
  todayStart: Date;
}) {
  const days = Object.keys(byDay)
    .map(Number)
    .sort((a, b) => a - b);
  if (days.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500 md:hidden">
        В этом месяце платежей нет.
      </div>
    );
  }
  return (
    <div className="space-y-3 md:hidden">
      {days.map((day) => {
        const dayPays = byDay[day];
        const date = new Date(Date.UTC(y, m - 1, day));
        const isPast = date < todayStart;
        const dow = (date.getUTCDay() + 6) % 7;
        const sum = dayPays.reduce((a, p) => a + Number(p.amount), 0);
        const hasPendingPast = isPast && dayPays.some((p) => p.status === "PENDING");
        const isToday = day === todayDay;
        return (
          <div
            key={day}
            className={`overflow-hidden rounded-2xl border bg-white ${
              isToday ? "border-blue-300 ring-1 ring-blue-200 dark:border-blue-400/20 dark:ring-blue-400/30" : "border-slate-200"
            }`}
          >
            <div className="flex items-baseline justify-between gap-2 border-b border-slate-100 bg-slate-50 px-3 py-2">
              <div className="flex items-baseline gap-2">
                <span
                  className={`inline-flex h-7 min-w-7 items-center justify-center rounded-full text-sm font-semibold ${
                    isToday ? "bg-blue-600 px-2 text-white" : "text-slate-900"
                  }`}
                >
                  {day}
                </span>
                <span className="text-xs uppercase tracking-wide text-slate-500">
                  {["пн", "вт", "ср", "чт", "пт", "сб", "вс"][dow]}
                </span>
                {isToday && <span className="text-xs font-medium text-blue-600 dark:text-blue-300">сегодня</span>}
              </div>
              <span className={`text-sm font-semibold tabular-nums ${hasPendingPast ? "text-red-600 dark:text-red-300" : "text-slate-700"}`}>
                {formatCurrency(sum)}
              </span>
            </div>
            <div className="divide-y divide-slate-100">
              {dayPays.map((p) => (
                <MobilePaymentRow key={p.id} p={p} isPast={!!isPast} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function MobilePaymentRow({ p, isPast }: { p: PaymentWithRelations; isPast: boolean }) {
  const isPaid = p.status === "PAID";
  const isOverdue = !isPaid && isPast;
  const statusCls = isPaid
    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-300"
    : isOverdue
    ? "bg-red-100 text-red-700 dark:bg-red-400/10 dark:text-red-300"
    : p.type === "ORDER"
    ? "bg-blue-100 text-blue-700 dark:bg-blue-400/10 dark:text-blue-300"
    : "bg-amber-100 text-amber-800 dark:bg-amber-400/10 dark:text-amber-300";
  const statusLabel = isPaid ? "Оплачено" : isOverdue ? "Просрочено" : "К оплате";
  const subject = p.type === "ORDER"
    ? (p.order?.productModel.name ?? p.factory?.name ?? p.label)
    : paymentTargetLabel(p);
  const counterparty = p.type === "ORDER" ? p.factory?.name : (p.supplierName ?? p.packagingOrder?.supplierName);
  return (
    <Link href={paymentTargetHref(p)} className="block px-3 py-2.5 active:bg-slate-50">
      <div className="flex items-baseline justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-slate-900">{subject}</div>
          {counterparty && (
            <div className="truncate text-[11px] text-slate-500">{counterparty}</div>
          )}
          {p.label && (
            <div className="truncate text-[11px] text-slate-400">{p.label}</div>
          )}
        </div>
        <div className="shrink-0 text-right">
          <div className="text-sm font-semibold tabular-nums text-slate-900">
            {formatCurrency(p.amount.toString())}
          </div>
          <span className={`mt-0.5 inline-block rounded px-1.5 py-0.5 text-[10px] ${statusCls}`}>
            {statusLabel}
          </span>
        </div>
      </div>
    </Link>
  );
}

function CalendarChip({ p, isPast }: { p: PaymentWithRelations; isPast: boolean }) {
  const isPaid = p.status === "PAID";
  const isOverdue = !isPaid && isPast;
  const cls = isPaid
    ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-400/10 dark:text-emerald-300 dark:border-emerald-400/20"
    : isOverdue
    ? "bg-red-50 text-red-700 border-red-200 dark:bg-red-400/10 dark:text-red-300 dark:border-red-400/20"
    : p.type === "ORDER"
    ? "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-400/10 dark:text-blue-300 dark:border-blue-400/20"
    : "bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-400/10 dark:text-amber-300 dark:border-amber-400/20";
  // ЗА ЧТО плачу: для заказа — имя фасона, для упаковки — PKG-номер · позиция · поставщик (П2)
  const subject = p.type === "ORDER"
    ? (p.order?.productModel.name ?? p.factory?.name ?? p.label)
    : paymentTargetLabel(p);
  const counterparty = p.type === "ORDER" ? p.factory?.name : (p.supplierName ?? p.packagingOrder?.supplierName);
  return (
    <Link
      href={paymentTargetHref(p)}
      className={`block rounded border px-1.5 py-0.5 text-[11px] leading-tight ${cls} hover:brightness-95`}
      title={`${subject}${counterparty ? " · " + counterparty : ""} · ${p.label} · ${formatCurrency(p.amount.toString())}`}
    >
      <div className="truncate font-semibold">{formatCurrency(p.amount.toString())}</div>
      <div className="truncate text-[10px] opacity-90">{subject}</div>
    </Link>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// VIEW: Список — крупные карточки от ближайшей даты к дальней
// ──────────────────────────────────────────────────────────────────────────────
async function ListView({
  typeFilter,
  todayStart,
}: {
  typeFilter: PaymentType | null;
  todayStart: Date;
}) {
  const where: Prisma.PaymentWhereInput = {
    status: "PENDING",
    ...(typeFilter ? { type: typeFilter } : {}),
  };
  const payments = await prisma.payment.findMany({
    where,
    orderBy: { plannedDate: "asc" },
    take: 500,
    include: PAYMENT_INCLUDE,
  });

  const total = payments.reduce((a, p) => a + Number(p.amount), 0);
  const overdue = payments.filter((p) => p.plannedDate < todayStart).reduce((a, p) => a + Number(p.amount), 0);

  return (
    <>
      <div className="sticky top-0 z-20 -mx-2 grid grid-cols-2 gap-3 bg-white/90 px-2 py-2 backdrop-blur sm:-mx-0 sm:px-0 md:grid-cols-3">
        <Summary title="Всего предстоит" value={formatCurrency(total)} />
        <Summary title="Просрочено" value={formatCurrency(overdue)} danger={overdue > 0} />
        <Summary title="Платежей" value={String(payments.length)} muted />
      </div>

      {payments.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center text-sm text-slate-500">
          Предстоящих платежей нет.
        </div>
      ) : (
        <div className="space-y-2">
          {payments.map((p) => (
            <BigCard key={p.id} p={p} todayStart={todayStart} />
          ))}
        </div>
      )}
    </>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// VIEW: Архив — оплаченные, поиск
// ──────────────────────────────────────────────────────────────────────────────
async function ArchiveView({
  typeFilter,
  q,
  sp,
}: {
  typeFilter: PaymentType | null;
  q: string;
  sp: { view?: string; type?: string };
}) {
  const where: Prisma.PaymentWhereInput = {
    status: "PAID",
    ...(typeFilter ? { type: typeFilter } : {}),
    ...(q
      ? {
          OR: [
            { label: { contains: q, mode: "insensitive" } },
            { supplierName: { contains: q, mode: "insensitive" } },
            { factory: { name: { contains: q, mode: "insensitive" } } },
            { order: { orderNumber: { contains: q, mode: "insensitive" } } },
            { packagingItem: { name: { contains: q, mode: "insensitive" } } },
          ],
        }
      : {}),
  };
  const payments = await prisma.payment.findMany({
    where,
    orderBy: { paidAt: "desc" },
    take: 500,
    include: PAYMENT_INCLUDE,
  });

  const totalPaid = payments.reduce((a, p) => a + Number(p.amount), 0);
  const todayStart = moscowTodayStart();

  return (
    <>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <Summary title="Оплачено всего" value={formatCurrency(totalPaid)} muted />
        <Summary title="Платежей" value={String(payments.length)} muted />
        <form method="get" className="md:col-span-1">
          <input type="hidden" name="view" value="archive" />
          {sp.type && <input type="hidden" name="type" value={sp.type} />}
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="Поиск: контрагент, заказ, упаковка…"
            className="h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"
          />
        </form>
      </div>

      {payments.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center text-sm text-slate-500">
          {q ? "Ничего не найдено." : "Архив пуст."}
        </div>
      ) : (
        <div className="space-y-2">
          {payments.map((p) => (
            <BigCard key={p.id} p={p} todayStart={todayStart} archived />
          ))}
        </div>
      )}
    </>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Большая карточка платежа (используется в Списке и Архиве)
// ──────────────────────────────────────────────────────────────────────────────
function BigCard({
  p,
  todayStart,
  archived,
}: {
  p: PaymentWithRelations;
  todayStart: Date;
  archived?: boolean;
}) {
  const isPaid = p.status === "PAID";
  const isOverdue = !isPaid && p.plannedDate < todayStart;
  const counterparty = p.type === "ORDER" ? p.factory?.name : p.supplierName;
  return (
    <div
      className={`flex flex-wrap items-center gap-3 rounded-2xl border bg-white p-4 ${
        isOverdue ? "border-red-300 bg-red-50/40 dark:border-red-400/20 dark:bg-red-400/10" : isPaid ? "border-emerald-200 dark:border-emerald-400/20" : "border-slate-200"
      }`}
    >
      {/* Дата */}
      <div className="min-w-[88px] text-left">
        <div className={`text-3xl font-bold leading-none ${isOverdue ? "text-red-700 dark:text-red-300" : "text-slate-900"}`}>
          {String(p.plannedDate.getDate()).padStart(2, "0")}
        </div>
        <div className={`text-xs uppercase ${isOverdue ? "text-red-600 dark:text-red-300" : "text-slate-500"}`}>
          {monthShort(p.plannedDate)} {p.plannedDate.getFullYear()}
        </div>
        {isOverdue && <div className="text-[10px] font-semibold text-red-600 dark:text-red-300">просрочен</div>}
        {archived && p.paidAt && (
          <div className="mt-1 text-[10px] text-emerald-700 dark:text-emerald-300">опл. {formatDate(p.paidAt)}</div>
        )}
      </div>

      {/* Сумма */}
      <div className="min-w-[140px] text-left">
        <div className="text-2xl font-bold text-slate-900">{formatCurrency(p.amount.toString())}</div>
        <div className="text-xs text-slate-500">{p.label}</div>
      </div>

      {/* За что плачу */}
      <div className="flex-1 min-w-[200px]">
        {/* 1-я строка: имя товара/упаковки — крупно. Это «ЗА ЧТО» */}
        {p.type === "ORDER" && p.order ? (
          <Link href={`/orders/${p.order.id}`} className="block text-base font-semibold text-slate-900 hover:underline">
            {p.order.productModel.name}
            {p.order.lines.length > 0 && (
              <span className="ml-1 text-sm font-normal text-slate-500">
                · {p.order.lines.map((l) => l.productVariant.colorName).join(", ")}
              </span>
            )}
          </Link>
        ) : p.type === "PACKAGING" ? (
          <Link
            href={p.packagingOrder ? `/packaging-orders/${p.packagingOrder.id}` : `/payments/${p.id}/edit`}
            className="block text-base font-semibold text-slate-900 hover:underline"
          >
            {/* П2: даже без привязки к позиции платёж подписан — PKG-номер · позиции · поставщик */}
            {p.packagingItem?.name ??
              (p.packagingOrder?.lines?.map((l) => l.packagingItem.name).join(", ") || paymentTargetLabel(p))}
          </Link>
        ) : (
          <div className="text-base font-semibold text-slate-700">{counterparty ?? "—"}</div>
        )}
        {/* 2-я строка: контрагент + номер заказа + тип-плашка */}
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500">
          <span
            className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
              p.type === "ORDER" ? "bg-blue-50 text-blue-700 dark:bg-blue-400/10 dark:text-blue-300" : "bg-amber-50 text-amber-700 dark:bg-amber-400/10 dark:text-amber-300"
            }`}
          >
            {p.type === "ORDER" ? "Фабрика" : "Упаковка"}
          </span>
          {counterparty && <span>{counterparty}</span>}
          {p.type === "ORDER" && p.order && (
            <span className="font-mono text-[10px]">{p.order.orderNumber}</span>
          )}
          {p.type === "PACKAGING" && p.packagingOrder && (
            <span className="font-mono text-[10px]">{p.packagingOrder.orderNumber}</span>
          )}
        </div>
      </div>

      {/* Действия */}
      <div className="ml-auto">
        <PaymentRowActions id={p.id} status={p.status} />
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Хэлперы
// ──────────────────────────────────────────────────────────────────────────────
function Tab({ href, active, label }: { href: string; active: boolean; label: string }) {
  return (
    <Link
      href={href}
      className={`-mb-px inline-flex min-h-[44px] shrink-0 items-center border-b-2 px-4 text-sm font-medium ${
        active
          ? "border-slate-900 text-slate-900"
          : "border-transparent text-slate-500 hover:text-slate-700"
      }`}
    >
      {label}
    </Link>
  );
}

function FilterPill({ href, active, label }: { href: string; active: boolean; label: string }) {
  return (
    <Link
      href={href}
      className={`inline-flex min-h-[36px] shrink-0 items-center rounded-full px-3 text-xs font-medium ${
        active ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
      }`}
    >
      {label}
    </Link>
  );
}

function Summary({
  title,
  value,
  danger,
  muted,
}: {
  title: string;
  value: string;
  danger?: boolean;
  muted?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border p-4 ${
        danger ? "border-red-200 bg-red-50 dark:border-red-400/20 dark:bg-red-400/10" : muted ? "border-slate-200 bg-slate-50" : "border-slate-200 bg-white"
      }`}
    >
      <div className="text-xs text-slate-500">{title}</div>
      <div className={`mt-1 text-xl font-semibold ${danger ? "text-red-700 dark:text-red-300" : "text-slate-900"}`}>{value}</div>
    </div>
  );
}

function hrefWith(
  sp: { view?: string; type?: string; month?: string; q?: string },
  patch: { view?: string; type?: string | null; month?: string },
): string {
  const merged: Record<string, string> = {};
  if (sp.view) merged.view = sp.view;
  if (sp.month) merged.month = sp.month;
  if (sp.type) merged.type = sp.type;
  if (sp.q) merged.q = sp.q;
  for (const [k, v] of Object.entries(patch)) {
    if (v === null) delete merged[k];
    else if (v !== undefined) merged[k] = v;
  }
  const qs = Object.entries(merged).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&");
  return `/payments${qs ? `?${qs}` : ""}`;
}

function paymentTargetHref(p: PaymentWithRelations): string {
  if (p.type === "ORDER" && p.order) return `/orders/${p.order.id}`;
  if (p.type === "PACKAGING" && p.packagingOrder) return `/packaging-orders/${p.packagingOrder.id}`;
  return `/payments/${p.id}/edit`;
}

const MONTH_NAMES = ["январь", "февраль", "март", "апрель", "май", "июнь", "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь"];
const MONTH_SHORT = ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];

function formatMonthLabel(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  if (!y || !m) return ym;
  return `${MONTH_NAMES[m - 1]} ${y}`;
}

function monthShort(d: Date): string {
  return MONTH_SHORT[d.getMonth()];
}
