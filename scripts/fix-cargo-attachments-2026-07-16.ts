/**
 * Точечные привязки карго↔заказы по сверке дат прибытия (Алёна 16.07 вечер):
 *  - M0514-4759-47 (прибыл 14-16.06): бочки — это ORD-2026-0015 (факт 17.06,
 *    на складе), а не ORD-2026-0047 (ещё едет). Перецепляем.
 *  - M0524-4759-49 «палаццо овер» (прибыл ~14.06) → ORD-2026-0012 Палаццо
 *    оверсайз (факт 16.06, 5000 шт).
 * Идемпотентно: пропускает уже сделанное.
 */
import { prisma } from "../src/lib/prisma";
import { ensureBatchForShipment } from "../src/server/batches";

async function attach(cargoNumber: string, orderNumber: string) {
  const s = await prisma.shipment.findFirst({ where: { cargoNumber, deletedAt: null } });
  const o = await prisma.order.findFirst({ where: { orderNumber, deletedAt: null } });
  if (!s || !o) return console.log(`${cargoNumber} → ${orderNumber}: не нашла (${!s ? "карго" : "заказ"})`);
  const already = await prisma.orderBatch.findFirst({ where: { orderId: o.id, shipmentId: s.id } });
  if (already) return console.log(`${cargoNumber} → ${orderNumber}: уже прицеплен`);
  await prisma.$transaction(async (tx) => {
    const batch = await ensureBatchForShipment(tx, o.id);
    if (!batch) throw new Error("нет свободной партии");
    await tx.orderBatch.update({ where: { id: batch.batchId }, data: { shipmentId: s.id } });
  });
  console.log(`${cargoNumber} → ${orderNumber}: прицепила`);
}

async function detach(cargoNumber: string, orderNumber: string) {
  const s = await prisma.shipment.findFirst({ where: { cargoNumber, deletedAt: null } });
  const o = await prisma.order.findFirst({ where: { orderNumber, deletedAt: null } });
  if (!s || !o) return;
  const b = await prisma.orderBatch.findFirst({ where: { orderId: o.id, shipmentId: s.id } });
  if (!b) return console.log(`${cargoNumber} ✂ ${orderNumber}: уже отцеплен`);
  if (b.receivedAt) return console.log(`${cargoNumber} ✂ ${orderNumber}: партия принята, не трогаю`);
  await prisma.orderBatch.update({ where: { id: b.id }, data: { shipmentId: null } });
  console.log(`${cargoNumber} ✂ ${orderNumber}: отцепила`);
}

async function main() {
  await detach("M0514-4759-47", "ORD-2026-0047"); // едет, а карго прибыло — не тот заказ
  await attach("M0514-4759-47", "ORD-2026-0015"); // бочки на складе, факт 17.06 ✓
  await attach("M0524-4759-49", "ORD-2026-0012"); // палаццо овер, факт 16.06 ✓
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
