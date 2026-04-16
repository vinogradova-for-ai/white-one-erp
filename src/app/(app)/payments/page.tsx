import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { formatCurrency, formatDate } from "@/lib/format";

type Payment = {
  id: string;
  orderId: string;
  orderNumber: string;
  productName: string;
  type: "Предоплата" | "Остаток";
  amount: string;
  date: Date | null;
  paid: boolean;
};

export default async function PaymentsPage() {
  const orders = await prisma.order.findMany({
    where: {
      deletedAt: null,
      OR: [
        { prepaymentAmount: { not: null }, prepaymentPaid: false },
        { finalPaymentAmount: { not: null }, finalPaymentPaid: false },
      ],
    },
    include: { product: { select: { name: true } } },
    orderBy: { prepaymentDate: "asc" },
  });

  const payments: Payment[] = [];
  for (const o of orders) {
    if (o.prepaymentAmount && !o.prepaymentPaid) {
      payments.push({
        id: `${o.id}-prep`,
        orderId: o.id,
        orderNumber: o.orderNumber,
        productName: o.product.name,
        type: "Предоплата",
        amount: o.prepaymentAmount.toString(),
        date: o.prepaymentDate,
        paid: false,
      });
    }
    if (o.finalPaymentAmount && !o.finalPaymentPaid) {
      payments.push({
        id: `${o.id}-final`,
        orderId: o.id,
        orderNumber: o.orderNumber,
        productName: o.product.name,
        type: "Остаток",
        amount: o.finalPaymentAmount.toString(),
        date: o.finalPaymentDate,
        paid: false,
      });
    }
  }

  const total = payments.reduce((s, p) => s + Number(p.amount), 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Платёжный календарь</h1>
          <p className="text-sm text-slate-500">Неоплаченных платежей: {payments.length}</p>
        </div>
        <div className="rounded-xl bg-amber-50 px-4 py-2">
          <div className="text-xs text-amber-700">К оплате</div>
          <div className="text-lg font-semibold text-amber-900">{formatCurrency(total)}</div>
        </div>
      </div>
      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500">№ заказа</th>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500">Изделие</th>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500">Тип</th>
              <th className="px-3 py-2 text-right text-xs font-semibold uppercase text-slate-500">Сумма</th>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500">Дата</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {payments.map((p) => (
              <tr key={p.id} className="hover:bg-slate-50">
                <td className="px-3 py-2"><Link href={`/orders/${p.orderId}`} className="font-mono text-xs hover:underline">{p.orderNumber}</Link></td>
                <td className="px-3 py-2">{p.productName}</td>
                <td className="px-3 py-2 text-xs">{p.type}</td>
                <td className="px-3 py-2 text-right font-medium">{formatCurrency(p.amount)}</td>
                <td className="px-3 py-2 text-xs">{formatDate(p.date)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {payments.length === 0 && <div className="p-12 text-center text-sm text-slate-500">Неоплаченных платежей нет</div>}
      </div>
    </div>
  );
}
