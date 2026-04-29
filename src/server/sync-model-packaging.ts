import { prisma } from "@/lib/prisma";

/**
 * Идемпотентный авто-синк: для всех ModelPackaging данной модели создаёт
 * недостающие OrderPackaging в открытых заказах (status NOT IN [ON_SALE]).
 *
 * Используется напрямую (без HTTP) из server-компонентов — например,
 * страница редактирования фасона перед рендером запускает синк, чтобы
 * упаковка автоматически «протекла» во все существующие заказы фасона.
 *
 * Почему так: новые привязки protect через POST /api/models/[id]/packaging,
 * но исторические gap'ы (созданные до фикса каскада) лечатся только при
 * следующем визите на страницу.
 */
export async function syncModelPackagingToOrders(productModelId: string): Promise<number> {
  const links = await prisma.modelPackaging.findMany({
    where: { productModelId },
    select: { packagingItemId: true, quantityPerUnit: true },
  });
  if (links.length === 0) return 0;

  const orders = await prisma.order.findMany({
    where: {
      productModelId,
      deletedAt: null,
      status: { not: "ON_SALE" },
    },
    select: {
      id: true,
      packagingItems: { select: { packagingItemId: true } },
    },
  });
  if (orders.length === 0) return 0;

  const toCreate: Array<{ orderId: string; packagingItemId: string; quantityPerUnit: number }> = [];
  for (const o of orders) {
    const existing = new Set(o.packagingItems.map((p) => p.packagingItemId));
    for (const link of links) {
      if (existing.has(link.packagingItemId)) continue;
      toCreate.push({
        orderId: o.id,
        packagingItemId: link.packagingItemId,
        quantityPerUnit: Number(link.quantityPerUnit),
      });
    }
  }
  if (toCreate.length > 0) {
    await prisma.orderPackaging.createMany({ data: toCreate, skipDuplicates: true });
  }
  return toCreate.length;
}
