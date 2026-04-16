import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { formatCurrency, formatNumber } from "@/lib/format";

export default async function DashboardPage() {
  const session = await auth();
  const userName = session?.user?.name ?? "";

  const [
    modelsTotal,
    modelsInDev,
    modelsInProd,
    variantsReady,
    ordersActive,
    ordersDelayed,
    samplesActive,
    ideasNew,
  ] = await Promise.all([
    prisma.productModel.count({ where: { deletedAt: null } }),
    prisma.productModel.count({ where: { deletedAt: null, status: { not: "IN_PRODUCTION" } } }),
    prisma.productModel.count({ where: { deletedAt: null, status: "IN_PRODUCTION" } }),
    prisma.productVariant.count({ where: { deletedAt: null, status: "READY_TO_ORDER" } }),
    prisma.order.count({ where: { deletedAt: null, status: { not: "ON_SALE" } } }),
    prisma.order.count({ where: { deletedAt: null, isDelayed: true } }),
    prisma.sample.count({ where: { status: { notIn: ["RETURNED"] } } }),
    prisma.idea.count({ where: { status: { in: ["NEW", "CONSIDERING"] } } }),
  ]);

  const planAgg = await prisma.order.aggregate({
    where: { deletedAt: null, status: { not: "ON_SALE" } },
    _sum: { plannedRevenue: true, batchCost: true },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Добрый день, {userName}</h1>
        <p className="text-sm text-slate-500">Сводка по системе</p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-4">
        <KpiCard label="Фасонов всего" value={formatNumber(modelsTotal)} href="/models" />
        <KpiCard label="В разработке" value={formatNumber(modelsInDev)} href="/models?status=IDEA" />
        <KpiCard label="В производстве" value={formatNumber(modelsInProd)} href="/models?status=IN_PRODUCTION" />
        <KpiCard label="Вариантов готово к заказу" value={formatNumber(variantsReady)} href="/variants" />

        <KpiCard label="Активные заказы" value={formatNumber(ordersActive)} href="/orders" />
        <KpiCard label="С задержкой" value={formatNumber(ordersDelayed)} href="/orders?delayed=true" variant={ordersDelayed > 0 ? "danger" : "default"} />
        <KpiCard label="Образцов в работе" value={formatNumber(samplesActive)} href="/samples" />
        <KpiCard label="Новых идей" value={formatNumber(ideasNew)} href="/ideas" />
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-6">
          <h2 className="mb-3 text-sm font-semibold text-slate-500 uppercase tracking-wide">
            Экономика активных заказов
          </h2>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-600">Себестоимость партий:</span>
              <span className="font-medium text-slate-900">
                {formatCurrency(planAgg._sum.batchCost?.toString())}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600">Плановая выручка:</span>
              <span className="font-medium text-slate-900">
                {formatCurrency(planAgg._sum.plannedRevenue?.toString())}
              </span>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6">
          <h2 className="mb-3 text-sm font-semibold text-slate-500 uppercase tracking-wide">
            Быстрые действия
          </h2>
          <div className="grid gap-2">
            <QuickLink href="/models/new" label="+ Создать фасон" />
            <QuickLink href="/ideas/new" label="+ Добавить идею" />
            <QuickLink href="/orders/new" label="+ Создать заказ" />
            <QuickLink href="/my-tasks" label="→ Мои задачи" />
          </div>
        </div>
      </div>
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
        variant === "danger" ? "border-red-200 bg-red-50" : "border-slate-200 bg-white"
      }`}
    >
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`mt-1 text-2xl font-semibold ${variant === "danger" ? "text-red-700" : "text-slate-900"}`}>
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
