/**
 * Импорт по двум скриншотам из чата 2026-05-24 (партия 2, 6 фасонов):
 *   - Костюм двойка полоска   (3 цвета, 2202 шт)
 *   - Брюки алладины          (4 цвета, 2000 шт)
 *   - Сарафан летний античный (3 цвета, 2200 шт)
 *   - Сарафан летний с воланами (3 цвета, 1500 шт)
 *   - Костюм двойка Асель     (2 цвета, ONE SIZE, 1500 шт)
 *   - Костюм летний с шортами (2 цвета, 1500 шт)
 *
 * Идемпотентен: фасон ищется по name+category, вариант — по sku.
 * Размерные сетки S-XL и ONE SIZE создаются если нет.
 *
 * Запуск: (set -a; source .env.local; set +a; npx tsx scripts/import-batch-2026-10-part2.ts)
 */
import { PrismaClient, Prisma } from "@prisma/client";

const prisma = new PrismaClient();

const OWNER_EMAIL = "alena@whiteone.ru";
const LAUNCH_MONTH = 202610;
const COUNTRY = "Россия";

// существующие сетки
const GRID_42_52 = "cmofyvcwi0001nrn7ig0t0pd2"; // [42,44,46,48,50,52]
const GRID_40_48 = "cmoj7drpb0001nrrmwnuzrj46"; // [40,42,44,46,48]
const GRID_42_48 = "cmoj75s9d0014nrkqmkgqtbqs"; // [42,44,46,48]
// будут созданы при первом запуске:
const GRID_S_XL_NAME = "S-XL (4)";
const GRID_ONE_SIZE_NAME = "ONE SIZE";

type ColorDef = {
  colorName: string;
  skuSuffix: string;
  sizeDistribution: Record<string, number>;
};

type ModelDef = {
  name: string;
  category: string;
  countryOfOrigin: string;
  sizeGridId: string;
  defaultSizeProportion: Record<string, number>;
  skuPrefix: string;
  variants: ColorDef[];
};

async function ensureSizeGrid(name: string, sizes: string[]): Promise<string> {
  const existing = await prisma.sizeGrid.findUnique({ where: { name }, select: { id: true } });
  if (existing) return existing.id;
  const created = await prisma.sizeGrid.create({
    data: { name, sizes },
    select: { id: true },
  });
  console.log(`+ SizeGrid создана: ${name} [${sizes.join(",")}] → ${created.id}`);
  return created.id;
}

async function nextOrderNumber(): Promise<string> {
  const year = new Date().getUTCFullYear();
  const last = await prisma.order.findFirst({
    where: { orderNumber: { startsWith: `ORD-${year}-` } },
    orderBy: { orderNumber: "desc" },
    select: { orderNumber: true },
  });
  const lastNum = last ? Number(last.orderNumber.split("-").pop()) : 0;
  return `ORD-${year}-${String(lastNum + 1).padStart(4, "0")}`;
}

async function ensureModel(def: ModelDef, ownerId: string): Promise<string> {
  const existing = await prisma.productModel.findFirst({
    where: { name: def.name, category: def.category, deletedAt: null },
    select: { id: true },
  });
  if (existing) {
    console.log(`  ↺ Фасон уже есть: ${def.name} (${existing.id})`);
    return existing.id;
  }
  const created = await prisma.productModel.create({
    data: {
      name: def.name,
      brand: "WHITE_ONE",
      category: def.category,
      countryOfOrigin: def.countryOfOrigin,
      sizeGridId: def.sizeGridId,
      defaultSizeProportion: def.defaultSizeProportion as Prisma.InputJsonValue,
      ownerId,
      status: "IDEA",
      activated: true,
      photoUrls: [],
      packagingCost: 0,
      wbLogisticsCost: 0,
      wbCommissionPct: 0,
      drrPct: 0,
    },
    select: { id: true },
  });
  console.log(`  ✓ Фасон создан: ${def.name} (${created.id})`);
  return created.id;
}

async function ensureVariant(
  modelId: string,
  def: ColorDef,
  skuPrefix: string,
): Promise<{ id: string; sku: string }> {
  const sku = `${skuPrefix}_${def.skuSuffix}`;
  const existing = await prisma.productVariant.findUnique({
    where: { sku },
    select: { id: true, sku: true, deletedAt: true },
  });
  if (existing && existing.deletedAt === null) {
    console.log(`    ↺ Вариант уже есть: ${sku}`);
    return { id: existing.id, sku };
  }
  const created = await prisma.productVariant.create({
    data: {
      productModelId: modelId,
      sku,
      colorName: def.colorName,
      photoUrls: [],
      status: "READY_TO_ORDER",
    },
    select: { id: true, sku: true },
  });
  console.log(`    ✓ Вариант создан: ${sku}`);
  return created;
}

async function main() {
  const owner = await prisma.user.findUnique({
    where: { email: OWNER_EMAIL },
    select: { id: true, name: true },
  });
  if (!owner) throw new Error(`Пользователь не найден: ${OWNER_EMAIL}`);
  console.log(`Owner: ${owner.name} (${owner.id})\n`);

  const GRID_S_XL = await ensureSizeGrid(GRID_S_XL_NAME, ["S", "M", "L", "XL"]);
  const GRID_ONE_SIZE = await ensureSizeGrid(GRID_ONE_SIZE_NAME, ["ONE SIZE"]);

  const BATCH: ModelDef[] = [
    {
      name: "Костюм двойка полоска",
      category: "Костюмы",
      countryOfOrigin: COUNTRY,
      sizeGridId: GRID_42_52,
      defaultSizeProportion: { "42": 15, "44": 17, "46": 21, "48": 18, "50": 16, "52": 13 },
      skuPrefix: "КДП_01",
      variants: [
        { colorName: "молочный", skuSuffix: "молочный", sizeDistribution: { "42": 132, "44": 150, "46": 185, "48": 158, "50": 141, "52": 114 } },
        { colorName: "шоколад",  skuSuffix: "шоколад",  sizeDistribution: { "42": 99,  "44": 112, "46": 139, "48": 119, "50": 106, "52": 86 } },
        { colorName: "голубой",  skuSuffix: "голубой",  sizeDistribution: { "42": 99,  "44": 112, "46": 139, "48": 119, "50": 106, "52": 86 } },
      ],
    },
    {
      name: "Брюки алладины",
      category: "Брюки",
      countryOfOrigin: COUNTRY,
      sizeGridId: GRID_40_48,
      defaultSizeProportion: { "40": 10, "42": 27, "44": 24, "46": 24, "48": 15 },
      skuPrefix: "БАЛ_01",
      variants: [
        { colorName: "черный",  skuSuffix: "черный",  sizeDistribution: { "40": 50, "42": 135, "44": 120, "46": 120, "48": 75 } },
        { colorName: "зеленый", skuSuffix: "зеленый", sizeDistribution: { "40": 50, "42": 135, "44": 120, "46": 120, "48": 75 } },
        { colorName: "шоколад", skuSuffix: "шоколад", sizeDistribution: { "40": 50, "42": 135, "44": 120, "46": 120, "48": 75 } },
        { colorName: "мокко",   skuSuffix: "мокко",   sizeDistribution: { "40": 50, "42": 135, "44": 120, "46": 120, "48": 75 } },
      ],
    },
    {
      name: "Сарафан летний античный",
      category: "Сарафаны",
      countryOfOrigin: COUNTRY,
      sizeGridId: GRID_S_XL,
      defaultSizeProportion: { S: 20, M: 30, L: 30, XL: 20 },
      skuPrefix: "САА_01",
      variants: [
        { colorName: "черный",  skuSuffix: "черный",  sizeDistribution: { S: 132, M: 198, L: 198, XL: 132 } },
        { colorName: "белый",   skuSuffix: "белый",   sizeDistribution: { S: 176, M: 264, L: 264, XL: 176 } },
        { colorName: "зеленый", skuSuffix: "зеленый", sizeDistribution: { S: 132, M: 198, L: 198, XL: 132 } },
      ],
    },
    {
      name: "Сарафан летний с воланами",
      category: "Сарафаны",
      countryOfOrigin: COUNTRY,
      sizeGridId: GRID_S_XL,
      defaultSizeProportion: { S: 20, M: 30, L: 30, XL: 20 },
      skuPrefix: "САВ_01",
      variants: [
        { colorName: "молочный", skuSuffix: "молочный", sizeDistribution: { S: 120, M: 180, L: 180, XL: 120 } },
        { colorName: "черный",   skuSuffix: "черный",   sizeDistribution: { S: 90,  M: 135, L: 135, XL: 90 } },
        { colorName: "белый",    skuSuffix: "белый",    sizeDistribution: { S: 90,  M: 135, L: 135, XL: 90 } },
      ],
    },
    {
      name: "Костюм двойка Асель",
      category: "Костюмы",
      countryOfOrigin: COUNTRY,
      sizeGridId: GRID_ONE_SIZE,
      defaultSizeProportion: { "ONE SIZE": 100 },
      skuPrefix: "КДА_01",
      variants: [
        { colorName: "капучино", skuSuffix: "капучино", sizeDistribution: { "ONE SIZE": 750 } },
        { colorName: "голубой",  skuSuffix: "голубой",  sizeDistribution: { "ONE SIZE": 750 } },
      ],
    },
    {
      name: "Костюм летний с шортами",
      category: "Костюмы",
      countryOfOrigin: COUNTRY,
      sizeGridId: GRID_42_48,
      defaultSizeProportion: { "42": 26, "44": 32, "46": 28, "48": 14 },
      skuPrefix: "КЛШ_01",
      variants: [
        { colorName: "капучино", skuSuffix: "капучино", sizeDistribution: { "42": 195, "44": 240, "46": 205, "48": 110 } },
        { colorName: "молочный", skuSuffix: "молочный", sizeDistribution: { "42": 195, "44": 240, "46": 205, "48": 110 } },
      ],
    },
  ];

  for (const def of BATCH) {
    console.log(`== ${def.name} ==`);
    const modelId = await ensureModel(def, owner.id);

    const lines: Array<{ productVariantId: string; quantity: number; sizeDistribution: Prisma.InputJsonValue }> = [];
    for (const v of def.variants) {
      const variant = await ensureVariant(modelId, v, def.skuPrefix);
      const quantity = Object.values(v.sizeDistribution).reduce((a, b) => a + b, 0);
      lines.push({
        productVariantId: variant.id,
        quantity,
        sizeDistribution: v.sizeDistribution as Prisma.InputJsonValue,
      });
    }

    const totalQty = lines.reduce((a, l) => a + l.quantity, 0);
    const orderNumber = await nextOrderNumber();
    const order = await prisma.order.create({
      data: {
        orderNumber,
        productModelId: modelId,
        ownerId: owner.id,
        orderType: "SEASONAL",
        launchMonth: LAUNCH_MONTH,
        status: "PREPARATION",
        lines: { create: lines },
      },
      select: { id: true, orderNumber: true },
    });
    await prisma.orderStatusLog.create({
      data: {
        orderId: order.id,
        toStatus: "PREPARATION",
        changedById: owner.id,
        comment: "Создание (импорт из брифа 2026-05-24, партия 2)",
      },
    });
    console.log(`  ✅ Заказ ${order.orderNumber}: ${totalQty} шт (${lines.length} цвет.)\n`);
  }

  console.log("✅ Импорт партии 2 завершён");
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
