/**
 * Разовый перенос листа «КАРГО» из Excel-матрицы в сервис (Алёна 16.07.2026).
 *
 * Вход: JSON от питон-парсера (scratchpad/cargo-import.json), путь аргументом.
 * На каждую накладную: upsert Shipment по cargoNumber (существующие НЕ трогаем,
 * только дозаполняем пустые поля), статус по Excel, курс на дату оплаты.
 * Заказы цепляем best-effort по совпадению названия с фасоном заказа
 * (ensureBatchForShipment — как кнопка «Добавить заказ»). Всё, что не
 * сматчилось уверенно, — в отчёт, прикрепит Настя руками.
 *
 * Запуск: DATABASE_URL=... npx tsx scripts/import-cargo-from-excel.ts <json> [--apply]
 * Без --apply — сухой прогон (только отчёт, БД не трогаем).
 */
import { readFileSync } from "node:fs";
import { prisma } from "../src/lib/prisma";
import { ensureBatchForShipment } from "../src/server/batches";
import { getCbrRate } from "../src/server/currency-rates";

type CargoRow = {
  code: string;
  places: number | null;
  weightKg: number | null;
  names: Array<{ name: string; qty: string | null }>;
  depart: string | null;
  planArrival: string | null;
  amountUsdt: number | null;
  payStatus: string | null;
  status: string | null;
  factArrival: string | null;
  extra: string | null;
};

const jsonPath = process.argv[2];
const APPLY = process.argv.includes("--apply");
if (!jsonPath) {
  console.error("usage: tsx scripts/import-cargo-from-excel.ts <cargo-import.json> [--apply]");
  process.exit(1);
}

function norm(s: string): string {
  return s.toLowerCase().replace(/ё/g, "е").replace(/[^а-яa-z0-9\s-]/g, " ");
}

function tokens(s: string): string[] {
  return norm(s).split(/[\s\-,/]+/).filter((w) => w.length >= 3);
}

/** Совпадение названия из Excel с названием фасона: доля общих корней. */
function matchScore(excelName: string, modelName: string): number {
  const a = tokens(excelName);
  const b = tokens(modelName);
  if (a.length === 0 || b.length === 0) return 0;
  const stem = (w: string) => w.slice(0, Math.max(4, w.length - 2));
  const hits = a.filter((w) => b.some((x) => stem(x).startsWith(stem(w).slice(0, 4)) || stem(w).startsWith(stem(x).slice(0, 4))));
  return hits.length / a.length;
}

function parsePaidAt(row: CargoRow): Date | null {
  const v = row.payStatus;
  if (!v) return null;
  const asDate = new Date(v);
  if (!Number.isNaN(asDate.getTime()) && v.length >= 8) return asDate;
  if (/оплач/i.test(v) && row.depart) return new Date(row.depart);
  if (/оплач/i.test(v)) return new Date();
  return null;
}

async function nextShipmentNumber(offset: number): Promise<string> {
  const year = new Date().getFullYear();
  const last = await prisma.shipment.findFirst({
    where: { number: { startsWith: `SHP-${year}-` } },
    orderBy: { number: "desc" },
    select: { number: true },
  });
  const lastNum = last ? Number(last.number.split("-")[2]) : 0;
  return `SHP-${year}-${String(lastNum + 1 + offset).padStart(4, "0")}`;
}

async function main() {
  const rows: CargoRow[] = JSON.parse(readFileSync(jsonPath, "utf8"));
  const alena = await prisma.user.findFirst({ where: { email: { in: ["alena", "alena@whiteone.love"] } } });
  if (!alena) throw new Error("Не нашла пользователя alena для createdById");

  const orders = await prisma.order.findMany({
    where: { deletedAt: null },
    select: {
      id: true,
      orderNumber: true,
      productModel: { select: { name: true } },
      batches: { select: { id: true, shipmentId: true } },
    },
  });
  const packagingItems = await prisma.packagingItem.findMany({
    select: {
      id: true, name: true,
      packagingOrderLines: {
        select: { packagingOrder: { select: { id: true, orderNumber: true, shipmentId: true } } },
      },
    },
  });

  const report: string[] = [];
  let created = 0, updated = 0, attachedOrders = 0, attachedPkg = 0, offset = 0;

  for (const row of rows) {
    const paidAt = parsePaidAt(row);
    const isArrived = /СКЛАДЕ/i.test(row.status ?? "");
    const status = isArrived ? "ARRIVED" : row.depart && new Date(row.depart) <= new Date() ? "IN_TRANSIT" : "DRAFT";

    let usdRubRate: number | null = null;
    if (paidAt && APPLY) {
      try { usdRubRate = await getCbrRate("USD", paidAt); } catch { usdRubRate = null; }
    }

    const existing = await prisma.shipment.findFirst({ where: { cargoNumber: row.code, deletedAt: null } });
    let shipmentId: string;
    if (existing) {
      shipmentId = existing.id;
      if (APPLY) {
        await prisma.shipment.update({
          where: { id: existing.id },
          data: {
            placesCount: existing.placesCount ?? (row.places != null ? Math.round(row.places) : null),
            weightKg: existing.weightKg ?? row.weightKg,
            amountUsdt: existing.amountUsdt ?? row.amountUsdt,
            departDate: existing.departDate ?? (row.depart ? new Date(row.depart) : null),
            arriveDate: existing.arriveDate ?? (row.planArrival ? new Date(row.planArrival) : null),
            arrivalActualDate: existing.arrivalActualDate ?? (row.factArrival ? new Date(row.factArrival) : null),
            cargoPaidAt: existing.cargoPaidAt ?? paidAt,
            usdRubRate: existing.usdRubRate ?? usdRubRate,
            comment: existing.comment ?? (row.names.map((n) => n.name).join("; ") || null),
          },
        });
      }
      updated++;
      report.push(`= ${row.code}: уже есть (${existing.number}), дозаполнила пустые поля`);
    } else {
      const number = await nextShipmentNumber(APPLY ? 0 : offset++);
      if (APPLY) {
        const s = await prisma.shipment.create({
          data: {
            number,
            status,
            cargoNumber: row.code,
            placesCount: row.places != null ? Math.round(row.places) : null,
            weightKg: row.weightKg,
            amountUsdt: row.amountUsdt,
            departDate: row.depart ? new Date(row.depart) : null,
            arriveDate: row.planArrival ? new Date(row.planArrival) : null,
            arrivalActualDate: row.factArrival ? new Date(row.factArrival) : null,
            cargoPaidAt: paidAt,
            usdRubRate,
            comment: row.names.map((n) => n.name).join("; ") || undefined,
            createdById: alena.id,
          },
        });
        shipmentId = s.id;
      } else {
        shipmentId = "(dry)";
      }
      created++;
      report.push(`+ ${row.code} → ${number} [${status}]${paidAt ? " оплачено " + paidAt.toISOString().slice(0, 10) : ""}`);
    }

    // ── Прикрепление содержимого по названиям ──
    for (const n of row.names) {
      // 1) заказ одежды по фасону
      const scored = orders
        .map((o) => ({ o, score: matchScore(n.name, o.productModel.name) }))
        .filter((x) => x.score >= 0.6)
        .sort((a, b) => b.score - a.score);
      // 0.6–0.75 — только подсказка в отчёт, руками надёжнее (алладины офис ≠ алладины лён)
      if (scored.length > 0 && scored[0].score < 0.75) {
        report.push(`   ? «${n.name}» похоже на ${scored[0].o.orderNumber} (${Math.round(scored[0].score * 100)}%) — прикрепить руками, если верно`);
        continue;
      }
      if (scored.length > 0) {
        const best = scored[0].o;
        const free = best.batches.length === 0 || best.batches.some((b) => b.shipmentId == null);
        if (free) {
          if (APPLY && shipmentId !== "(dry)") {
            await prisma.$transaction(async (tx) => {
              const batch = await ensureBatchForShipment(tx, best.id);
              if (batch) await tx.orderBatch.update({ where: { id: batch.batchId }, data: { shipmentId } });
            });
            const fresh = await prisma.orderBatch.findMany({ where: { orderId: best.id }, select: { id: true, shipmentId: true } });
            const idx = orders.findIndex((o) => o.id === best.id);
            if (idx >= 0) orders[idx] = { ...orders[idx], batches: fresh };
          }
          attachedOrders++;
          report.push(`   ↳ «${n.name}» → заказ ${best.orderNumber}`);
          continue;
        }
        report.push(`   ↳ «${n.name}» ≈ ${best.orderNumber}, но все его партии уже в других карго — ПРОВЕРИТЬ РУКАМИ`);
        continue;
      }
      // 2) заказ упаковки по названию позиции
      const pkgScored = packagingItems
        .map((p) => ({ p, score: matchScore(n.name, p.name) }))
        .filter((x) => x.score >= 0.6)
        .sort((a, b) => b.score - a.score);
      const freePkg = pkgScored
        .flatMap((x) => x.p.packagingOrderLines.map((l) => l.packagingOrder))
        .find((po) => po.shipmentId == null);
      if (freePkg) {
        if (APPLY && shipmentId !== "(dry)") {
          await prisma.packagingOrder.update({ where: { id: freePkg.id }, data: { shipmentId } });
          for (const p of packagingItems) {
            for (const l of p.packagingOrderLines) if (l.packagingOrder.id === freePkg.id) l.packagingOrder.shipmentId = shipmentId;
          }
        }
        attachedPkg++;
        report.push(`   ↳ «${n.name}» → упаковка ${freePkg.orderNumber}`);
        continue;
      }
      report.push(`   ✗ «${n.name}» — не нашла заказ, прикрепить руками`);
    }
  }

  console.log(report.join("\n"));
  console.log(`\nИтого: карго новых ${created}, обновлено ${updated}; заказов прикреплено ${attachedOrders}, упаковки ${attachedPkg}. Режим: ${APPLY ? "ЗАПИСЬ" : "сухой прогон"}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
