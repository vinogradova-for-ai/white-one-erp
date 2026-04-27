import { PrismaClient, Prisma } from "@prisma/client";

const prisma = new PrismaClient();

const MODEL_ID = "cmog8hgna0001le04u841ff89";

// Второй заказ — только два цвета
const TABLE: Record<string, Record<string, number>> = {
  "П_037": { "40": 0,  "42": 0,   "44": 40,  "46": 65,  "48": 35,  "50": 15, "52": 25, "54": 25, "56": 20, "58": 10 },
  "П_031": { "40": 45, "42": 105, "44": 165, "46": 150, "48": 150, "50": 70, "52": 65, "54": 60, "56": 25, "58": 45 },
};

async function main() {
  const model = await prisma.productModel.findUnique({
    where: { id: MODEL_ID },
    include: { variants: { where: { deletedAt: null } } },
  });
  if (!model) throw new Error("Фасон не найден");

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

  const owner = await prisma.user.findFirst({ where: { role: "OWNER", isActive: true } });
  if (!owner) throw new Error("Не найден владелец");

  let factoryId: string | null = model.preferredFactoryId;
  if (!factoryId) {
    const f = await prisma.factory.findFirst({ where: { isActive: true } });
    factoryId = f?.id ?? null;
  }

  const year = new Date().getUTCFullYear();
  const last = await prisma.order.findFirst({
    where: { orderNumber: { startsWith: `ORD-${year}-` } },
    orderBy: { orderNumber: "desc" },
    select: { orderNumber: true },
  });
  const lastNum = last ? Number(last.orderNumber.split("-").pop()) : 0;
  const orderNumber = `ORD-${year}-${String(lastNum + 1).padStart(4, "0")}`;

  const d = new Date();
  d.setMonth(d.getMonth() + 5);
  const launchMonth = d.getFullYear() * 100 + (d.getMonth() + 1);

  const totalQty = linesData.reduce((a, l) => a + l.quantity, 0);

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
      lines: { create: linesData.map((l) => ({ ...l, ...snapshot })) },
    },
  });
  await prisma.orderStatusLog.create({
    data: {
      orderId: order.id,
      toStatus: order.status,
      changedById: owner.id,
      comment: "Создание (импорт, второй заказ)",
    },
  });

  console.log("");
  console.log(`✅ Заказ создан: ${order.orderNumber}`);
  console.log(`   id: ${order.id}`);
  console.log(`   Всего штук: ${totalQty}`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
