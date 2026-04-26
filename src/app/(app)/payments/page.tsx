import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Prisma, PaymentStatus, PaymentType } from "@prisma/client";
import { formatCurrency, formatDate } from "@/lib/format";
import { PaymentRowActions } from "@/components/payments/payment-row-actions";

export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; type?: string; status?: string }>;
}) {
  const sp = await searchParams;

  // По умолчанию — текущий месяц
  const today = new Date();
  const defaultMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
  const month = sp.month ?? defaultMonth;

  const where: Prisma.PaymentWhereInput = {};
  if (month) {
    const [y, m] = month.split("-").map(Number);
    if (y && m) {
      const from = new Date(Date.UTC(y, m - 1, 1));
      const to = new Date(Date.UTC(y, m, 1));
      where.plannedDate = { gte: from, lt: to };
    }
  }
  if (sp.type === "ORDER" || sp.type === "PACKAGING") where.type = sp.type as PaymentType;
  if (sp.status === "PENDING" || sp.status === "PAID") where.status = sp.status as PaymentStatus;

  const payments = await prisma.payment.findMany({
    where,
    orderBy: { plannedDate: "asc" },
    take: 500,
    include: {
      order: {
        select: {
          id: true,
          orderNumber: true,
          productModel: { select: { name: true } },
          lines: {
            select: { productVariant: { select: { colorName: true } } },
            orderBy: { createdAt: "asc" },
            take: 3,
          },
        },
      },
      factory: { select: { name: true } },
      packagingItem: { select: { name: true } },
    },
  });

  // Сводка: всего в месяце, оплачено, осталось, просрочено
  const total = payments.reduce((a, p) => a + Number(p.amount), 0);
  const paid = payments.filter((p) => p.status === "PAID").reduce((a, p) => a + Number(p.amount), 0);
  const pending = total - paid;
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const overdue = payments
    .filter((p) => p.status === "PENDING" && p.plannedDate < startOfToday)
    .reduce((a, p) => a + Number(p.amount), 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Платежи</h1>
          <p className="text-sm text-slate-500">Период: {formatMonthLabel(month)}. Всего {payments.length}.</p>
        </div>
        <Link
          href="/payments/new"
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          + Создать платёж
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Summary title="К оплате в этом месяце" value={formatCurrency(pending)} />
        <Summary title="Оплачено" value={formatCurrency(paid)} muted />
        <Summary title="Всего в месяце" value={formatCurrency(total)} muted />
        <Summary title="Просрочено" value={formatCurrency(overdue)} danger={overdue > 0} />
      </div>

      <form method="get" className="flex flex-wrap items-center gap-2">
        <label className="text-sm text-slate-600">Месяц:</label>
        <input
          type="month"
          name="month"
          defaultValue={month}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
        />
        <select
          name="type"
          defaultValue={sp.type ?? ""}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
        >
          <option value="">Все типы</option>
          <option value="ORDER">Фабрики (заказы)</option>
          <option value="PACKAGING">Упаковка</option>
        </select>
        <select
          name="status"
          defaultValue={sp.status ?? ""}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
        >
          <option value="">Все статусы</option>
          <option value="PENDING">Ждёт</option>
          <option value="PAID">Оплачено</option>
        </select>
        <button className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm hover:bg-slate-50">
          Применить
        </button>
        <Link href="/payments" className="rounded-lg px-3 py-2 text-sm text-slate-500 hover:text-slate-700">
          Сбросить
        </Link>
      </form>

      {payments.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
          Платежей за период нет.
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Дата</th>
                <th className="px-4 py-3">Тип</th>
                <th className="px-4 py-3">Контрагент / Заказ</th>
                <th className="px-4 py-3">Платёж</th>
                <th className="px-4 py-3 text-right">Сумма</th>
                <th className="px-4 py-3">Статус</th>
                <th className="px-4 py-3 text-right">Действия</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {payments.map((p) => {
                const overdueRow = p.status === "PENDING" && p.plannedDate < startOfToday;
                return (
                  <tr key={p.id} className={overdueRow ? "bg-red-50/50" : undefined}>
                    <td className="whitespace-nowrap px-4 py-3">
                      {formatDate(p.plannedDate)}
                      {overdueRow && (
                        <div className="text-xs font-medium text-red-600">просрочен</div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs ${
                        p.type === "ORDER" ? "bg-blue-50 text-blue-700" : "bg-amber-50 text-amber-700"
                      }`}>
                        {p.type === "ORDER" ? "Фабрика" : "Упаковка"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {p.type === "ORDER" ? (
                        <div>
                          <div className="font-medium text-slate-900">
                            {p.factory?.name ?? "—"}
                          </div>
                          {p.order && (
                            <Link href={`/orders/${p.order.id}`} className="text-xs text-slate-500 hover:text-slate-700">
                              {p.order.orderNumber} · {p.order.productModel.name}
                              {p.order.lines.length > 0 && " · " + p.order.lines.map((l) => l.productVariant.colorName).join(", ")}
                            </Link>
                          )}
                        </div>
                      ) : (
                        <div>
                          <div className="font-medium text-slate-900">{p.supplierName ?? "—"}</div>
                          {p.packagingItem && (
                            <div className="text-xs text-slate-500">{p.packagingItem.name}</div>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-700">{p.label}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right font-medium">
                      {formatCurrency(p.amount.toString())}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs ${
                        p.status === "PAID" ? "bg-green-50 text-green-700" : "bg-slate-100 text-slate-700"
                      }`}>
                        {p.status === "PAID" ? `Оплачен ${p.paidAt ? formatDate(p.paidAt) : ""}` : "Ждёт"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <PaymentRowActions id={p.id} status={p.status} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Summary({ title, value, danger, muted }: { title: string; value: string; danger?: boolean; muted?: boolean }) {
  return (
    <div className={`rounded-xl border p-4 ${
      danger ? "border-red-200 bg-red-50" : muted ? "border-slate-200 bg-slate-50" : "border-slate-200 bg-white"
    }`}>
      <div className="text-xs text-slate-500">{title}</div>
      <div className={`mt-1 text-xl font-semibold ${danger ? "text-red-700" : "text-slate-900"}`}>{value}</div>
    </div>
  );
}

function formatMonthLabel(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  if (!y || !m) return ym;
  const names = ["январь", "февраль", "март", "апрель", "май", "июнь", "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь"];
  return `${names[m - 1]} ${y}`;
}
