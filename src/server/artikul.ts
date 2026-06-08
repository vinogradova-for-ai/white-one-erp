import { prisma } from "@/lib/prisma";
import {
  usesCyrillicScheme,
  buildLatinBase,
  buildRussiaBase,
  styleSuggest,
  parseRussiaNumber,
  parseLatinNumber,
  PREFIX_CYR,
  TYPE_LAT,
} from "@/lib/artikul";

/**
 * Следующий свободный номер-база для пальто/полупальто (кириллица): П_052 и т.п.
 * Максимум берётся И из artikulBase фасонов, И из sku вариантов (там исторические
 * номера типа П_034_…), чтобы продолжить нумерацию. Числа ≥ MAX — мусор в sku
 * (затесавшиеся nmID/штрихкоды), игнорируем, иначе один кривой sku угонит счётчик.
 */
export async function nextRussiaArtikulBase(category: string): Promise<string> {
  const prefix = PREFIX_CYR[category] ?? "X";
  const [models, variants] = await Promise.all([
    prisma.productModel.findMany({
      where: { artikulBase: { startsWith: `${prefix}_` }, deletedAt: null },
      select: { artikulBase: true },
    }),
    prisma.productVariant.findMany({
      where: { sku: { startsWith: `${prefix}_` }, deletedAt: null },
      select: { sku: true },
    }),
  ]);
  const MAX = 10000;
  let max = 0;
  for (const m of models) {
    const num = parseRussiaNumber(category, m.artikulBase ?? "");
    if (num != null && num < MAX) max = Math.max(max, num);
  }
  for (const v of variants) {
    const num = parseRussiaNumber(category, v.sku);
    if (num != null && num < MAX) max = Math.max(max, num);
  }
  return buildRussiaBase(category, max + 1);
}

/**
 * Следующий свободный двухзначный номер для латинской категории (брюки/платья/…).
 * Счётчик свой у каждого типа: считаем максимум из artikulBase фасонов и sku вариантов,
 * где номер идёт сразу за кодом типа (trs08…, trs1atlas…). Продолжаем существующую нумерацию.
 */
export async function nextLatinNumber(category: string): Promise<number> {
  const type = TYPE_LAT[category];
  if (!type) return 1;
  const [models, variants] = await Promise.all([
    prisma.productModel.findMany({
      where: { artikulBase: { startsWith: type }, deletedAt: null },
      select: { artikulBase: true },
    }),
    prisma.productVariant.findMany({
      where: { sku: { startsWith: type }, deletedAt: null },
      select: { sku: true },
    }),
  ]);
  const MAX = 10000;
  let max = 0;
  for (const m of models) {
    const num = parseLatinNumber(category, m.artikulBase ?? "");
    if (num != null && num < MAX) max = Math.max(max, num);
  }
  for (const v of variants) {
    const num = parseLatinNumber(category, v.sku);
    if (num != null && num < MAX) max = Math.max(max, num);
  }
  return max + 1;
}

/**
 * Генерирует базовую часть артикула фасона (ProductModel.artikulBase).
 * Алфавит решает КАТЕГОРИЯ:
 * - Пальто/Полупальто → кириллица {буква}_{номер} (авто-номер).
 * - Остальное → латиница {тип}{NN}_{метка} (авто-номер двухзначный, слитно), с проверкой уникальности (…-2, …-3).
 */
export async function generateArtikulBase(opts: {
  category: string;
  name: string;
  styleWord?: string | null;
}): Promise<string> {
  const { category, name } = opts;

  if (usesCyrillicScheme(category)) {
    return nextRussiaArtikulBase(category);
  }

  const style = opts.styleWord?.trim() ? opts.styleWord : styleSuggest(name, category);
  const num = await nextLatinNumber(category);
  const base = buildLatinBase(category, num, style);
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
