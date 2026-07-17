import { prisma } from "@/lib/prisma";

/**
 * Мини-товарный учёт упаковки (Алёна 17.07): движения по складам Китай/Москва.
 *
 * Правила (прожарка):
 *  - Вся упаковка производится в Китае: закончилось производство заказа
 *    упаковки (productionEndDate в прошлом) → ПРИХОД на склад Китай.
 *  - Партия упаковки уехала карго ОТДЕЛЬНО и карго прибыло → ПЕРЕМЕЩЕНИЕ
 *    Китай → Москва.
 *  - Партия с галкой «в комплекте с товаром» (inKit) и карго выехало →
 *    РАСХОД со склада Китай (упаковка ушла в комплекте, в Москве появится
 *    уже на изделии).
 *  - Отправка на ВБ («Списать отгруженное») → РАСХОД со склада Москва.
 *  - Инвентаризация — ручная поправка остатка до фактического числа.
 *
 * Идемпотентность автособытий — уникальный индекс (позиция, вид, источник):
 * повторный вызов не задвоит движение. Остатки считаются суммой движений;
 * легаси-поле PackagingItem.stock держим равным остатку Москвы.
 */

export type StockBalance = { cn: number; msk: number };

/**
 * ЯКОРЬ ИНВЕНТАРИЗАЦИИ (Алёна 17.07: «уточнить остатки и от них заново
 * строить продолжение учёта»): пересчитанный факт уже включает всё, что
 * физически случилось до пересчёта. Поэтому авто-движение с датой не позже
 * последней инвентаризации склада НЕ применяется по этому складу — иначе
 * задвоим то, что уже посчитано руками.
 */
async function inventoryAnchors(packagingItemId: string): Promise<{ cn: Date | null; msk: Date | null }> {
  const [cn, msk] = await Promise.all([
    prisma.packagingMovement.findFirst({
      where: { packagingItemId, kind: "ADJUST_CN" },
      orderBy: { date: "desc" },
      select: { date: true },
    }),
    prisma.packagingMovement.findFirst({
      where: { packagingItemId, kind: "ADJUST_MSK" },
      orderBy: { date: "desc" },
      select: { date: true },
    }),
  ]);
  return { cn: cn?.date ?? null, msk: msk?.date ?? null };
}

async function createMovementIdempotent(data: {
  packagingItemId: string;
  date: Date;
  kind: string;
  deltaCn?: number;
  deltaMsk?: number;
  note?: string | null;
  refType: string;
  refId: string;
  createdById?: string | null;
}): Promise<boolean> {
  // Замок инвентаризации: обнуляем сторону, уже учтённую пересчётом.
  const anchors = await inventoryAnchors(data.packagingItemId);
  const d = { ...data };
  if (d.deltaCn && anchors.cn && d.date <= anchors.cn) d.deltaCn = 0;
  if (d.deltaMsk && anchors.msk && d.date <= anchors.msk) d.deltaMsk = 0;
  if (!d.deltaCn && !d.deltaMsk) {
    // Полностью до якоря — записываем нулевое движение-метку, чтобы источник
    // считался обработанным (идемпотентность) и не всплывал после якоря.
    d.note = `${d.note ?? ""} · до инвентаризации, остаток не менялся`.trim();
  }
  try {
    await prisma.packagingMovement.create({ data: d });
    // Легаси-поле stock = остаток Москвы.
    if (d.deltaMsk) {
      await prisma.packagingItem.update({
        where: { id: d.packagingItemId },
        data: { stock: { increment: d.deltaMsk } },
      });
    }
    return true;
  } catch (e) {
    // Уникальный индекс: движение уже записано — тихо пропускаем.
    if ((e as { code?: string }).code === "P2002") return false;
    throw e;
  }
}

/** Приходы Китая: заказы упаковки с завершённым производством. Ленивая, идемпотентная. */
export async function syncPackagingArrivalsCn(): Promise<void> {
  const now = new Date();
  const orders = await prisma.packagingOrder.findMany({
    where: {
      status: { not: "CANCELLED" },
      productionEndDate: { not: null, lte: now },
    },
    select: {
      id: true,
      orderNumber: true,
      productionEndDate: true,
      lines: { select: { packagingItemId: true, quantity: true } },
    },
  });
  for (const o of orders) {
    for (const l of o.lines) {
      if (l.quantity <= 0) continue;
      await createMovementIdempotent({
        packagingItemId: l.packagingItemId,
        date: o.productionEndDate!,
        kind: "ARRIVAL_CN",
        deltaCn: l.quantity,
        note: `произведено · ${o.orderNumber}`,
        refType: "PackagingOrder",
        refId: o.id,
      });
    }
  }
}

/** События карго для партий упаковки: перемещение (прибыло) / расход комплектом (выехало). */
export async function syncPackagingStockForShipment(shipmentId: string): Promise<void> {
  const shipment = await prisma.shipment.findFirst({
    where: { id: shipmentId, deletedAt: null },
    select: {
      cargoNumber: true,
      number: true,
      departDate: true,
      arrivalActualDate: true,
      packagingBatches: {
        select: {
          id: true,
          inKit: true,
          packagingOrder: { select: { orderNumber: true } },
          items: { select: { packagingItemId: true, plannedQty: true } },
        },
      },
    },
  });
  if (!shipment) return;
  const label = shipment.cargoNumber ?? shipment.number;

  for (const b of shipment.packagingBatches) {
    if (b.inKit && shipment.departDate) {
      // Комплект: упаковка ушла со склада Китая в момент выезда.
      for (const i of b.items) {
        if (i.plannedQty <= 0) continue;
        await createMovementIdempotent({
          packagingItemId: i.packagingItemId,
          date: shipment.departDate,
          kind: "KIT_CN",
          deltaCn: -i.plannedQty,
          note: `в комплекте с товаром · ${label} · ${b.packagingOrder.orderNumber}`,
          refType: "PackagingOrderBatch",
          refId: b.id,
        });
      }
    } else if (!b.inKit && shipment.arrivalActualDate) {
      // Отдельная партия доехала: Китай → Москва.
      for (const i of b.items) {
        if (i.plannedQty <= 0) continue;
        await createMovementIdempotent({
          packagingItemId: i.packagingItemId,
          date: shipment.arrivalActualDate,
          kind: "MOVE_CN_MSK",
          deltaCn: -i.plannedQty,
          deltaMsk: i.plannedQty,
          note: `приехало карго ${label} · ${b.packagingOrder.orderNumber}`,
          refType: "PackagingOrderBatch",
          refId: b.id,
        });
      }
    }
  }
}

/** Остатки по позициям: суммы движений. */
export async function packagingBalances(itemIds?: string[]): Promise<Map<string, StockBalance>> {
  const grouped = await prisma.packagingMovement.groupBy({
    by: ["packagingItemId"],
    where: itemIds ? { packagingItemId: { in: itemIds } } : undefined,
    _sum: { deltaCn: true, deltaMsk: true },
  });
  return new Map(
    grouped.map((g) => [
      g.packagingItemId,
      { cn: g._sum.deltaCn ?? 0, msk: g._sum.deltaMsk ?? 0 },
    ]),
  );
}

/** Инвентаризация: довести остаток склада до фактического числа. */
export async function adjustPackagingStock(params: {
  packagingItemId: string;
  warehouse: "CN" | "MSK";
  actualQty: number;
  note?: string | null;
  actorId: string;
}): Promise<void> {
  const balances = await packagingBalances([params.packagingItemId]);
  const cur = balances.get(params.packagingItemId) ?? { cn: 0, msk: 0 };
  const delta = params.actualQty - (params.warehouse === "CN" ? cur.cn : cur.msk);
  // Даже нулевая дельта записывается: пересчёт = ЯКОРЬ, от которого учёт
  // строится заново (события задним числом больше не двигают остаток).
  await prisma.packagingMovement.create({
    data: {
      packagingItemId: params.packagingItemId,
      date: new Date(),
      kind: params.warehouse === "CN" ? "ADJUST_CN" : "ADJUST_MSK",
      ...(params.warehouse === "CN" ? { deltaCn: delta } : { deltaMsk: delta }),
      note: (params.note?.trim() || "инвентаризация") + (delta === 0 ? " · сошлось, якорь" : ""),
      createdById: params.actorId,
    },
  });
  if (params.warehouse === "MSK") {
    await prisma.packagingItem.update({
      where: { id: params.packagingItemId },
      data: { stock: { increment: delta } },
    });
  }
}

export const MOVEMENT_KIND_LABELS: Record<string, string> = {
  ARRIVAL_CN: "произведено (приход Китай)",
  MOVE_CN_MSK: "переезд Китай → Москва",
  KIT_CN: "ушло комплектом (Китай)",
  SHIP_WB_MSK: "отгружено на ВБ (Москва)",
  ADJUST_CN: "инвентаризация Китай",
  ADJUST_MSK: "инвентаризация Москва",
};
