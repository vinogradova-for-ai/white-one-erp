/**
 * Одноразовый sync: для каждой записи ModelPackaging создаёт недостающие
 * OrderPackaging в открытых заказах этой модели.
 *
 * Зачем: ранее в /api/models/[id]/packaging POST была сломана каскадная
 * пропагация (TS-ошибка `packaging` vs `packagingItems`). Привязки фасонов
 * → упаковки сохранялись, но в существующие заказы они не «протекали»,
 * из-за чего «потребность» в /packaging показывала ноль.
 *
 * Запуск:
 *   npx tsx scripts/sync-model-packaging-to-orders.ts
 *   npx tsx scripts/sync-model-packaging-to-orders.ts --dry  # без записи
 *
 * Идемпотентен: повторный запуск ничего не создаст (skipDuplicates).
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const dryRun = process.argv.includes("--dry");

  console.log(`Режим: ${dryRun ? "DRY-RUN (без записи)" : "REAL (с записью)"}\n`);

  const modelLinks = await prisma.modelPackaging.findMany({
    select: {
      productModelId: true,
      packagingItemId: true,
      quantityPerUnit: true,
      productModel: { select: { name: true } },
      packagingItem: { select: { name: true } },
    },
  });

  console.log(`Привязок ModelPackaging: ${modelLinks.length}\n`);

  // Сгруппируем по productModelId, чтобы один запрос за заказами на модель
  const byModel = new Map<string, typeof modelLinks>();
  for (const ml of modelLinks) {
    const arr = byModel.get(ml.productModelId) ?? [];
    arr.push(ml);
    byModel.set(ml.productModelId, arr);
  }

  let totalCreated = 0;
  let totalSkipped = 0;
  const perModelStats: Array<{ model: string; created: number; existed: number }> = [];

  for (const [productModelId, links] of byModel) {
    const orders = await prisma.order.findMany({
      where: {
        productModelId,
        deletedAt: null,
        status: { not: "ON_SALE" },
      },
      select: {
        id: true,
        orderNumber: true,
        packagingItems: { select: { packagingItemId: true } },
      },
    });

    if (orders.length === 0) continue;

    let createdForModel = 0;
    let existedForModel = 0;
    const toCreate: Array<{ orderId: string; packagingItemId: string; quantityPerUnit: number }> = [];

    for (const link of links) {
      for (const order of orders) {
        const already = order.packagingItems.some((p) => p.packagingItemId === link.packagingItemId);
        if (already) {
          existedForModel += 1;
        } else {
          toCreate.push({
            orderId: order.id,
            packagingItemId: link.packagingItemId,
            quantityPerUnit: Number(link.quantityPerUnit),
          });
          createdForModel += 1;
        }
      }
    }

    if (toCreate.length > 0 && !dryRun) {
      await prisma.orderPackaging.createMany({ data: toCreate, skipDuplicates: true });
    }

    totalCreated += createdForModel;
    totalSkipped += existedForModel;

    if (createdForModel > 0) {
      const modelName = links[0].productModel.name;
      perModelStats.push({ model: modelName, created: createdForModel, existed: existedForModel });
    }
  }

  console.log("Модели, в которых добавлены записи:");
  perModelStats.sort((a, b) => b.created - a.created);
  for (const s of perModelStats) {
    console.log(`  ${s.model}: создано ${s.created} (уже было ${s.existed})`);
  }

  console.log(`\nИтого:`);
  console.log(`  Создано связок OrderPackaging: ${totalCreated}`);
  console.log(`  Уже существовало (пропущено): ${totalSkipped}`);
  if (dryRun) {
    console.log(`\nЭто был DRY-RUN. Запусти без --dry чтобы реально записать.`);
  }
}

main()
  .catch((e) => {
    console.error("Ошибка:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
