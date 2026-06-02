import { prisma } from "@/lib/prisma";
import { colorHexFromName } from "@/lib/color-map";
import {
  CollectionBoard,
  type CollModel,
} from "@/components/models-collection/collection-board";

// Доска коллекции «Раскладка по цветам»: каждый фасон как перекрашиваемый
// флэт-контур, раскладка цветов по сезонам/капсулам. Общая на команду.

export default async function CollectionPage() {
  const models = await prisma.productModel.findMany({
    where: { deletedAt: null, activated: true },
    orderBy: [{ category: "asc" }, { name: "asc" }],
    take: 1000,
    select: {
      id: true,
      name: true,
      category: true,
      flatSketchSvg: true,
      boardColors: true,
      collectionOrder: true,
      variants: {
        where: { deletedAt: null },
        select: { colorName: true },
        orderBy: { createdAt: "asc" },
        take: 12,
      },
    },
  });

  const data: CollModel[] = models.map((m) => {
    const seen = new Set<string>();
    const variantColors: Array<{ name: string; hex: string }> = [];
    for (const v of m.variants) {
      const hex = colorHexFromName(v.colorName);
      if (seen.has(hex)) continue;
      seen.add(hex);
      variantColors.push({ name: v.colorName, hex });
    }
    return {
      id: m.id,
      name: m.name,
      category: m.category,
      flatSvg: m.flatSketchSvg,
      variantColors,
      boardColors: m.boardColors ?? [],
      collectionOrder: m.collectionOrder,
    };
  });

  return (
    <div className="-mx-4 -mt-4 -mb-24 md:-mx-8 md:-mt-8 md:-mb-8">
      <CollectionBoard models={data} />
    </div>
  );
}
