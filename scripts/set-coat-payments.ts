/**
 * Массово выставляет один платёж 100% постоплата на 1 августа всем
 * заказам пальто и полупальто.
 *
 * Сумма платежа = ProductModel.purchasePriceRub × totalQty заказа.
 * Если у модели нет purchasePriceRub — заказ пропускается с предупреждением.
 *
 * Запуск:
 *   npx tsx scripts/set-coat-payments.ts            # реальная запись
 *   npx tsx scripts/set-coat-payments.ts --dry      # только показать что будет
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const PAY_DATE = new Date(Date.UTC(2026, 7, 1)); // 1 августа 2026
const LABEL = "Постоплата 100%";

async function main() {
  const dryRun = process.argv.includes("--dry");

  // Берём заказы пальто/полупальто, кроме отменённых и проданных
  const orders = await prisma.order.findMany({
    where: {
      deletedAt: null,
      status: { not: "ON_SALE" },
      productModel: {
        OR: [
          { name: { startsWith: "Пальто", mode: "insensitive" } },
          { name: { startsWith: "Полупальто", mode: "insensitive" } },
        ],
      },
    },
    include: {
      productModel: { select: { name: true, purchasePriceRub: true, purchasePriceCny: true, cnyRubRate: true } },
      lines: { select: { quantity: true } },
      payments: { where: { type: "ORDER" }, select: { id: true } },
    },
  });

  console.log(`Найдено заказов пальто/полупальто: ${orders.length}\n`);

  // Берём первого активного юзера для createdById
  const sysUser = await prisma.user.findFirst({
    where: { isActive: true },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true },
  });
  if (!sysUser) {
    console.error("Нет активных пользователей в БД, скрипт не может назначить createdBy");
    process.exit(1);
  }
  console.log(`createdBy = ${sysUser.name}\n`);

  let processed = 0;
  let skipped = 0;
  for (const o of orders) {
    const totalQty = o.lines.reduce((a, l) => a + l.quantity, 0);
    let unitPriceRub = o.productModel.purchasePriceRub ? Number(o.productModel.purchasePriceRub) : null;
    // Запасной путь: cny × rate, если нет рублёвой цены
    if (unitPriceRub === null && o.productModel.purchasePriceCny && o.productModel.cnyRubRate) {
      unitPriceRub = Number(o.productModel.purchasePriceCny) * Number(o.productModel.cnyRubRate);
    }
    if (unitPriceRub === null || totalQty === 0) {
      console.log(`  ⚠ ПРОПУСК ${o.orderNumber} · ${o.productModel.name} — нет purchasePriceRub или qty=0`);
      skipped += 1;
      continue;
    }
    const amount = Math.round(unitPriceRub * totalQty);

    console.log(
      `  ${o.orderNumber} · ${o.productModel.name} · ${totalQty} шт × ${unitPriceRub} ₽ = ${amount.toLocaleString("ru-RU")} ₽` +
      (o.payments.length > 0 ? ` (заменим ${o.payments.length} существующих)` : ""),
    );

    if (!dryRun) {
      await prisma.$transaction(async (tx) => {
        // Удаляем все ORDER-платежи этого заказа
        await tx.payment.deleteMany({ where: { orderId: o.id, type: "ORDER" } });
        // Создаём один новый
        await tx.payment.create({
          data: {
            type: "ORDER",
            status: "PENDING",
            plannedDate: PAY_DATE,
            amount,
            currency: "RUB",
            label: LABEL,
            orderId: o.id,
            factoryId: o.factoryId,
            createdById: sysUser.id,
          },
        });
      });
    }
    processed += 1;
  }

  console.log(`\nИтого: обработано ${processed}, пропущено ${skipped}.`);
  if (dryRun) console.log("DRY-RUN — реальной записи не было.");
}

main()
  .catch((e) => {
    console.error("Ошибка:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
