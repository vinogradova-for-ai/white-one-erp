import type { OrderStatus, ProductModelStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * «Проекты по людям» для страницы «Статистика» (/stats).
 *
 * Для каждого владельца собираем то, что закреплено за ним ПРЯМО СЕЙЧАС:
 *  а) фасоны в разработке — status IDEA/PATTERNS/SAMPLE/APPROVED, deletedAt=null,
 *     без живого заказа (критерий как devModels в team-month-stats);
 *  б) активные заказы — статусы до WAREHOUSE_MSK (пошив→доставка), deletedAt=null.
 *
 * Два запроса, вся группировка в JS — без N+1.
 */

// Фасоны «в разработке» — до запуска в производство (как в team-month-stats).
const DEV_MODEL_STATUSES: ProductModelStatus[] = ["IDEA", "PATTERNS", "SAMPLE", "APPROVED"];

// Активные заказы: от подготовки до доставки включительно (не завершённые —
// WAREHOUSE_MSK и дальше уже на складе/в продаже). Совпадает с ACTIVE_STATUSES
// в team-month-stats.
const ACTIVE_ORDER_STATUSES: OrderStatus[] = [
  "PREPARATION",
  "FABRIC_ORDERED",
  "SEWING",
  "QC",
  "READY_SHIP",
  "IN_TRANSIT",
];

export type DevModelItem = {
  id: string;
  name: string;
  status: ProductModelStatus;
};

export type ActiveOrderItem = {
  id: string;
  orderNumber: string;
  modelName: string;
  status: OrderStatus;
  units: number;
};

export type OwnerProjects = {
  ownerId: string;
  devModels: DevModelItem[];
  activeOrders: ActiveOrderItem[];
};

/**
 * Проекты по владельцам. Если задан ownerId — только этот человек.
 * Возвращает Map ownerId → { devModels, activeOrders } (только непустые записи).
 */
export async function getTeamProjects(ownerId?: string | null): Promise<Map<string, OwnerProjects>> {
  const ownerWhere = ownerId ? { ownerId } : {};

  const [devModels, activeOrders] = await Promise.all([
    prisma.productModel.findMany({
      where: {
        deletedAt: null,
        activated: true,
        status: { in: DEV_MODEL_STATUSES },
        orders: { none: { deletedAt: null } },
        ...ownerWhere,
      },
      select: { id: true, name: true, status: true, ownerId: true },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.order.findMany({
      where: {
        deletedAt: null,
        status: { in: ACTIVE_ORDER_STATUSES },
        ...ownerWhere,
      },
      select: {
        id: true,
        orderNumber: true,
        status: true,
        ownerId: true,
        productModel: { select: { name: true } },
        lines: { select: { quantity: true } },
      },
      orderBy: { decisionDate: "desc" },
    }),
  ]);

  const map = new Map<string, OwnerProjects>();
  const ensure = (id: string): OwnerProjects => {
    let a = map.get(id);
    if (!a) {
      a = { ownerId: id, devModels: [], activeOrders: [] };
      map.set(id, a);
    }
    return a;
  };

  for (const m of devModels) {
    ensure(m.ownerId).devModels.push({ id: m.id, name: m.name, status: m.status });
  }
  for (const o of activeOrders) {
    ensure(o.ownerId).activeOrders.push({
      id: o.id,
      orderNumber: o.orderNumber,
      modelName: o.productModel?.name ?? "—",
      status: o.status,
      units: o.lines.reduce((s, l) => s + l.quantity, 0),
    });
  }

  return map;
}
