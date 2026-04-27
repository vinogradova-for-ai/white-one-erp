import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const PREFIXES = ["П_031", "П_037", "П_038", "П_023", "П_035", "П_036", "П_039", "П_040"];

async function main() {
  const variants = await prisma.productVariant.findMany({
    where: {
      deletedAt: null,
      OR: PREFIXES.map((p) => ({ sku: { startsWith: p } })),
    },
    include: {
      productModel: { select: { id: true, name: true, sizeGrid: { select: { sizes: true } } } },
    },
    orderBy: { sku: "asc" },
  });

  if (variants.length === 0) {
    console.log("Ничего не найдено по префиксам:", PREFIXES.join(", "));
    return;
  }

  const modelIds = new Set(variants.map((v) => v.productModelId));
  console.log(`Найдено вариантов: ${variants.length}`);
  console.log(`Уникальных фасонов: ${modelIds.size}`);
  console.log("");

  for (const v of variants) {
    console.log(`${v.sku.padEnd(40)} | ${v.colorName.padEnd(15)} | model: ${v.productModel.name} (${v.productModel.id})`);
  }

  console.log("");
  for (const id of modelIds) {
    const m = variants.find((v) => v.productModelId === id)?.productModel;
    console.log(`Фасон ${m?.name}:`);
    console.log(`  id: ${id}`);
    console.log(`  размеры: ${m?.sizeGrid?.sizes.join(", ") ?? "—"}`);
  }
}

main().finally(() => prisma.$disconnect());
