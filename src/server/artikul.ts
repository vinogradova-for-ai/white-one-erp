import { prisma } from "@/lib/prisma";
import {
  isLatinCountry,
  buildLatinBase,
  buildRussiaBase,
  styleSuggest,
  parseRussiaNumber,
  PREFIX_CYR,
} from "@/lib/artikul";

/**
 * Генерирует базовую часть артикула фасона (ProductModel.artikulBase).
 * - Китай/Кыргызстан → латиница {тип}_{метка}, с проверкой уникальности (…-2, …-3).
 * - Россия → кириллица {буква}_{номер}; номер = (макс существующий по категории) + 1,
 *   причём максимум берётся И из artikulBase фасонов, И из sku вариантов
 *   (там лежат исторические номера типа П_034_…), чтобы продолжить нумерацию.
 */
export async function generateArtikulBase(opts: {
  category: string;
  country: string | null | undefined;
  name: string;
  styleWord?: string | null;
}): Promise<string> {
  const { category, country, name } = opts;

  if (isLatinCountry(country)) {
    const style = opts.styleWord?.trim() ? opts.styleWord : styleSuggest(name, category);
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

  // Россия: следующий свободный номер по категории
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
  // Номера схемы маленькие и последовательные (П_038, П_051…). Числа ≥ MAX — это
  // мусор в поле sku (затесавшиеся nmID/штрихкоды/опечатки), их игнорируем,
  // иначе один кривой sku угонит счётчик в космос.
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
