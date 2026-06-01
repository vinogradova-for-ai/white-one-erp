import { prisma } from "@/lib/prisma";
import { colorHexFromName } from "@/lib/color-map";
import { BRAND_LABELS } from "@/lib/constants";
import { ProductModelStatus } from "@prisma/client";
import { BoardCanvas, type BoardCard } from "@/components/models-board/board-canvas";

// Бесконечная доска «как в Miro»: все активированные фасоны лежат карточками
// на одном холсте. Можно панорамировать, зумить, двигать карточки мышкой и
// кликом открывать фасон. Координаты карточек общие на команду (canvasX/Y).

const STATUS_META: Record<ProductModelStatus, { label: string; dot: string }> = {
  IDEA: { label: "Идея", dot: "#af52de" },
  PATTERNS: { label: "Лекала", dot: "#5856d6" },
  SAMPLE: { label: "Образец", dot: "#0071e3" },
  APPROVED: { label: "Утверждён", dot: "#30b0c7" },
  IN_PRODUCTION: { label: "Производство", dot: "#34c759" },
};

export default async function ModelsBoardPage() {
  const models = await prisma.productModel.findMany({
    where: { deletedAt: null, activated: true },
    // Сортировка по категории+имени — чтобы при раскладке сеткой однотипные
    // вещи оказывались рядом (как на референс-доске по типам изделий).
    orderBy: [{ category: "asc" }, { name: "asc" }],
    take: 1000,
    select: {
      id: true,
      name: true,
      brand: true,
      category: true,
      photoUrls: true,
      status: true,
      canvasX: true,
      canvasY: true,
      variants: {
        where: { deletedAt: null },
        select: { colorName: true },
        orderBy: { createdAt: "asc" },
        take: 8,
      },
    },
  });

  const cards: BoardCard[] = models.map((m) => {
    const seen = new Set<string>();
    const colorChips: Array<{ name: string; hex: string }> = [];
    for (const v of m.variants) {
      const hex = colorHexFromName(v.colorName);
      if (seen.has(hex)) continue;
      seen.add(hex);
      colorChips.push({ name: v.colorName, hex });
    }
    const meta = STATUS_META[m.status] ?? { label: m.status, dot: "#94a3b8" };
    return {
      id: m.id,
      name: m.name,
      brandLabel: BRAND_LABELS[m.brand] ?? m.brand,
      category: m.category,
      photo: m.photoUrls?.[0] ?? null,
      statusLabel: meta.label,
      statusDot: meta.dot,
      colorChips,
      x: m.canvasX,
      y: m.canvasY,
    };
  });

  // Холст разворачиваем на всю область контента (убираем паддинги main).
  return (
    <div className="-mx-4 -mt-4 -mb-24 md:-mx-8 md:-mt-8 md:-mb-8">
      <BoardCanvas cards={cards} />
    </div>
  );
}
