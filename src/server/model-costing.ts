import { prisma } from "@/lib/prisma";
import { resolveModelCost } from "@/lib/calculations/resolve-model-cost";
import { buildCargoAllocation } from "@/server/cargo-allocation";
import { CHINA_WAREHOUSE_FEE_RUB } from "@/lib/constants";

/**
 * Лист «Себестоимость» — ТЕСТОВАЯ модель полной себестоимости в ЕРП
 * (решение прожарки 15-16.07: жёсткий факт живёт в финсервисе .fin3, ЕРП
 * считает свою модель «на круг»; сойдутся цифры — будет интеграция).
 *
 * Слагаемые на штуку:
 *   Закуп        — resolveModelCost (ручной ввод/юани по курсу фасона)
 *   Упаковка     — нормы фасона × цена единицы упаковки
 *   Доставка     — доля заказов фасона в раскидках карго по весу (₽ ÷ штуки)
 *   Склад Китай  — фикс CHINA_WAREHOUSE_FEE_RUB (26 ₽)
 *   ОТК Китай    — появится с сущностью ОТК (следующая фаза)
 *   Логистика ВБ — от литров, позже
 *
 * Чего не хватает — говорим честно в missing (красные чипы на листе).
 */

export type ModelCostingRow = {
  modelId: string;
  artikul: string;
  name: string;
  category: string;
  photoUrl: string | null;
  purchaseRub: number | null;
  packagingRub: number | null;
  cargoRub: number | null;   // средневзвешенная доля доставки ₽/шт по прибывшим раскидкам
  cargoUnits: number;        // на скольких штуках посчитана доставка
  warehouseRub: number;      // фикс
  totalRub: number | null;   // сумма имеющегося (закуп обязателен)
  missing: string[];         // «закуп», «цена упаковки», «вес штуки», «карго не ехал»
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export async function buildModelCosting(): Promise<{
  rows: ModelCostingRow[];
  rateNote: string | null;
}> {
  const models = await prisma.productModel.findMany({
    where: { deletedAt: null },
    orderBy: [{ category: "asc" }, { artikulBase: "asc" }],
    select: {
      id: true,
      name: true,
      category: true,
      artikulBase: true,
      photoUrls: true,
      fullCost: true,
      purchasePriceRub: true,
      purchasePriceCny: true,
      cnyRubRate: true,
      targetCostRub: true,
      targetCostCny: true,
      packagingItems: {
        select: {
          quantityPerUnit: true,
          packagingItem: {
            select: { name: true, unitPriceRub: true, unitPriceCny: true, cnyRubRate: true },
          },
        },
      },
      variants: { where: { deletedAt: null }, select: { weightG: true } },
    },
  });

  // ── Доставка: раскидки всех карго с деньгами → рубли и штуки на фасон ──
  const shipments = await prisma.shipment.findMany({
    where: {
      deletedAt: null,
      OR: [
        { amountUsdt: { not: null } },
        { freightUsd: { not: null } },
      ],
    },
    select: { id: true },
  });

  // партия → фасон (для маппинга строк раскидки)
  const batches = await prisma.orderBatch.findMany({
    where: { shipmentId: { not: null } },
    select: { id: true, order: { select: { productModelId: true } } },
  });
  const batchToModel = new Map(batches.map((b) => [b.id, b.order.productModelId]));

  const cargoByModel = new Map<string, { rub: number; units: number }>();
  let anyPreliminaryRate = false;

  for (const s of shipments) {
    const a = await buildCargoAllocation(s.id);
    if (!a) continue;
    if (!a.rateIsFixed) anyPreliminaryRate = true;
    for (const line of a.lines) {
      if (!line.key.startsWith("batch:") || line.amountRub == null || line.qty <= 0) continue;
      const modelId = batchToModel.get(line.key.slice("batch:".length));
      if (!modelId) continue;
      const acc = cargoByModel.get(modelId) ?? { rub: 0, units: 0 };
      acc.rub += line.amountRub;
      acc.units += line.qty;
      cargoByModel.set(modelId, acc);
    }
  }

  const rows: ModelCostingRow[] = models.map((m) => {
    const missing: string[] = [];

    const purchaseRub = resolveModelCost(m);
    if (purchaseRub == null) missing.push("закуп");

    // Упаковка по нормам фасона
    let packagingRub: number | null = null;
    if (m.packagingItems.length > 0) {
      let sum = 0;
      let ok = true;
      for (const mp of m.packagingItems) {
        const it = mp.packagingItem;
        const rate = it.cnyRubRate != null && Number(it.cnyRubRate) > 0 ? Number(it.cnyRubRate) : null;
        const price =
          it.unitPriceRub != null
            ? Number(it.unitPriceRub)
            : it.unitPriceCny != null && rate != null
              ? Number(it.unitPriceCny) * rate
              : null;
        if (price == null) {
          ok = false;
          missing.push(`цена упаковки: ${it.name}`);
          continue;
        }
        sum += price * Number(mp.quantityPerUnit);
      }
      packagingRub = ok || sum > 0 ? round2(sum) : null;
    }

    const cargo = cargoByModel.get(m.id);
    const cargoRub = cargo && cargo.units > 0 ? round2(cargo.rub / cargo.units) : null;
    if (cargoRub == null) missing.push("карго не ехал");

    const hasWeight = m.variants.some((v) => v.weightG != null && v.weightG > 0);
    if (!hasWeight) missing.push("вес штуки");

    const totalRub =
      purchaseRub != null
        ? round2(
            purchaseRub +
              (packagingRub ?? 0) +
              (cargoRub ?? 0) +
              CHINA_WAREHOUSE_FEE_RUB,
          )
        : null;

    return {
      modelId: m.id,
      artikul: m.artikulBase || m.name,
      name: m.name,
      category: m.category,
      photoUrl: m.photoUrls[0] ?? null,
      purchaseRub,
      packagingRub,
      cargoRub,
      cargoUnits: cargo?.units ?? 0,
      warehouseRub: CHINA_WAREHOUSE_FEE_RUB,
      totalRub,
      missing,
    };
  });

  return {
    rows,
    rateNote: anyPreliminaryRate
      ? "У части карго курс предварительный (оплата не проставлена) — доставка уточнится после оплаты."
      : null,
  };
}
