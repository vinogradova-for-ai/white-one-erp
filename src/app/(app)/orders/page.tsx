import { prisma } from "@/lib/prisma";
import { ORDER_STATUS_LABELS, ORDER_STATUS_ORDER } from "@/lib/constants";
import {
  OrdersListClient,
  type OrdersListRow,
  type OrdersListFilterOptions,
} from "@/components/orders/orders-list-client";

export default async function OrdersPage() {
  // Грузим все актуальные заказы (без фильтрации в where) — фильтрация
  // выполняется на клиенте через те же multi-select dropdown'ы,
  // которые работают на /gantt-v2. Так шапка везде одинаковая.
  const orders = await prisma.order.findMany({
    where: { deletedAt: null },
    orderBy: [{ launchMonth: "asc" }, { createdAt: "asc" }],
    take: 500,
    include: {
      productModel: { select: { name: true, category: true, photoUrls: true } },
      lines: {
        include: {
          productVariant: { select: { colorName: true, photoUrls: true } },
        },
        orderBy: { createdAt: "asc" },
      },
      factory: { select: { name: true } },
      owner: { select: { id: true, name: true } },
    },
  });

  const rows: OrdersListRow[] = orders.map((o) => ({
    id: o.id,
    orderNumber: o.orderNumber,
    orderType: o.orderType,
    status: o.status,
    isDelayed: o.isDelayed,
    hasIssue: o.hasIssue,
    arrivalPlannedDate: o.arrivalPlannedDate ? o.arrivalPlannedDate.toISOString() : null,
    productModel: o.productModel,
    factory: o.factory,
    owner: o.owner,
    lines: o.lines.map((l) => ({
      quantity: l.quantity,
      productVariant: l.productVariant,
    })),
  }));

  // Опции фильтров формируются из реальных данных, с подсчётом количества.
  const categoryCount = new Map<string, number>();
  const ownerMap = new Map<string, { name: string; count: number }>();
  const statusCount = new Map<OrdersListRow["status"], number>();
  for (const r of rows) {
    categoryCount.set(r.productModel.category, (categoryCount.get(r.productModel.category) ?? 0) + 1);
    const own = ownerMap.get(r.owner.id);
    ownerMap.set(r.owner.id, { name: r.owner.name, count: (own?.count ?? 0) + 1 });
    statusCount.set(r.status, (statusCount.get(r.status) ?? 0) + 1);
  }

  const filterOptions: OrdersListFilterOptions = {
    categories: [...categoryCount.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([value, count]) => ({ value, label: value, count })),
    owners: [...ownerMap.entries()]
      .sort((a, b) => a[1].name.localeCompare(b[1].name))
      .map(([value, { name, count }]) => ({ value, label: name, count })),
    statuses: ORDER_STATUS_ORDER
      .filter((s) => statusCount.has(s))
      .map((s) => ({ value: s, label: ORDER_STATUS_LABELS[s], count: statusCount.get(s) ?? 0 })),
  };

  return <OrdersListClient orders={rows} filterOptions={filterOptions} />;
}
