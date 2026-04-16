import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { formatCurrency, formatNumber } from "@/lib/format";
import { PRODUCT_STATUS_LABELS, ORDER_STATUS_LABELS } from "@/lib/constants";
import Link from "next/link";

export default async function DashboardPage() {
  const session = await auth();
  const userName = session?.user?.name ?? "";

  const [
    productsTotal,
    productsInDev,
    productsReady,
    ordersActive,
    ordersDelayed,
    ordersOnSale,
  ] = await Promise.all([
    prisma.product.count({ where: { deletedAt: null } }),
    prisma.product.count({ where: { deletedAt: null, status: { not: "READY_FOR_PRODUCTION" } } }),
    prisma.product.count({ where: { deletedAt: null, status: "READY_FOR_PRODUCTION" } }),
    prisma.order.count({ where: { deletedAt: null, status: { not: "ON_SALE" } } }),
    prisma.order.count({ where: { deletedAt: null, isDelayed: true } }),
    prisma.order.count({ where: { deletedAt: null, status: "ON_SALE" } }),
  ]);

  const plannedRevenueAgg = await prisma.order.aggregate({
    where: { deletedAt: null, status: { not: "ON_SALE" } },
    _sum: { plannedRevenue: true, batchCost: true },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Добрый день, {userName}</h1>
        <p className="text-sm text-slate-500">Сводка по системе</p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <KpiCard label="Всего изделий" value={formatNumber(productsTotal)} href="/products" />
        <KpiCard label="В разработке" value={formatNumber(productsInDev)} href="/products?status=IDEA" />
        <KpiCard label="Готово к производству" value={formatNumber(productsReady)} href="/products?status=READY_FOR_PRODUCTION" />
        <KpiCard label="Активные заказы" value={formatNumber(ordersActive)} href="/orders" />
        <KpiCard
          label="С задержкой"
          value={formatNumber(ordersDelayed)}
          href="/orders?delayed=true"
          variant={ordersDelayed > 0 ? "danger" : "default"}
        />
        <KpiCard label="В продаже" value={formatNumber(ordersOnSale)} href="/orders?status=ON_SALE" />
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-6">
          <h2 className="mb-3 text-sm font-semibold text-slate-500 uppercase tracking-wide">
            Экономика активных заказов
          </h2>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-600">Себестоимость партий (план):</span>
              <span className="font-medium text-slate-900">
                {formatCurrency(plannedRevenueAgg._sum.batchCost?.toString())}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600">Плановая выручка:</span>
              <span className="font-medium text-slate-900">
                {formatCurrency(plannedRevenueAgg._sum.plannedRevenue?.toString())}
              </span>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6">
          <h2 className="mb-3 text-sm font-semibold text-slate-500 uppercase tracking-wide">
            Быстрые действия
          </h2>
          <div className="grid gap-2">
            <QuickLink href="/products/new" label="+ Создать изделие" />
            <QuickLink href="/orders/new" label="+ Создать заказ" />
            <QuickLink href="/my-tasks" label="→ Мои задачи" />
            <QuickLink href="/admin/import" label="↧ Импорт Excel" />
          </div>
        </div>
      </div>

      <p className="text-xs text-slate-400">
        Лейблы статусов: {Object.values(PRODUCT_STATUS_LABELS).join(" / ")} ·{" "}
        {Object.values(ORDER_STATUS_LABELS).join(" / ")}
      </p>
    </div>
  );
}

function KpiCard({
  label,
  value,
  href,
  variant = "default",
}: {
  label: string;
  value: string;
  href: string;
  variant?: "default" | "danger";
}) {
  return (
    <Link
      href={href}
      className={`rounded-2xl border p-4 transition hover:shadow-sm ${
        variant === "danger"
          ? "border-red-200 bg-red-50"
          : "border-slate-200 bg-white"
      }`}
    >
      <div className="text-xs text-slate-500">{label}</div>
      <div
        className={`mt-1 text-2xl font-semibold ${
          variant === "danger" ? "text-red-700" : "text-slate-900"
        }`}
      >
        {value}
      </div>
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
