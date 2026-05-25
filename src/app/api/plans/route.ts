import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, apiError } from "@/server/api-helpers";
import { z } from "zod";

const upsertSchema = z.object({
  yearMonth: z.number().int().min(202001).max(203012),
  category: z.string().min(1).max(100),
  plannedRevenue: z.union([z.number(), z.string()]).transform((v) => Number(v)).pipe(z.number().nonnegative()),
  plannedQuantity: z.number().int().nonnegative().nullable().optional(),
  notes: z.string().nullable().optional(),
});

// GET ?year=2026 — план на весь год
export async function GET(req: NextRequest) {
  try {
    await requireAuth();
    const year = Number(req.nextUrl.searchParams.get("year") ?? new Date().getFullYear());
    const items = await prisma.monthlyPlan.findMany({
      where: { yearMonth: { gte: year * 100 + 1, lte: year * 100 + 12 } },
      orderBy: [{ yearMonth: "asc" }, { category: "asc" }],
    });
    return NextResponse.json({ items });
  } catch (e) {
    return apiError(e);
  }
}

// POST — upsert по (yearMonth, category). plannedRevenue=0 = удаление записи.
export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth();
    if (session.user.role !== "OWNER" && session.user.role !== "DIRECTOR") {
      return NextResponse.json({ error: { code: "forbidden" } }, { status: 403 });
    }
    const data = upsertSchema.parse(await req.json());

    if (data.plannedRevenue === 0) {
      await prisma.monthlyPlan.deleteMany({
        where: { yearMonth: data.yearMonth, category: data.category },
      });
      return NextResponse.json({ deleted: true });
    }

    const result = await prisma.monthlyPlan.upsert({
      where: { yearMonth_category: { yearMonth: data.yearMonth, category: data.category } },
      create: {
        yearMonth: data.yearMonth,
        category: data.category,
        plannedRevenue: data.plannedRevenue,
        plannedQuantity: data.plannedQuantity ?? null,
        notes: data.notes ?? null,
      },
      update: {
        plannedRevenue: data.plannedRevenue,
        plannedQuantity: data.plannedQuantity ?? undefined,
        notes: data.notes ?? undefined,
      },
    });
    return NextResponse.json(result);
  } catch (e) {
    return apiError(e);
  }
}
