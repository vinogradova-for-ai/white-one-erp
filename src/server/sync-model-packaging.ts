import { prisma } from "@/lib/prisma";

// Заказы, где комплект упаковки ещё «живой» и должен зеркалиться с фасоном.
// С «Упаковки» и дальше комплект заморожен: списание уже прошло/идёт.
const MIRROR_STATUSES = [
  "PREPARATION",
  "FABRIC_ORDERED",
  "SEWING",
  "QC",
  "READY_SHIP",
  "IN_TRANSIT",
  "WAREHOUSE_MSK",
] as const;

/**
 * Идемпотентный авто-синк комплекта упаковки фасона в открытые заказы.
 *
 * Правка Алёны №3 (03.07): раньше синк только ДОБАВЛЯЛ недостающие позиции.
 * Если в карточке фасона пакет заменили или поменяли количество на единицу,
 * в заказах оставался старый комплект — и «Упаковка» считала потребность
 * по нему. Теперь синк — зеркало для строк, пришедших из фасона
 * (syncedFromModel=true):
 *   • создаёт недостающие позиции комплекта;
 *   • обновляет quantityPerUnit под фасон;
 *   • удаляет позиции, которых в комплекте фасона больше нет.
 * Ручные строки заказа (добавленные/правленные в карточке заказа,
 * syncedFromModel=false) не трогаются. Заказы с «Упаковки» и дальше — тоже.
 *
 * Используется напрямую (без HTTP) из server-компонентов — страницы фасона
 * и заказа запускают синк перед рендером.
 */
export async function syncModelPackagingToOrders(productModelId: string): Promise<number> {
  const links = await prisma.modelPackaging.findMany({
    where: { productModelId },
    select: { packagingItemId: true, quantityPerUnit: true },
  });
  const linkByItem = new Map(links.map((l) => [l.packagingItemId, l]));

  const orders = await prisma.order.findMany({
    where: {
      productModelId,
      deletedAt: null,
      status: { in: [...MIRROR_STATUSES] },
    },
    select: {
      id: true,
      packagingItems: {
        select: {
          id: true,
          packagingItemId: true,
          quantityPerUnit: true,
          syncedFromModel: true,
          consumedQty: true,
        },
      },
    },
  });
  if (orders.length === 0) return 0;

  const toCreate: Array<{ orderId: string; packagingItemId: string; quantityPerUnit: number; syncedFromModel: boolean }> = [];
  const toUpdate: Array<{ id: string; quantityPerUnit: number }> = [];
  const toDelete: string[] = [];

  for (const o of orders) {
    const existingByItem = new Map(o.packagingItems.map((p) => [p.packagingItemId, p]));

    for (const link of links) {
      const existing = existingByItem.get(link.packagingItemId);
      if (!existing) {
        toCreate.push({
          orderId: o.id,
          packagingItemId: link.packagingItemId,
          quantityPerUnit: Number(link.quantityPerUnit),
          syncedFromModel: true,
        });
      } else if (
        existing.syncedFromModel &&
        Number(existing.quantityPerUnit) !== Number(link.quantityPerUnit)
      ) {
        toUpdate.push({ id: existing.id, quantityPerUnit: Number(link.quantityPerUnit) });
      }
    }

    // Синхронные строки, которых больше нет в комплекте фасона, — убираем
    // (кроме уже списанных: это история склада, её не трогаем).
    for (const p of o.packagingItems) {
      if (p.syncedFromModel && p.consumedQty == null && !linkByItem.has(p.packagingItemId)) {
        toDelete.push(p.id);
      }
    }
  }

  if (toCreate.length === 0 && toUpdate.length === 0 && toDelete.length === 0) return 0;

  await prisma.$transaction(async (tx) => {
    if (toCreate.length > 0) {
      await tx.orderPackaging.createMany({ data: toCreate, skipDuplicates: true });
    }
    for (const u of toUpdate) {
      await tx.orderPackaging.update({ where: { id: u.id }, data: { quantityPerUnit: u.quantityPerUnit } });
    }
    if (toDelete.length > 0) {
      await tx.orderPackaging.deleteMany({ where: { id: { in: toDelete } } });
    }
  });

  return toCreate.length + toUpdate.length + toDelete.length;
}
