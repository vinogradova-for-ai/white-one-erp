/**
 * Дофиксация курса оплаты карго: у всех оплаченных карго без курса
 * подтягивает курс ЦБ USD на дату оплаты и записывает в usdRubRate.
 * Идемпотентно. Запуск: DATABASE_URL=... npx tsx scripts/fix-cargo-rates.ts
 */
import { prisma } from "../src/lib/prisma";
import { getCbrRate } from "../src/server/currency-rates";

async function main() {
  const ships = await prisma.shipment.findMany({
    where: { cargoNumber: { not: null }, cargoPaidAt: { not: null }, usdRubRate: null, deletedAt: null },
  });
  for (const s of ships) {
    try {
      const rate = await getCbrRate("USD", s.cargoPaidAt!);
      await prisma.shipment.update({ where: { id: s.id }, data: { usdRubRate: rate } });
      console.log(s.cargoNumber, s.cargoPaidAt!.toISOString().slice(0, 10), "→", rate);
    } catch (e) {
      console.log(s.cargoNumber, "FAIL", (e as Error).message);
    }
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
