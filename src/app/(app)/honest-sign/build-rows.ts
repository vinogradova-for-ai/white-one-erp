import { prisma } from "@/lib/prisma";

// ======================================================
// Справочник «Честный знак» — сборка строк
// ======================================================
// Одна строка = цветомодель (ProductVariant) × размер (из размерной сетки фасона).
// Целевой набор атрибутов — под карточку в Национальном каталоге «Честный знак»
// (наименование, товарный знак, артикул, вид одежды, целевой пол, цвет, размер,
// состав, ТНВЭД, страна производства).
//
// Логику держим ОДНУ и переиспользуем на странице и в XLSX-выгрузке,
// чтобы таблица на экране и файл были идентичны до символа.

// Товарный знак и целевой пол у White One постоянны (бренд женской одежды).
export const HS_BRAND = "White One";
export const HS_GENDER = "Женский";

export type HonestSignRow = {
  variantId: string;
  modelId: string;
  category: string; // вид одежды (Пальто / Брюки / …)
  modelName: string;
  colorName: string;
  size: string;
  // Целевые колонки для ЧЗ:
  name: string; // собранное наименование
  sku: string; // артикул цветомодели
  brand: string; // товарный знак = White One
  gender: string; // целевой пол = Женский
  composition: string; // состав сырья (может быть пустым → подсветка дыры)
  tnved: string; // код ТНВЭД (может быть пустым → подсветка дыры)
  country: string; // страна производства
};

// Наименование по шаблону: «вид одежды White One название-фасона цвет р. XX».
// Пример: «Пальто White One Классика Двубортное Миди шоколад р. 46».
function buildName(
  category: string,
  modelName: string,
  colorName: string,
  size: string,
): string {
  const parts = [category, HS_BRAND, modelName];
  if (colorName) parts.push(colorName);
  if (size) parts.push(`р. ${size}`);
  return parts.filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
}

// Тянем все активные фасоны с живыми цветомоделями и размерной сеткой,
// разворачиваем в плоский список строк цветомодель × размер.
export async function buildHonestSignRows(): Promise<HonestSignRow[]> {
  const models = await prisma.productModel.findMany({
    where: {
      deletedAt: null,
      activated: true, // не архив / не черновик-образец
    },
    select: {
      id: true,
      name: true,
      category: true,
      countryOfOrigin: true,
      fabricComposition: true,
      tnvedCode: true,
      sizeGrid: { select: { sizes: true } },
      preferredFactory: { select: { country: true } },
      variants: {
        where: { deletedAt: null },
        select: { id: true, sku: true, colorName: true },
        orderBy: { createdAt: "asc" },
      },
    },
    orderBy: [{ category: "asc" }, { name: "asc" }],
  });

  const rows: HonestSignRow[] = [];
  for (const m of models) {
    // Страна производства: фактическая фабрика фасона важнее общего поля,
    // но если фабрика не задана — берём страну из самого фасона.
    const country = m.preferredFactory?.country || m.countryOfOrigin || "";
    const composition = m.fabricComposition ?? "";
    const tnved = m.tnvedCode ?? "";
    // Если сетка не задана — одна строка без размера (лучше показать, чем потерять).
    const sizes = m.sizeGrid?.sizes?.length ? m.sizeGrid.sizes : [""];

    for (const v of m.variants) {
      for (const size of sizes) {
        rows.push({
          variantId: v.id,
          modelId: m.id,
          category: m.category,
          modelName: m.name,
          colorName: v.colorName,
          size,
          name: buildName(m.category, m.name, v.colorName, size),
          sku: v.sku,
          brand: HS_BRAND,
          gender: HS_GENDER,
          composition,
          tnved,
          country,
        });
      }
    }
  }
  return rows;
}
