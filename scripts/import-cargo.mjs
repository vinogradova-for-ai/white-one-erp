// Импорт карго-накладных из scripts/data/cargo-2026-07.json (лист «КАРГО»
// Excel-матрицы) в поставки (Shipment). Идемпотентно: upsert по cargoNumber —
// повторный запуск обновляет поля, ничего не дублируя. Партии/заказы НЕ трогает.
//
// Запуск:  node scripts/import-cargo.mjs            (БД из DATABASE_URL/.env)
import { PrismaClient } from "@prisma/client";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const prisma = new PrismaClient();
const data = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), "data/cargo-2026-07.json"), "utf8"),
);

async function nextShipmentNumber(tx, year, taken) {
  const last = await tx.shipment.findFirst({
    where: { number: { startsWith: `SHP-${year}-` } },
    orderBy: { number: "desc" },
    select: { number: true },
  });
  let n = last ? Number(last.number.split("-").pop()) : 0;
  // taken — номера, выданные в этом же прогоне (в БД их ещё нет на момент findFirst)
  while (taken.has(n + 1)) n++;
  taken.add(n + 1);
  return `SHP-${year}-${String(n + 1).padStart(4, "0")}`;
}

const d = (s) => (s ? new Date(`${s}T00:00:00Z`) : null);

const owner = await prisma.user.findFirst({
  where: { role: "OWNER", isActive: true },
  select: { id: true, name: true },
});
if (!owner) throw new Error("Не нашла активного OWNER для createdBy");

let created = 0;
let updated = 0;
const taken = new Set();

for (const c of data) {
  const fields = {
    placesCount: c.placesCount,
    weightKg: c.weightKg,
    amountUsdt: c.amountUsdt,
    cargoPaidAt: c.paid ? (d(c.arrivalActual) ?? d(c.depart) ?? new Date()) : null,
    arrivalActualDate: d(c.arrivalActual),
    departDate: d(c.depart),
    arriveDate: d(c.arrivePlan),
    status: c.status, // ARRIVED | IN_TRANSIT (ShipmentStatus)
    carrier: "Карго Китай",
    comment: c.items.join("; ") || null,
  };
  const existing = await prisma.shipment.findUnique({ where: { cargoNumber: c.cargoNumber } });
  if (existing) {
    await prisma.shipment.update({ where: { id: existing.id }, data: fields });
    updated++;
  } else {
    const year = Number((c.depart ?? "2026").slice(0, 4));
    const number = await nextShipmentNumber(prisma, year, taken);
    await prisma.shipment.create({
      data: { number, cargoNumber: c.cargoNumber, createdById: owner.id, ...fields },
    });
    created++;
  }
}

console.log(`Импорт карго: создано ${created}, обновлено ${updated} (createdBy: ${owner.name})`);
await prisma.$disconnect();
