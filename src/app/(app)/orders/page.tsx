import { prisma } from "@/lib/prisma";
import { ORDER_STATUS_LABELS, ORDER_STATUS_ORDER } from "@/lib/constants";
import { resolveModelCost } from "@/lib/calculations/resolve-model-cost";
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
      // Подтягиваем экономические поля фасона для fallback'а в сумме заказа
      // (тот же приоритет что в resolveModelCost, что и на /orders/[id]).
      productModel: {
        select: {
          name: true, category: true, photoUrls: true,
          fullCost: true, purchasePriceRub: true, purchasePriceCny: true,
          cnyRubRate: true, targetCostRub: true, targetCostCny: true,
        },
      },
      lines: {
        include: {
          productVariant: { select: { colorName: true, photoUrls: true } },
        },
        orderBy: { createdAt: "asc" },
      },
      factory: { select: { name: true } },
      owner: { select: { id: true, name: true } },
      packagingItems: {
        include: {
          packagingItem: { select: { name: true, type: true } },
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  const rows: OrdersListRow[] = orders.map((o) => {
    const modelCost = resolveModelCost(o.productModel) ?? 0;
    const totalAmount = o.lines.reduce((sum, l) => {
      const lc = Number(l.batchCost ?? 0);
      if (lc > 0) return sum + lc;
      const snap = Number(l.snapshotFullCost ?? 0);
      if (snap > 0) return sum + snap * l.quantity;
      return sum + modelCost * l.quantity;
    }, 0);

    return {
      id: o.id,
      orderNumber: o.orderNumber,
      orderType: o.orderType,
      status: o.status,
      isDelayed: o.isDelayed,
      hasIssue: o.hasIssue,
      arrivalPlannedDate: o.arrivalPlannedDate ? o.arrivalPlannedDate.toISOString() : null,
      totalAmount,
      productModel: {
        name: o.productModel.name,
        category: o.productModel.category,
        photoUrls: o.productModel.photoUrls,
      },
      factory: o.factory,
      owner: o.owner,
      lines: o.lines.map((l) => ({
        quantity: l.quantity,
        productVariant: l.productVariant,
      })),
      packagingNames: o.packagingItems.map((pi) => pi.packagingItem.name),
    };
  });

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
