/**
 * Применяет себестоимости и статусы из ПЛАН 2026:
 *  — fullCost / targetCostRub / targetCostCny / cnyRubRate ставятся на ProductModel
 *    (берётся первый встреченный sku модели в плане; цены одинаковы для всех цветов фасона)
 *  — orderType заказа: повтор → RESTOCK, тест → TEST
 */
import { PrismaClient, Prisma, type OrderType } from "@prisma/client";
import fs from "node:fs";

const prisma = new PrismaClient();

type Item = {
  status: string;
  color: string;
  modelDisplayName?: string;
  buyCostRub?: number | null;
  buyCostCny?: number | null;
  fullCostRub?: number | null;
  cnyRate?: number | null;
  source: "coats" | "trousers" | "dresses";
};

async function main() {
  const plan: Record<string, Item> = JSON.parse(
    fs.readFileSync("scripts/plan-2026.json", "utf-8"),
  );
  const skus = Object.keys(plan);

  // Сопоставляем артикулы плана с вариантами в БД
  const variants = await prisma.productVariant.findMany({
    where: { sku: { in: skus.map((s) => s.slice(0, 90)) }, deletedAt: null },
    include: { productModel: true },
  });
  const matchedSkus = new Set(variants.map((v) => v.sku));
  const missing = skus.filter((s) => !matchedSkus.has(s.slice(0, 90)));
  console.log(`Найдено в БД: ${variants.length} из ${skus.length}; не найдено: ${missing.length}`);
  if (missing.length > 0) {
    console.log("Не найдены:", missing.slice(0, 15).join(", "), missing.length > 15 ? "…" : "");
  }

  // Группируем по фасону
  const byModel = new Map<string, { model: typeof variants[0]["productModel"]; items: Item[]; statuses: Set<string> }>();
  for (const v of variants) {
    const item = plan[v.sku] ?? plan[v.sku.replace(/_\d+$/, "")];
    if (!item) continue;
    const cur = byModel.get(v.productModelId) ?? { model: v.productModel, items: [], statuses: new Set() };
    cur.items.push(item);
    cur.statuses.add(item.status);
    byModel.set(v.productModelId, cur);
  }

  let modelsUpdated = 0;
  let ordersUpdated = 0;

  for (const { model, items, statuses } of byModel.values()) {
    // Цены: берём у первого с непустым значением
    const fullCost = items.find((i) => i.fullCostRub)?.fullCostRub;
    const buyRub = items.find((i) => i.buyCostRub)?.buyCostRub;
    const buyCny = items.find((i) => i.buyCostCny)?.buyCostCny;
    const cnyRate = items.find((i) => i.cnyRate)?.cnyRate;

    const data: Prisma.ProductModelUpdateInput = {};
    if (fullCost) data.fullCost = new Prisma.Decimal(fullCost);
    if (buyRub) data.targetCostRub = new Prisma.Decimal(buyRub);
    if (buyCny) data.targetCostCny = new Prisma.Decimal(buyCny);

    if (Object.keys(data).length > 0) {
      await prisma.productModel.update({ where: { id: model.id }, data });
      modelsUpdated++;
    }

    // Тип заказа: «тест» — TEST; иначе RESTOCK (повтор)
    let orderType: OrderType = "SEASONAL";
    if (statuses.has("тест") && !statuses.has("повтор")) orderType = "TEST";
    else if (statuses.has("повтор")) orderType = "RESTOCK";

    // Обновляем последний открытый заказ модели + snapshot цен в lines
    const updatedOrders = await prisma.order.updateMany({
      where: { productModelId: model.id, deletedAt: null },
      data: { orderType },
    });
    if (updatedOrders.count > 0) {
      ordersUpdated += updatedOrders.count;
      // snapshotFullCost в lines
      if (fullCost) {
        await prisma.orderLine.updateMany({
          where: { order: { productModelId: model.id, deletedAt: null } },
          data: { snapshotFullCost: new Prisma.Decimal(fullCost) },
        });
      }
    }

    console.log(`✓ ${model.name}: fullCost=${fullCost ?? "—"}, buyRub=${buyRub ?? "—"}, buyCny=${buyCny ?? "—"}, type=${orderType}`);
  }

  console.log("");
  console.log(`Обновлено фасонов: ${modelsUpdated}`);
  console.log(`Обновлено заказов: ${ordersUpdated}`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
