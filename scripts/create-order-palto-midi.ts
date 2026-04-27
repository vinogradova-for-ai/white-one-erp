import { PrismaClient, Prisma } from "@prisma/client";

const prisma = new PrismaClient();

const MODEL_ID = "cmog8hgna0001le04u841ff89";

// Из таблицы Алёны: ключ — префикс артикула, значения — кол-во по размерам 40..58
const TABLE: Record<string, Record<string, number>> = {
  "П_031": { "40": 25,  "42": 60,  "44": 80,  "46": 80,  "48": 65, "50": 50, "52": 40, "54": 40, "56": 30, "58": 30 },
  "П_037": { "40": 25,  "42": 60,  "44": 80,  "46": 80,  "48": 65, "50": 50, "52": 40, "54": 40, "56": 30, "58": 30 },
  "П_038": { "40": 250, "42": 540, "44": 850, "46": 780, "48": 540, "50": 280, "52": 260, "54": 200, "56": 130, "58": 110 },
  "П_023": { "40": 0,   "42": 25,  "44": 100, "46": 115, "48": 85, "50": 65, "52": 60, "54": 55, "56": 25, "58": 20 },
  "П_035": { "40": 165, "42": 295, "44": 440, "46": 345, "48": 260, "50": 130, "52": 115, "54": 115, "56": 60, "58": 55 },
  "П_036": { "40": 45,  "42": 90,  "44": 100, "46": 125, "48": 60, "50": 60, "52": 10, "54": 10, "56": 35, "58": 10 },
  "П_039": { "40": 90,  "42": 180, "44": 260, "46": 250, "48": 185, "50": 120, "52": 115, "54": 105, "56": 65, "58": 50 },
  "П_040": { "40": 90,  "42": 190, "44": 275, "46": 265, "48": 200, "50": 130, "52": 120, "54": 105, "56": 70, "58": 60 },
};

async function main() {
  // 1. Берём фасон, его сетку
  const model = await prisma.productModel.findUnique({
    where: { id: MODEL_ID },
    include: { sizeGrid: true, variants: { where: { deletedAt: null } } },
  });
  if (!model) throw new Error("Фасон не найден");
  if (!model.sizeGrid) throw new Error("У фасона нет размерной сетки");

  // 2. Если в сетке нет «40» — добавляем
  const sizes = [...model.sizeGrid.sizes];
  if (!sizes.includes("40")) {
    const newSizes = ["40", ...sizes].sort((a, b) => Number(a) - Number(b));
    await prisma.sizeGrid.update({
      where: { id: model.sizeGrid.id },
      data: { sizes: newSizes },
    });
    console.log(`✓ Размер 40 добавлен в сетку «${model.sizeGrid.name}». Размеры теперь: ${newSizes.join(", ")}`);
  }

  // 3. Сопоставляем варианты с префиксами
  const linesData = [];
  for (const [prefix, dist] of Object.entries(TABLE)) {
    const variant = model.variants.find((v) => v.sku.startsWith(prefix));
    if (!variant) {
      console.warn(`✗ Нет варианта с префиксом ${prefix}`);
      continue;
    }
    const quantity = Object.values(dist).reduce((a, b) => a + b, 0);
    linesData.push({
      productVariantId: variant.id,
      quantity,
      sizeDistribution: dist as Prisma.InputJsonValue,
    });
    console.log(`✓ ${variant.sku} (${variant.colorName}): ${quantity} шт`);
  }

  if (linesData.length === 0) throw new Error("Не подобран ни один вариант");

  // 4. Берём владельца — алёна, фабрику — preferred у фасона или первая активная
  const owner = await prisma.user.findFirst({ where: { role: "OWNER", isActive: true } });
  if (!owner) throw new Error("Не найден владелец");

  let factoryId: string | null = model.preferredFactoryId;
  if (!factoryId) {
    const f = await prisma.factory.findFirst({ where: { isActive: true } });
    factoryId = f?.id ?? null;
  }

  // 5. Номер заказа — формат ORD-YYYY-####
  const year = new Date().getUTCFullYear();
  const last = await prisma.order.findFirst({
    where: { orderNumber: { startsWith: `ORD-${year}-` } },
    orderBy: { orderNumber: "desc" },
    select: { orderNumber: true },
  });
  const lastNum = last ? Number(last.orderNumber.split("-").pop()) : 0;
  const orderNumber = `ORD-${year}-${String(lastNum + 1).padStart(4, "0")}`;

  // 6. launchMonth — текущий + 5 мес как YYYYMM
  const d = new Date();
  d.setMonth(d.getMonth() + 5);
  const launchMonth = d.getFullYear() * 100 + (d.getMonth() + 1);

  const totalQty = linesData.reduce((a, l) => a + l.quantity, 0);

  // Снимки экономики из фасона — копируются в каждую строку
  const snapshot = {
    snapshotFullCost: model.fullCost ?? null,
    snapshotWbPrice: model.wbPrice ?? null,
    snapshotCustomerPrice: model.customerPrice ?? null,
    snapshotWbCommissionPct: model.wbCommissionPct ?? null,
    snapshotDrrPct: model.drrPct ?? null,
    snapshotRedemptionPct: model.plannedRedemptionPct ?? null,
  };

  const order = await prisma.order.create({
    data: {
      orderNumber,
      productModelId: MODEL_ID,
      ownerId: owner.id,
      factoryId,
      orderType: "SEASONAL",
      launchMonth,
      paymentTerms: "30/70",
      status: "PREPARATION",
      lines: {
        create: linesData.map((l) => ({ ...l, ...snapshot })),
      },
    },
  });

  await prisma.orderStatusLog.create({
    data: {
      orderId: order.id,
      toStatus: order.status,
      changedById: owner.id,
      comment: "Создание (импорт)",
    },
  });

  console.log("");
  console.log(`✅ Заказ создан: ${order.orderNumber}`);
  console.log(`   id: ${order.id}`);
  console.log(`   Всего штук: ${totalQty}`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
