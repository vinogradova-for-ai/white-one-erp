import { prisma } from "@/lib/prisma";
import { ModelForm } from "@/components/models/model-form";

export default async function NewModelPage() {
  const [users, factories, sizeGrids] = await Promise.all([
    prisma.user.findMany({
      where: { isActive: true, role: { in: ["OWNER", "DIRECTOR", "PRODUCT_MANAGER"] } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.factory.findMany({
      where: { isActive: true },
      select: { id: true, name: true, country: true },
      orderBy: { name: "asc" },
    }),
    prisma.sizeGrid.findMany({
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  // Собираем все существующие теги для автоподсказки
  const existingModels = await prisma.productModel.findMany({
    where: { deletedAt: null },
    select: { tags: true },
  });
  const allTags = Array.from(new Set(existingModels.flatMap((m) => m.tags))).sort();

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="text-2xl font-semibold text-slate-900">Новый фасон</h1>
      <div className="rounded-2xl border border-slate-200 bg-white p-6">
        <ModelForm users={users} factories={factories} sizeGrids={sizeGrids} existingTags={allTags} />
      </div>
    </div>
  );
}
