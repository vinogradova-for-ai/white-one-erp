import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { PlansAdmin, type PlanCell } from "./plans-admin";

export default async function PlansAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "OWNER" && session.user.role !== "DIRECTOR") {
    redirect("/");
  }

  const sp = await searchParams;
  const year = Number(sp.year ?? new Date().getFullYear());

  const [plans, users] = await Promise.all([
    prisma.monthlyPlan.findMany({
      where: { yearMonth: { gte: year * 100 + 1, lte: year * 100 + 12 } },
      orderBy: [{ yearMonth: "asc" }],
    }),
    prisma.user.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  // Карта {yearMonth: {ownerId: {models, units}}}
  const map: Record<number, Record<string, PlanCell>> = {};
  for (const p of plans) {
    const ymMap = (map[p.yearMonth] ??= {});
    const key = p.ownerId ?? "_none_";
    ymMap[key] = {
      plannedModelCount: p.plannedModelCount,
      plannedQuantity: p.plannedQuantity,
    };
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">План выпуска по месяцам</h1>
        <p className="text-sm text-slate-500">
          Сколько фасонов и штук должен выпустить каждый ответственный.
          В каждой ячейке: <b>фасонов</b> / <b>штук</b>.
        </p>
      </div>
      <PlansAdmin year={year} users={users} initialData={map} />
    </div>
  );
}
