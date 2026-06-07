/**
 * Интеграционная проверка генератора артикулов против ЛОКАЛЬНОЙ БД.
 * Зеркалит логику src/server/artikul.ts (но с прямым PrismaClient, без @/-алиаса).
 * Запуск:  npx tsx scripts/artikul-integration-check.ts   (ничего не пишет)
 */
import { PrismaClient } from "@prisma/client";
import {
  isLatinCountry,
  buildLatinBase,
  buildRussiaBase,
  styleSuggest,
  parseRussiaNumber,
  PREFIX_CYR,
} from "../src/lib/artikul";

const prisma = new PrismaClient();

async function genBase(category: string, country: string, name: string, styleWord?: string) {
  if (isLatinCountry(country)) {
    const style = styleWord?.trim() ? styleWord : styleSuggest(name, category);
    const base = buildLatinBase(category, style);
    const existing = await prisma.productModel.findMany({
      where: { artikulBase: { startsWith: base }, deletedAt: null },
      select: { artikulBase: true },
    });
    const taken = new Set(existing.map((e) => e.artikulBase));
    if (!taken.has(base)) return base;
    let n = 2;
    while (taken.has(`${base}-${n}`)) n++;
    return `${base}-${n}`;
  }
  const prefix = PREFIX_CYR[category] ?? "X";
  const [models, variants] = await Promise.all([
    prisma.productModel.findMany({ where: { artikulBase: { startsWith: `${prefix}_` }, deletedAt: null }, select: { artikulBase: true } }),
    prisma.productVariant.findMany({ where: { sku: { startsWith: `${prefix}_` }, deletedAt: null }, select: { sku: true } }),
  ]);
  const MAX = 10000; // игнорим мусор в sku (nmID/штрихкоды), см. server/artikul.ts
  let max = 0;
  for (const m of models) { const n = parseRussiaNumber(category, m.artikulBase ?? ""); if (n != null && n < MAX) max = Math.max(max, n); }
  for (const v of variants) { const n = parseRussiaNumber(category, v.sku); if (n != null && n < MAX) max = Math.max(max, n); }
  return buildRussiaBase(category, max + 1);
}

async function main() {
  const cases: [string, string, string, string?][] = [
    ["Платья", "Китай", "Платье Кимоно", "kimono"],
    ["Брюки", "Кыргызстан", "Брюки прямые", "straight"],
    ["Джинсы", "Китай", "Джинсы скинни", "skinny"],
    ["Трикотажные костюмы", "Китай", "Комплект джемпер+штаны", "jumper"],
    ["Пальто", "Россия", "Пальто новое", undefined],
    ["Полупальто", "Россия", "Полупальто новое", undefined],
  ];
  console.log("\n=== generateArtikulBase против локальной БД ===\n");
  for (const [cat, country, name, style] of cases) {
    const base = await genBase(cat, country, name, style);
    console.log(`  ${cat.padEnd(22)} ${country.padEnd(11)} → ${base}`);
  }
  // покажем, от чего считается номер России
  for (const cat of ["Пальто", "Полупальто"]) {
    const prefix = PREFIX_CYR[cat];
    const vs = await prisma.productVariant.findMany({ where: { sku: { startsWith: `${prefix}_` }, deletedAt: null }, select: { sku: true }, take: 5 });
    console.log(`\n  существующие sku «${prefix}_*»:`, vs.map((v) => v.sku).join(", ") || "(нет)");
  }
  console.log("");
  process.exit(0);
}
main().catch((e) => { console.error(e.message); process.exit(1); });
