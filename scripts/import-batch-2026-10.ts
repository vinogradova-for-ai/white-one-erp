/**
 * Импорт по скриншоту из чата 2026-05-24:
 *   - Костюм двойка (3 цвета, 1502 шт)
 *   - Брюки атласные бесшовные (4 цвета, 1500 шт)
 *   - Платье ципао (2 цвета, 1500 шт)
 *
 * Создаёт ProductModel + ProductVariant + Order + OrderLine с sizeDistribution.
 * Идемпотентность по name фасона (если уже создавался — берём существующий).
 *
 * Запуск: (set -a; source .env.local; set +a; npx tsx scripts/import-batch-2026-10.ts)
 */
import { PrismaClient, Prisma } from "@prisma/client";

const prisma = new PrismaClient();

const OWNER_EMAIL = "alena@whiteone.ru";
const LAUNCH_MONTH = 202610; // октябрь 2026
const COUNTRY = "Россия";

const GRID_40_48 = "cmoj7drpb0001nrrmwnuzrj46"; // [40,42,44,46,48]
const GRID_40_46 = "cmoj75vey001wnrkq32khvmp7"; // [40,42,44,46]

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
  skuPrefix: string; // например, "КД_03"
  variants: ColorDef[];
};

const BATCH: ModelDef[] = [
  {
    name: "Костюм двойка",
    category: "Костюмы",
    countryOfOrigin: COUNTRY,
    sizeGridId: GRID_40_48,
    defaultSizeProportion: { "40": 6, "42": 22, "44": 26, "46": 26, "48": 19 },
    skuPrefix: "КД_03",
    variants: [
      { colorName: "черный", skuSuffix: "черный", sizeDistribution: { "40": 38, "42": 134, "44": 157, "46": 157, "48": 115 } },
      { colorName: "шоколад", skuSuffix: "шоколад", sizeDistribution: { "40": 38, "42": 134, "44": 157, "46": 157, "48": 115 } },
      { colorName: "зеленый", skuSuffix: "зеленый", sizeDistribution: { "40": 19, "42": 67, "44": 79, "46": 78, "48": 57 } },
    ],
  },
  {
    name: "Брюки атласные бесшовные",
    category: "Брюки",
    countryOfOrigin: COUNTRY,
    sizeGridId: GRID_40_46,
    defaultSizeProportion: { "40": 12, "42": 35, "44": 28, "46": 25 },
    skuPrefix: "БА_01",
    variants: [
      { colorName: "молочный", skuSuffix: "молочный", sizeDistribution: { "40": 63, "42": 184, "44": 147, "46": 131 } },
      { colorName: "шоколад", skuSuffix: "шоколад", sizeDistribution: { "40": 45, "42": 131, "44": 105, "46": 94 } },
      { colorName: "олива", skuSuffix: "олива", sizeDistribution: { "40": 36, "42": 105, "44": 84, "46": 75 } },
      { colorName: "черный", skuSuffix: "черный", sizeDistribution: { "40": 36, "42": 105, "44": 84, "46": 75 } },
    ],
  },
  {
    name: "Платье ципао",
    category: "Платье",
    countryOfOrigin: COUNTRY,
    sizeGridId: GRID_40_46,
    defaultSizeProportion: { "40": 20, "42": 35, "44": 30, "46": 15 },
    skuPrefix: "ЦП_01",
    variants: [
      { colorName: "молочный", skuSuffix: "молочный", sizeDistribution: { "40": 180, "42": 315, "44": 270, "46": 135 } },
      { colorName: "черный", skuSuffix: "черный", sizeDistribution: { "40": 120, "42": 210, "44": 180, "46": 90 } },
    ],
  },
];

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
  // идемпотентность: если фасон с таким именем + категорией уже есть и не удалён — используем его
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

  for (const def of BATCH) {
    console.log(`== ${def.name} ==`);
    const modelId = await ensureModel(def, owner.id);

    // создаём варианты
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

    // создаём заказ
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
        comment: "Создание (импорт из брифа 2026-05-24)",
      },
    });
    console.log(`  ✅ Заказ ${order.orderNumber}: ${totalQty} шт (${lines.length} цвет.)\n`);
  }

  console.log("✅ Импорт завершён");
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
