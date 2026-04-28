/**
 * Импортирует фасоны / цветомодели / заказы из JSON-файла.
 * JSON-формат: см. parse_orders.py.
 */
import { PrismaClient, Prisma, type DeliveryMethod } from "@prisma/client";
import fs from "node:fs";
import path from "node:path";

const prisma = new PrismaClient();

type Variant = {
  sku: string;
  colorName: string;
  colorCode: string;
  sizes: Record<string, number>;
  totalQty: number;
};

type Block = {
  modelName: string;
  factory: string;
  deliveryMethod?: DeliveryMethod;
  sizes: string[];
  variants: Variant[];
};

async function getOrCreateSizeGrid(sizes: string[]) {
  const existing = await prisma.sizeGrid.findMany();
  for (const sg of existing) {
    if (sg.sizes.length === sizes.length && sg.sizes.every((s, i) => s === sizes[i])) {
      return sg;
    }
  }
  const name = `${sizes[0]}-${sizes[sizes.length - 1]} (${sizes.length})`;
  return prisma.sizeGrid.create({ data: { name, sizes } });
}

async function getOrCreateFactory(name: string) {
  const f = await prisma.factory.findFirst({ where: { name } });
  if (f) return f;
  // Эвристика страны по названию — РФ если в имени есть «Пальто/Россия», иначе Китай
  const country = /палыто|россия|росси|производство пальто/i.test(name) ? "Россия" : "Китай";
  return prisma.factory.create({ data: { name, country, isActive: true } });
}

async function nextOrderNumber() {
  const year = new Date().getUTCFullYear();
  const last = await prisma.order.findFirst({
    where: { orderNumber: { startsWith: `ORD-${year}-` } },
    orderBy: { orderNumber: "desc" },
    select: { orderNumber: true },
  });
  const lastNum = last ? Number(last.orderNumber.split("-").pop()) : 0;
  return `ORD-${year}-${String(lastNum + 1).padStart(4, "0")}`;
}

async function importBlock(blk: Block, owner: { id: string }) {
  // Фасон: ищем по name. Если есть — пропускаем (значит уже импортировали).
  let model = await prisma.productModel.findFirst({
    where: { name: blk.modelName, deletedAt: null },
  });
  if (model) {
    console.log(`⊙ ${blk.modelName} — уже есть, пропуск`);
    return null;
  }
  const factory = await getOrCreateFactory(blk.factory);
  const sizeGrid = await getOrCreateSizeGrid(blk.sizes);

  model = await prisma.productModel.create({
    data: {
      name: blk.modelName,
      category: "WOMEN_OUTERWEAR",
      sizeGridId: sizeGrid.id,
      preferredFactoryId: factory.id,
      ownerId: owner.id,
      countryOfOrigin:
        blk.factory.toLowerCase().includes("китай") || blk.factory.toLowerCase().includes("брюки") || blk.factory.toLowerCase().includes("гуанчжоу") || blk.factory.toLowerCase().includes("пуфин")
          ? "Китай"
          : "Россия",
    },
  });

  // Размерные доли по варианту = доля размера в общем количестве варианта
  for (const v of blk.variants) {
    const sumQ = Object.values(v.sizes).reduce((a, b) => a + b, 0) || 1;
    const proportion: Record<string, number> = {};
    for (const [s, q] of Object.entries(v.sizes)) {
      proportion[s] = Math.round((q / sumQ) * 100);
    }
    // SKU должен быть уникальным глобально. Если совпадает с существующим — добавим суффикс _2, _3...
    let candidate = v.sku.slice(0, 90);
    let suffix = 1;
    while (await prisma.productVariant.findFirst({ where: { sku: candidate } })) {
      suffix++;
      candidate = `${v.sku.slice(0, 88)}_${suffix}`;
    }
    await prisma.productVariant.create({
      data: {
        productModelId: model.id,
        sku: candidate,
        colorName: v.colorName || v.sku,
        fabricColorCode: v.colorCode || null,
        photoUrls: [],
        defaultSizeProportion: proportion as Prisma.InputJsonValue,
        status: "READY_TO_ORDER",
      },
    });
    v.sku = candidate; // запомним фактический SKU для линков заказа
  }

  // Заказ
  const orderNumber = await nextOrderNumber();
  const d = new Date();
  d.setMonth(d.getMonth() + 5);
  const launchMonth = d.getFullYear() * 100 + (d.getMonth() + 1);

  const variants = await prisma.productVariant.findMany({
    where: { productModelId: model.id, deletedAt: null },
  });
  const skuToId = new Map(variants.map((vv) => [vv.sku, vv.id]));

  const linesData = blk.variants
    .map((v) => {
      const id = skuToId.get(v.sku);
      if (!id) return null;
      return {
        productVariantId: id,
        quantity: v.totalQty,
        sizeDistribution: v.sizes as Prisma.InputJsonValue,
      };
    })
    .filter(Boolean) as Array<{
      productVariantId: string;
      quantity: number;
      sizeDistribution: Prisma.InputJsonValue;
    }>;

  const order = await prisma.order.create({
    data: {
      orderNumber,
      productModelId: model.id,
      ownerId: owner.id,
      factoryId: factory.id,
      orderType: "SEASONAL",
      launchMonth,
      paymentTerms: "30/70",
      status: "PREPARATION",
      deliveryMethod: blk.deliveryMethod ?? null,
      lines: { create: linesData },
    },
  });
  await prisma.orderStatusLog.create({
    data: {
      orderId: order.id,
      toStatus: order.status,
      changedById: owner.id,
      comment: "Импорт из xlsx",
    },
  });
  console.log(`✓ ${blk.modelName} (${order.orderNumber}): ${blk.variants.length} цветов, ${linesData.reduce((a, l) => a + l.quantity, 0)} шт`);
  return order;
}

async function main() {
  const src = process.argv[2];
  if (!src) throw new Error("Передай путь к JSON: tsx scripts/import-from-json.ts <file>");
  const json: Block[] = JSON.parse(fs.readFileSync(path.resolve(src), "utf-8"));
  const owner = await prisma.user.findFirst({ where: { role: "OWNER", isActive: true } });
  if (!owner) throw new Error("Владелец не найден");
  console.log(`Импортирую ${json.length} фасонов из ${src}`);
  let count = 0;
  for (const blk of json) {
    const r = await importBlock(blk, owner);
    if (r) count++;
  }
  console.log(`\n✅ Создано ${count} фасонов с заказами`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
