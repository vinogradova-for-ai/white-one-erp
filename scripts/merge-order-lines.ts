import { PrismaClient, Prisma } from "@prisma/client";

const prisma = new PrismaClient();

const ORDER_NUMBER = "ORD-2026-0001";
const ADDITIONS: Record<string, Record<string, number>> = {
  "П_031": { "40": 45, "42": 105, "44": 165, "46": 150, "48": 150, "50": 70, "52": 65, "54": 60, "56": 25, "58": 45 },
  "П_037": { "40": 0,  "42": 0,   "44": 40,  "46": 65,  "48": 35,  "50": 15, "52": 25, "54": 25, "56": 20, "58": 10 },
};

async function main() {
  const order = await prisma.order.findUnique({
    where: { orderNumber: ORDER_NUMBER },
    include: { lines: { include: { productVariant: true } } },
  });
  if (!order) throw new Error(`Заказ ${ORDER_NUMBER} не найден`);

  for (const [prefix, addDist] of Object.entries(ADDITIONS)) {
    const line = order.lines.find((l) => l.productVariant.sku.startsWith(prefix));
    if (!line) {
      console.warn(`✗ В заказе нет строки ${prefix}`);
      continue;
    }
    const current = (line.sizeDistribution as Record<string, number>) ?? {};
    const merged: Record<string, number> = {};
    const allSizes = new Set([...Object.keys(current), ...Object.keys(addDist)]);
    for (const s of allSizes) {
      merged[s] = (current[s] ?? 0) + (addDist[s] ?? 0);
    }
    const newQty = Object.values(merged).reduce((a, b) => a + b, 0);

    await prisma.orderLine.update({
      where: { id: line.id },
      data: {
        quantity: newQty,
        sizeDistribution: merged as Prisma.InputJsonValue,
      },
    });
    console.log(`✓ ${line.productVariant.sku}: ${line.quantity} → ${newQty} шт`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
