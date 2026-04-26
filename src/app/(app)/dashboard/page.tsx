import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { formatCurrency, formatNumber } from "@/lib/format";
import {
  ORDER_STATUS_LABELS,
  PRODUCT_MODEL_STATUS_LABELS,
} from "@/lib/constants";

const DAY_MS = 24 * 60 * 60 * 1000;

export default async function DashboardPage() {
  const session = await auth();
  const userName = session?.user?.name ?? "";
  const now = new Date();
  const in14DaysAgo = new Date(now.getTime() - 14 * DAY_MS);
  const currentYearMonth = now.getUTCFullYear() * 100 + (now.getUTCMonth() + 1);

  // ===== Что горит =====
  const [
    delayedOrders,
    stuckModels,
    ordersOverdueArrival,
  ] = await Promise.all([
    prisma.order.findMany({
      where: {
        deletedAt: null,
        isDelayed: true,
        status: { notIn: ["ON_SALE", "SHIPPED_WB"] },
      },
      select: {
        id: true,
        orderNumber: true,
        status: true,
        arrivalPlannedDate: true,
        productModel: { select: { name: true } },
        lines: {
          select: { productVariant: { select: { colorName: true } } },
          orderBy: { createdAt: "asc" },
        },
      },
      orderBy: { arrivalPlannedDate: "asc" },
      take: 6,
    }),
    prisma.productModel.findMany({
      where: {
        deletedAt: null,
        status: { in: ["PATTERNS", "SAMPLE"] },
        updatedAt: { lt: in14DaysAgo },
      },
      select: { id: true, name: true, status: true, updatedAt: true },
      orderBy: { updatedAt: "asc" },
      take: 6,
    }),
    prisma.order.findMany({
      where: {
        deletedAt: null,
        isDelayed: false,
        arrivalPlannedDate: { lt: now },
        status: { in: ["SEWING", "QC", "READY_SHIP", "IN_TRANSIT"] },
      },
      select: {
        id: true,
        orderNumber: true,
        status: true,
        arrivalPlannedDate: true,
        productModel: { select: { name: true } },
        lines: {
          select: { productVariant: { select: { colorName: true } } },
          orderBy: { createdAt: "asc" },
        },
      },
      take: 6,
    }),
  ]);

  // ===== Упаковка в разработке (застряла дольше 14 дней) =====
  const stuckPackagingDev = await prisma.packagingItem.findMany({
    where: {
      status: { in: ["DESIGN", "SAMPLE"] },
      updatedAt: { lt: in14DaysAgo },
    },
    select: { id: true, name: true, status: true, updatedAt: true, type: true },
    orderBy: { updatedAt: "asc" },
    take: 6,
  });

  // ===== Дефицит упаковки =====
  const packagingItems = await prisma.packagingItem.findMany({
    where: { isActive: true },
    include: {
      orderUsages: {
        where: {
          order: {
            deletedAt: null,
            status: { notIn: ["ON_SALE", "SHIPPED_WB"] },
          },
        },
        select: {
          quantityPerUnit: true,
          order: { select: { id: true, orderNumber: true, lines: { select: { quantity: true } } } },
        },
      },
      packagingOrderLines: {
        where: { packagingOrder: { status: { notIn: ["ARRIVED", "CANCELLED"] } } },
        select: { quantity: true },
      },
    },
  });

  const packagingShortages = packagingItems
    .map((i) => {
      const required = Math.ceil(
        i.orderUsages.reduce((s, u) => {
          const orderQty = u.order.lines.reduce((a, l) => a + l.quantity, 0);
          return s + orderQty * Number(u.quantityPerUnit);
        }, 0),
      );
      const inProductionQty = i.packagingOrderLines.reduce((a, l) => a + l.quantity, 0);
      const available = i.stock + inProductionQty;
      return {
        id: i.id,
        name: i.name,
        stock: i.stock,
        inProductionQty,
        required,
        shortage: Math.max(0, required - available),
        orderCount: i.orderUsages.length,
      };
    })
    .filter((p) => p.shortage > 0)
    .sort((a, b) => b.shortage - a.shortage)
    .slice(0, 5);

  // ===== План vs Факт за текущий месяц =====
  const [plansThisMonth, ordersThisMonth] = await Promise.all([
    prisma.monthlyPlan.findMany({ where: { yearMonth: currentYearMonth } }),
    prisma.order.findMany({
      where: { deletedAt: null, launchMonth: currentYearMonth },
      select: {
        productModel: { select: { category: true } },
        lines: { select: { plannedRevenue: true } },
      },
    }),
  ]);

  const planByCat = new Map(plansThisMonth.map((p) => [p.category, Number(p.plannedRevenue)]));
  const factByCat = new Map<string, number>();
  for (const o of ordersThisMonth) {
    const cat = o.productModel.category;
    const orderRevenue = o.lines.reduce((a, l) => a + Number(l.plannedRevenue ?? 0), 0);
    factByCat.set(cat, (factByCat.get(cat) ?? 0) + orderRevenue);
  }
  const categories = Array.from(new Set([...planByCat.keys(), ...factByCat.keys()])).sort();
  const planVsFact = categories.map((cat) => {
    const plan = planByCat.get(cat) ?? 0;
    const fact = factByCat.get(cat) ?? 0;
    return { cat, plan, fact, gap: plan - fact };
  });
  const totalGap = planVsFact.reduce((s, r) => s + Math.max(0, r.gap), 0);

  // ===== Платежи текущего месяца =====
  const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const startOfNextMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);

  const [paymentsThisMonth, overduePayments] = await Promise.all([
    prisma.payment.findMany({
      where: { plannedDate: { gte: startOfMonth, lt: startOfNextMonth } },
      select: { amount: true, status: true },
    }),
    prisma.payment.findMany({
      where: { status: "PENDING", plannedDate: { lt: startOfToday } },
      orderBy: { plannedDate: "asc" },
      take: 6,
      select: {
        id: true,
        plannedDate: true,
        amount: true,
        label: true,
        type: true,
        factory: { select: { name: true } },
        supplierName: true,
        order: { select: { id: true, orderNumber: true } },
      },
    }),
  ]);
  const paymentsPending = paymentsThisMonth
    .filter((p) => p.status === "PENDING")
    .reduce((a, p) => a + Number(p.amount), 0);
  const paymentsPaid = paymentsThisMonth
    .filter((p) => p.status === "PAID")
    .reduce((a, p) => a + Number(p.amount), 0);
  const paymentsOverdueTotal = overduePayments.reduce((a, p) => a + Number(p.amount), 0);

  // ===== Общая сводка (компактная) =====
  const [modelsInProd, variantsReady] = await Promise.all([
    prisma.productModel.count({ where: { deletedAt: null, status: "IN_PRODUCTION" } }),
    prisma.productVariant.count({ where: { deletedAt: null, status: "READY_TO_ORDER" } }),
  ]);

  const hotCount =
    delayedOrders.length +
    ordersOverdueArrival.length +
    stuckModels.length +
    stuckPackagingDev.length +
    packagingShortages.length +
    overduePayments.length +
    (totalGap > 0 ? 1 : 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Добрый день, {userName}</h1>
        {hotCount > 0 ? (
          <p className="text-sm text-amber-700">
            Сегодня требуют внимания: <b>{hotCount}</b>{" "}
            {hotCount === 1 ? "пункт" : hotCount < 5 ? "пункта" : "пунктов"}
          </p>
        ) : (
          <p className="text-sm text-emerald-700">Всё под контролем. Горящих задач нет.</p>
        )}
      </div>

      {/* ===== Сводка по платежам месяца ===== */}
      <Link
        href="/payments"
        className="block rounded-2xl border border-slate-200 bg-white p-4 hover:border-slate-300 hover:shadow-sm"
      >
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Платежи этого месяца</h2>
          <span className="text-xs text-slate-400">открыть →</span>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-3">
          <div>
            <div className="text-xs text-slate-500">К оплате</div>
            <div className="mt-0.5 text-xl font-semibold text-slate-900">{formatCurrency(paymentsPending)}</div>
          </div>
          <div>
            <div className="text-xs text-slate-500">Оплачено</div>
            <div className="mt-0.5 text-xl font-semibold text-slate-600">{formatCurrency(paymentsPaid)}</div>
          </div>
          {paymentsOverdueTotal > 0 && (
            <div>
              <div className="text-xs text-red-600">Просрочено (все периоды)</div>
              <div className="mt-0.5 text-xl font-semibold text-red-700">{formatCurrency(paymentsOverdueTotal)}</div>
            </div>
          )}
        </div>
      </Link>

      {/* ===== Блок «Что горит» ===== */}
      {hotCount > 0 && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-slate-900">Что горит сейчас</h2>

          {delayedOrders.length > 0 && (
            <HotSection
              title="Заказы с задержкой"
              subtitle="Помечены флагом «задержка»"
              variant="danger"
              items={delayedOrders.map((o) => ({
                id: o.id,
                href: `/orders/${o.id}`,
                title: `${o.orderNumber} · ${o.productModel.name}${o.lines.length > 0 ? " · " + o.lines.map((l) => l.productVariant.colorName).join(", ") : ""}`,
                right: ORDER_STATUS_LABELS[o.status],
                subtitle: o.arrivalPlannedDate
                  ? `Планировали прибытие: ${formatDay(o.arrivalPlannedDate)}`
                  : null,
              }))}
            />
          )}

          {ordersOverdueArrival.length > 0 && (
            <HotSection
              title="Заказы опаздывают по плановому прибытию"
              subtitle="Флаг задержки ещё не стоит — нужно разобраться"
              variant="warn"
              items={ordersOverdueArrival.map((o) => ({
                id: o.id,
                href: `/orders/${o.id}`,
                title: `${o.orderNumber} · ${o.productModel.name}${o.lines.length > 0 ? " · " + o.lines.map((l) => l.productVariant.colorName).join(", ") : ""}`,
                right: ORDER_STATUS_LABELS[o.status],
                subtitle: `Плановое прибытие: ${formatDay(o.arrivalPlannedDate)} — уже прошло`,
              }))}
            />
          )}

          {stuckModels.length > 0 && (
            <HotSection
              title="Фасоны застряли в разработке"
              subtitle="Не обновлялись больше 14 дней"
              variant="warn"
              items={stuckModels.map((m) => ({
                id: m.id,
                href: `/models/${m.id}`,
                title: m.name,
                right: PRODUCT_MODEL_STATUS_LABELS[m.status],
                subtitle: `Обновление: ${formatDay(m.updatedAt)}`,
              }))}
            />
          )}

          {stuckPackagingDev.length > 0 && (
            <HotSection
              title="Упаковка застряла в разработке"
              subtitle="Макет или образец не двигаются больше 14 дней"
              variant="warn"
              items={stuckPackagingDev.map((p) => ({
                id: p.id,
                href: `/packaging/${p.id}`,
                title: p.name,
                right: p.status === "DESIGN" ? "Разработка макета" : "Образец",
                subtitle: `Обновление: ${formatDay(p.updatedAt)}`,
              }))}
            />
          )}

          {packagingShortages.length > 0 && (
            <HotSection
              title="Упаковка — дефицит"
              subtitle="Нужно срочно запускать в производство"
              variant="danger"
              items={packagingShortages.map((p) => ({
                id: p.id,
                href: `/packaging/${p.id}`,
                title: p.name,
                right: `-${formatNumber(p.shortage)} шт`,
                subtitle: `Склад: ${formatNumber(p.stock)} · В производстве: ${formatNumber(p.inProductionQty)} · Потребность: ${formatNumber(p.required)}`,
              }))}
            />
          )}

          {overduePayments.length > 0 && (
            <HotSection
              title="Просроченные платежи"
              subtitle="Дата наступила, а платёж не отмечен оплаченным"
              variant="danger"
              items={overduePayments.map((p) => ({
                id: p.id,
                href: `/payments`,
                title: p.type === "ORDER"
                  ? `${p.factory?.name ?? "Без фабрики"} · ${p.order?.orderNumber ?? ""}`
                  : `${p.supplierName ?? "Упаковка"}`,
                right: formatCurrency(p.amount.toString()),
                subtitle: `${p.label} · план: ${formatDay(p.plannedDate)}`,
              }))}
            />
          )}

          {totalGap > 0 && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
              <div className="text-sm font-semibold text-amber-900">
                Разрыв плана этого месяца: {formatCurrency(totalGap.toString())}
              </div>
              <div className="mt-2 space-y-1 text-xs text-amber-900">
                {planVsFact
                  .filter((r) => r.gap > 0)
                  .map((r) => (
                    <div key={r.cat} className="flex justify-between gap-3">
                      <span>{r.cat}</span>
                      <span>
                        факт {formatCurrency(r.fact.toString())} из {formatCurrency(r.plan.toString())}
                        <span className="ml-2 font-semibold">
                          (−{formatCurrency(r.gap.toString())})
                        </span>
                      </span>
                    </div>
                  ))}
              </div>
              <Link
                href="/plan-vs-fact"
                className="mt-3 inline-block text-sm font-medium text-amber-900 underline"
              >
                Открыть План/Факт →
              </Link>
            </div>
          )}
        </div>
      )}

      {/* ===== Общая сводка (компактно) ===== */}
      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Сводка</h2>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <MiniKpi label="В производстве" value={formatNumber(modelsInProd)} href="/models?status=IN_PRODUCTION" />
          <MiniKpi label="Готовы к заказу" value={formatNumber(variantsReady)} href="/variants" />
        </div>
      </div>

      {/* ===== Быстрые действия ===== */}
      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Быстрые действия
        </h2>
        <div className="grid gap-2 md:grid-cols-3">
          <QuickLink href="/models/new" label="+ Создать фасон" />
          <QuickLink href="/orders/new" label="+ Создать заказ" />
          <QuickLink href="/my-tasks" label="→ Мои задачи" />
        </div>
      </div>
    </div>
  );
}

function HotSection({
  title,
  subtitle,
  items,
  variant,
}: {
  title: string;
  subtitle?: string;
  variant: "danger" | "warn";
  items: Array<{ id: string; href: string; title: string; right: string; subtitle: string | null }>;
}) {
  const colors =
    variant === "danger"
      ? "border-red-200 bg-red-50"
      : "border-amber-200 bg-amber-50";
  const badge = variant === "danger" ? "bg-red-600 text-white" : "bg-amber-600 text-white";
  return (
    <div className={`rounded-2xl border p-4 ${colors}`}>
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold text-slate-900">{title}</div>
          {subtitle && <div className="text-xs text-slate-600">{subtitle}</div>}
        </div>
        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${badge}`}>
          {items.length}
        </span>
      </div>
      <ul className="mt-3 space-y-1">
        {items.map((it) => (
          <li key={it.id}>
            <Link
              href={it.href}
              className="flex items-start justify-between gap-3 rounded-lg bg-white/70 px-3 py-2 text-sm hover:bg-white"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-slate-900">{it.title}</div>
                {it.subtitle && <div className="text-xs text-slate-500">{it.subtitle}</div>}
              </div>
              <div className="whitespace-nowrap text-xs text-slate-700">{it.right}</div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function MiniKpi({ label, value, href }: { label: string; value: string; href: string }) {
  return (
    <Link
      href={href}
      className="rounded-xl border border-slate-200 bg-white p-3 transition hover:shadow-sm"
    >
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1 text-xl font-semibold text-slate-900">{value}</div>
    </Link>
  );
}

function QuickLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="block rounded-lg border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-700 transition hover:bg-slate-100"
    >
      {label}
    </Link>
  );
}

function formatDay(d: Date | null | undefined): string {
  if (!d) return "—";
  return new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "2-digit" }).format(d);
}
