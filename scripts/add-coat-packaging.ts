/**
 * Добавляет к каждому фасону пальто/полупальто:
 *   - 1 вешалку (PackagingItem с name LIKE %вешалк%)
 *   - 1 бумажную бирку (PackagingItem с name LIKE %бумажн%бирк% или %бирк%)
 *
 * После добавления ModelPackaging — каскадно создаёт OrderPackaging
 * для всех открытых заказов этих моделей (status NOT IN [ON_SALE]).
 *
 * Идемпотентно: повторный запуск ничего не задвоит.
 *
 *   npx tsx scripts/add-coat-packaging.ts          # реальная запись
 *   npx tsx scripts/add-coat-packaging.ts --dry    # только preview
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function findPackaging(query: string, exclude: string[] = []) {
  const items = await prisma.packagingItem.findMany({
    where: {
      isActive: true,
      AND: query.split("%").filter(Boolean).map((part) => ({
        name: { contains: part, mode: "insensitive" as const },
      })),
    },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  return items.filter((it) => !exclude.includes(it.id));
}

async function main() {
  const dryRun = process.argv.includes("--dry");

  // 1. Вешалка
  const hangers = await findPackaging("вешалк");
  if (hangers.length === 0) {
    console.error("❌ Не нашла ни одной активной упаковки с «вешалк» в названии");
    process.exit(1);
  }
  const hanger = hangers[0];
  console.log(`Вешалка: ${hanger.name} (${hanger.id})`);
  if (hangers.length > 1) {
    console.log(`  Альтернативы: ${hangers.slice(1).map((h) => h.name).join(", ")}`);
  }

  // 2. Бумажная бирка
  let tags = await findPackaging("бумажн%бирк");
  if (tags.length === 0) {
    console.log("Не нашла «бумажная бирка», ищу любую бирку…");
    tags = await findPackaging("бирк");
  }
  if (tags.length === 0) {
    console.error("❌ Не нашла ни одной активной упаковки-бирки");
    process.exit(1);
  }
  const tag = tags[0];
  console.log(`Бирка: ${tag.name} (${tag.id})`);
  if (tags.length > 1) {
    console.log(`  Альтернативы: ${tags.slice(1).map((t) => t.name).join(", ")}`);
  }

  console.log();

  // 3. Все фасоны пальто и полупальто
  const models = await prisma.productModel.findMany({
    where: {
      deletedAt: null,
      OR: [
        { name: { startsWith: "Пальто", mode: "insensitive" } },
        { name: { startsWith: "Полупальто", mode: "insensitive" } },
      ],
    },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  console.log(`Фасонов пальто/полупальто: ${models.length}\n`);

  const packToAdd = [
    { id: hanger.id, label: hanger.name },
    { id: tag.id, label: tag.name },
  ];

  let modelLinksCreated = 0;
  let modelLinksSkipped = 0;
  let orderPackagingCreated = 0;

  for (const model of models) {
    // Какие ModelPackaging уже привязаны
    const existing = await prisma.modelPackaging.findMany({
      where: { productModelId: model.id, packagingItemId: { in: packToAdd.map((p) => p.id) } },
      select: { packagingItemId: true },
    });
    const existingIds = new Set(existing.map((e) => e.packagingItemId));

    const toAddForModel = packToAdd.filter((p) => !existingIds.has(p.id));

    if (toAddForModel.length === 0) {
      console.log(`  ✓ ${model.name} — уже всё привязано`);
      modelLinksSkipped += packToAdd.length;
      continue;
    }

    console.log(`  + ${model.name}: ${toAddForModel.map((p) => p.label).join(", ")}`);

    if (!dryRun) {
      await prisma.modelPackaging.createMany({
        data: toAddForModel.map((p) => ({
          productModelId: model.id,
          packagingItemId: p.id,
          quantityPerUnit: 1,
        })),
        skipDuplicates: true,
      });
    }
    modelLinksCreated += toAddForModel.length;
    modelLinksSkipped += packToAdd.length - toAddForModel.length;

    // Каскад в открытые заказы
    const openOrders = await prisma.order.findMany({
      where: {
        productModelId: model.id,
        deletedAt: null,
        status: { not: "ON_SALE" },
      },
      select: {
        id: true,
        packagingItems: { select: { packagingItemId: true } },
      },
    });

    const orderToCreate: Array<{ orderId: string; packagingItemId: string; quantityPerUnit: number }> = [];
    for (const o of openOrders) {
      const have = new Set(o.packagingItems.map((x) => x.packagingItemId));
      for (const p of packToAdd) {
        if (have.has(p.id)) continue;
        orderToCreate.push({ orderId: o.id, packagingItemId: p.id, quantityPerUnit: 1 });
      }
    }

    if (orderToCreate.length > 0 && !dryRun) {
      await prisma.orderPackaging.createMany({
        data: orderToCreate,
        skipDuplicates: true,
      });
    }
    orderPackagingCreated += orderToCreate.length;
  }

  console.log();
  console.log(`Итого:`);
  console.log(`  ModelPackaging создано: ${modelLinksCreated}`);
  console.log(`  ModelPackaging уже было:  ${modelLinksSkipped}`);
  console.log(`  OrderPackaging создано: ${orderPackagingCreated} (по открытым заказам)`);
  if (dryRun) console.log(`\nDRY-RUN — реальной записи не было.`);
}

main()
  .catch((e) => {
    console.error("Ошибка:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
