import { prisma } from "@/lib/prisma";
import { PaymentForm } from "@/components/payments/payment-form";

export default async function NewPaymentPage() {
  const orders = await prisma.order.findMany({
    where: { deletedAt: null },
    orderBy: { createdAt: "desc" },
    take: 200,
    select: {
      id: true,
      orderNumber: true,
      factoryId: true,
      productModel: { select: { name: true } },
      lines: {
        select: { productVariant: { select: { colorName: true } } },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-2xl font-semibold text-slate-900">Новый платёж</h1>
      <div className="rounded-2xl border border-slate-200 bg-white p-6">
        <PaymentForm
          orders={orders.map((o) => ({
            id: o.id,
            label: `${o.orderNumber} · ${o.productModel.name}${o.lines.length > 0 ? " · " + o.lines.map((l) => l.productVariant.colorName).join(", ") : ""}`,
            factoryId: o.factoryId,
          }))}
        />
      </div>
    </div>
  );
}
