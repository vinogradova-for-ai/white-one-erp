import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { SizeGridsAdmin, type SizeGridRow } from "./size-grids-admin";

export default async function SizeGridsAdminPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "OWNER" && session.user.role !== "DIRECTOR") {
    redirect("/");
  }

  const grids = await prisma.sizeGrid.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { models: true } } },
  });

  const rows: SizeGridRow[] = grids.map((g) => ({
    id: g.id,
    name: g.name,
    sizes: g.sizes,
    notes: g.notes,
    usedByModels: g._count.models,
  }));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Размерные сетки</h1>
        <p className="text-sm text-slate-500">
          Справочник размерных сеток для фасонов. Всего: {rows.length}.
          Создавать новые можно прямо из формы фасона.
        </p>
      </div>
      <SizeGridsAdmin initial={rows} />
    </div>
  );
}
