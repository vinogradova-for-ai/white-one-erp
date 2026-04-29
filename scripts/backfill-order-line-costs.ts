/**
 * Бэкфилл себестоимости в OrderLine: для линий где snapshotFullCost = null,
 * проставляет fullCost модели (таргетная себестоимость), и пересчитывает
 * batchCost / plannedRevenue / plannedMargin.
 *
 * Логика автоподстановки таргета на NEW заказах уже работает в
 * /api/orders POST (effectiveUnitCost = data.unitCost ?? model.fullCost).
 * Этот скрипт лечит ИСТОРИЮ.
 *
 *   npx tsx scripts/backfill-order-line-costs.ts            # реальная запись
 *   npx tsx scripts/backfill-order-line-costs.ts --dry      # только preview
 */
import { Prisma, PrismaClient } from "@prisma/client";
import { calculateOrderEconomics } from "../src/lib/calculations/product-cost";

const prisma = new PrismaClient();

async function main() {
  const dryRun = process.argv.includes("--dry");

  const lines = await prisma.orderLine.findMany({
    where: { snapshotFullCost: null },
    include: {
      order: {
        select: {
          id: true,
          orderNumber: true,
          deletedAt: true,
          productModel: {
            select: {
              id: true,
              name: true,
              fullCost: true,
              wbPrice: true,
              customerPrice: true,
              wbCommissionPct: true,
              drrPct: true,
              plannedRedemptionPct: true,
            },
          },
        },
      },
    },
  });

  console.log(`Линий без snapshotFullCost: ${lines.length}\n`);

  let updated = 0;
  let skipped = 0;

  for (const l of lines) {
    if (l.order.deletedAt) {
      skipped += 1;
      continue;
    }
    const fullCost = l.order.productModel.fullCost;
    if (fullCost == null) {
      console.log(`  ⚠ ${l.order.orderNumber} · ${l.order.productModel.name} — у фасона нет fullCost, пропускаем`);
      skipped += 1;
      continue;
    }
    const eco = calculateOrderEconomics(
      { ...l.order.productModel, fullCost },
      l.quantity,
    );
    console.log(
      `  ${l.order.orderNumber} · ${l.order.productModel.name} · ${l.quantity} шт — ` +
      `unit=${Number(fullCost)} ₽, batch=${eco.batchCost}`,
    );
    if (!dryRun) {
      await prisma.orderLine.update({
        where: { id: l.id },
        data: {
          snapshotFullCost: fullCost,
          snapshotWbPrice: l.order.productModel.wbPrice,
          snapshotCustomerPrice: l.order.productModel.customerPrice,
          snapshotWbCommissionPct: l.order.productModel.wbCommissionPct,
          snapshotDrrPct: l.order.productModel.drrPct,
          snapshotRedemptionPct: l.order.productModel.plannedRedemptionPct,
          batchCost: eco.batchCost != null ? new Prisma.Decimal(eco.batchCost) : null,
          plannedRevenue: eco.plannedRevenue != null ? new Prisma.Decimal(eco.plannedRevenue) : null,
          plannedMargin: eco.plannedMargin != null ? new Prisma.Decimal(eco.plannedMargin) : null,
        },
      });
    }
    updated += 1;
  }

  console.log(`\nИтого: обновлено ${updated}, пропущено ${skipped}.`);
  if (dryRun) console.log("DRY-RUN — реальной записи не было.");
}

main()
  .catch((e) => {
    console.error("Ошибка:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
