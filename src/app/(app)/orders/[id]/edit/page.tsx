import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { OrderEditForm } from "@/components/orders/order-edit-form";

function iso(d: Date | null | undefined): string {
  return d ? d.toISOString().slice(0, 10) : "";
}

export default async function EditOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [order, factories, users] = await Promise.all([
    prisma.order.findFirst({
      where: { id, deletedAt: null },
      include: {
        productModel: { select: { name: true } },
        lines: {
          select: { quantity: true, productVariant: { select: { colorName: true } } },
          orderBy: { createdAt: "asc" },
        },
        payments: {
          where: { type: "ORDER" },
          orderBy: { plannedDate: "asc" },
          select: { id: true, plannedDate: true, amount: true, label: true, status: true },
        },
      },
    }),
    prisma.factory.findMany({ where: { isActive: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.user.findMany({
      where: { isActive: true, role: { in: ["OWNER", "DIRECTOR", "PRODUCT_MANAGER"] } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  if (!order) return notFound();

  const totalQty = order.lines.reduce((a, l) => a + l.quantity, 0);
  const colorList = order.lines.map((l) => l.productVariant.colorName).join(", ");

  // launchMonth (число YYYYMM) → "YYYY-MM"
  const lm = String(order.launchMonth);
  const launchMonth = `${lm.slice(0, 4)}-${lm.slice(4, 6)}`;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <div className="font-mono text-xs text-slate-500">{order.orderNumber}</div>
        <h1 className="text-2xl font-semibold text-slate-900">
          Редактирование заказа
        </h1>
        <p className="text-sm text-slate-500">
          {order.productModel.name} · {colorList} · {totalQty} шт
        </p>
      </div>
      <div className="rounded-2xl border border-slate-200 bg-white p-6">
        <OrderEditForm
          order={{
            id: order.id,
            orderType: order.orderType,
            season: order.season ?? "",
            launchMonth,
            factoryId: order.factoryId ?? "",
            ownerId: order.ownerId,
            deliveryMethod: order.deliveryMethod ?? "",
            paymentTerms: order.paymentTerms ?? "",
            packagingType: order.packagingType ?? "",
            notes: order.notes ?? "",
            timeline: {
              readyAtFactoryDate: iso(order.readyAtFactoryDate),
              qcDate: iso(order.qcDate),
              arrivalPlannedDate: iso(order.arrivalPlannedDate),
            },
            payments: order.payments.map((p) => ({
              id: p.id,
              plannedDate: iso(p.plannedDate),
              amount: Number(p.amount),
              label: p.label ?? "Платёж",
              paid: p.status === "PAID",
            })),
          }}
          factories={factories}
          users={users}
        />
      </div>
    </div>
  );
}
