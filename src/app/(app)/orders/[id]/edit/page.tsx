import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { OrderEditForm } from "@/components/orders/order-edit-form";

export default async function EditOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [order, factories, users] = await Promise.all([
    prisma.order.findFirst({
      where: { id, deletedAt: null },
      include: { productVariant: { include: { productModel: true } } },
    }),
    prisma.factory.findMany({ where: { isActive: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.user.findMany({
      where: { isActive: true, role: { in: ["OWNER", "DIRECTOR", "PRODUCT_MANAGER"] } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  if (!order) return notFound();

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <div className="font-mono text-xs text-slate-500">{order.orderNumber}</div>
        <h1 className="text-2xl font-semibold text-slate-900">
          Редактирование заказа
        </h1>
        <p className="text-sm text-slate-500">
          {order.productVariant.productModel.name} · {order.productVariant.colorName}
        </p>
      </div>
      <div className="rounded-2xl border border-slate-200 bg-white p-6">
        <OrderEditForm
          order={{
            id: order.id,
            orderType: order.orderType,
            season: order.season ?? "",
            launchMonth: order.launchMonth,
            quantity: order.quantity,
            factoryId: order.factoryId ?? "",
            ownerId: order.ownerId,
            deliveryMethod: order.deliveryMethod ?? "",
            paymentTerms: order.paymentTerms ?? "",
            prepaymentAmount: order.prepaymentAmount?.toString() ?? "",
            finalPaymentAmount: order.finalPaymentAmount?.toString() ?? "",
            packagingType: order.packagingType ?? "",
            notes: order.notes ?? "",
          }}
          factories={factories}
          users={users}
        />
      </div>
    </div>
  );
}
