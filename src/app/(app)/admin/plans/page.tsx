import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { CATEGORIES } from "@/lib/constants";
import { PlansAdmin } from "./plans-admin";

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

  const plans = await prisma.monthlyPlan.findMany({
    where: { yearMonth: { gte: year * 100 + 1, lte: year * 100 + 12 } },
    orderBy: [{ yearMonth: "asc" }, { category: "asc" }],
  });

  // Карта {yearMonth: {category: plannedRevenue}}
  const map: Record<number, Record<string, number>> = {};
  for (const p of plans) {
    (map[p.yearMonth] ??= {})[p.category] = Number(p.plannedRevenue);
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">План продаж по месяцам</h1>
        <p className="text-sm text-slate-500">
          План выручки по категориям. Используется на /plan-vs-fact для сравнения с фактом по заказам.
        </p>
      </div>
      <PlansAdmin year={year} categories={[...CATEGORIES]} initialData={map} />
    </div>
  );
}
