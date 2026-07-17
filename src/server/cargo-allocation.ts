import { prisma } from "@/lib/prisma";
import { getCbrRate } from "@/server/currency-rates";
import {
  computeCargoAllocation,
  type CargoAllocation,
  type CargoLineInput,
} from "@/lib/cargo-costing";

/**
 * Собирает раскидку стоимости карго для поставки:
 *  - строки = партии заказов + заказы упаковки этого карго;
 *  - вес строки: штуки × вес штуки из справочника (цветомодель.weightG /
 *    упаковка.weightG), ручная поправка weightKgOverride побеждает;
 *  - курс: зафиксированный при оплате usdRubRate, иначе курс ЦБ на сегодня.
 *
 * Возвращает null, если денег на накладной нет (раскидывать нечего).
 */
export type CargoAllocationView = CargoAllocation & {
  // Позиции без веса штуки в справочнике — для подсказки «заполни вес» со ссылкой.
  missingWeights: Array<{ kind: "variant" | "packaging-item"; id: string; label: string; href: string }>;
};

export async function buildCargoAllocation(shipmentId: string): Promise<CargoAllocationView | null> {
  const shipment = await prisma.shipment.findFirst({
    where: { id: shipmentId, deletedAt: null },
    include: {
      batches: {
        include: {
          order: { select: { id: true, orderNumber: true, productModel: { select: { name: true } }, batches: { select: { id: true } } } },
          items: true,
        },
      },
      packagingBatches: {
        include: {
          packagingOrder: { select: { id: true, orderNumber: true, batches: { select: { id: true } } } },
          items: { include: { packagingItem: { select: { id: true, name: true, weightG: true } } } },
        },
      },
    },
  });
  if (!shipment) return null;

  const totalUsdKnown =
    shipment.freightUsd != null || shipment.insuranceUsd != null ||
    shipment.packingFeeUsd != null || shipment.amountUsdt != null;
  if (!totalUsdKnown) return null;

  // Веса штук цветомоделей для всех позиций партий одним запросом.
  const variantIds = Array.from(
    new Set(
      shipment.batches.flatMap((b) => b.items.map((i) => i.variantId)).filter((v): v is string => v != null),
    ),
  );
  const variants = variantIds.length
    ? await prisma.productVariant.findMany({
        where: { id: { in: variantIds } },
        select: { id: true, sku: true, weightG: true, productModelId: true },
      })
    : [];
  const variantById = new Map(variants.map((v) => [v.id, v]));

  const missingWeights: CargoAllocationView["missingWeights"] = [];
  const lines: CargoLineInput[] = [];

  for (const b of shipment.batches) {
    const qty = b.items.reduce((a, i) => a + i.plannedQty, 0);
    let grams = 0;
    let complete = b.items.length > 0;
    for (const i of b.items) {
      const v = i.variantId ? variantById.get(i.variantId) : undefined;
      if (v?.weightG != null && v.weightG > 0) {
        grams += v.weightG * i.plannedQty;
      } else {
        complete = false;
        if (v) {
          missingWeights.push({
            kind: "variant",
            id: v.id,
            label: `${v.sku}`,
            href: `/variants/${v.id}/edit`,
          });
        }
      }
    }
    const batchLabel =
      b.order.batches.length > 1
        ? `${b.order.orderNumber} · партия ${b.index}`
        : `${b.order.orderNumber} · ${b.order.productModel.name}`;
    lines.push({
      key: `batch:${b.id}`,
      kind: "batch",
      label: batchLabel,
      qty,
      autoWeightKg: complete && grams > 0 ? Math.round(grams / 100) / 10 : null,
      overrideWeightKg: b.weightKgOverride != null ? Number(b.weightKgOverride) : null,
    });
  }

  for (const b of shipment.packagingBatches) {
    // «В комплекте с товаром»: вес сидит в весе товара, отдельной строки нет.
    if (b.inKit) continue;
    const qty = b.items.reduce((a, i) => a + i.plannedQty, 0);
    let grams = 0;
    let complete = b.items.length > 0;
    for (const i of b.items) {
      if (i.packagingItem.weightG != null && i.packagingItem.weightG > 0) {
        grams += i.packagingItem.weightG * i.plannedQty;
      } else {
        complete = false;
        missingWeights.push({
          kind: "packaging-item",
          id: i.packagingItem.id,
          label: i.packagingItem.name,
          href: `/packaging/${i.packagingItem.id}`,
        });
      }
    }
    const firstName = b.items[0]?.packagingItem.name ?? "упаковка";
    const nameLabel = `${firstName}${b.items.length > 1 ? ` (+${b.items.length - 1})` : ""}`;
    const label =
      b.packagingOrder.batches.length > 1
        ? `${b.packagingOrder.orderNumber} · ${nameLabel} · партия ${b.index}`
        : `${b.packagingOrder.orderNumber} · ${nameLabel}`;
    lines.push({
      key: `pkgbatch:${b.id}`,
      kind: "packaging",
      label,
      qty,
      autoWeightKg: complete && grams > 0 ? Math.round(grams / 100) / 10 : null,
      overrideWeightKg: b.weightKgOverride != null ? Number(b.weightKgOverride) : null,
    });
  }

  // Курс: зафиксированный при оплате, иначе ЦБ на сегодня (ленивая история).
  let rate: number;
  let rateIsFixed: boolean;
  if (shipment.cargoPaidAt && shipment.usdRubRate != null) {
    rate = Number(shipment.usdRubRate);
    rateIsFixed = true;
  } else {
    rateIsFixed = false;
    try {
      rate = await getCbrRate("USD");
    } catch {
      rate = 0; // курса нет вообще — покажем только доли/веса без рублей
    }
  }

  const allocation = computeCargoAllocation({
    money: {
      freightUsd: shipment.freightUsd != null ? Number(shipment.freightUsd) : null,
      insuranceUsd: shipment.insuranceUsd != null ? Number(shipment.insuranceUsd) : null,
      packingFeeUsd: shipment.packingFeeUsd != null ? Number(shipment.packingFeeUsd) : null,
      amountUsdt: shipment.amountUsdt != null ? Number(shipment.amountUsdt) : null,
    },
    rate,
    rateIsFixed,
    waybillWeightKg: shipment.weightKg != null ? Number(shipment.weightKg) : null,
    lines,
  });

  // Дедуп подсказок «заполни вес» (одна цветомодель может быть в двух партиях).
  const seen = new Set<string>();
  const dedupedMissing = missingWeights.filter((m) => {
    const k = `${m.kind}:${m.id}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  return { ...allocation, missingWeights: dedupedMissing };
}
