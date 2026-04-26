import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { ModelForm } from "@/components/models/model-form";

export default async function NewModelPage() {
  const session = await auth();
  const currentUserId = session?.user?.id ?? null;
  const [users, factories, sizeGrids, packagingItems] = await Promise.all([
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
      select: { id: true, name: true, sizes: true },
      orderBy: { name: "asc" },
    }),
    prisma.packagingItem.findMany({
      where: { isActive: true },
      select: { id: true, name: true, type: true, photoUrl: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="text-2xl font-semibold text-slate-900">Новый фасон</h1>
      <div className="rounded-2xl border border-slate-200 bg-white p-6">
        <ModelForm
          users={users}
          factories={factories}
          sizeGrids={sizeGrids}
          packagingItems={packagingItems}
          defaultOwnerId={currentUserId}
        />
      </div>
    </div>
  );
}
