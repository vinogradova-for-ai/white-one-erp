import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, apiError } from "@/server/api-helpers";
import { logAudit } from "@/server/audit";
import { z } from "zod";

// План = «выпуск продуктов»: количество фасонов + штук, привязка к ответственному.
// Не выручка и не рубли (Алёна явно).
const upsertSchema = z.object({
  yearMonth: z.number().int().min(202001).max(203012),
  ownerId: z.string().nullable().optional(),
  category: z.string().nullable().optional(),
  plannedModelCount: z.number().int().nonnegative().nullable().optional(),
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
      orderBy: [{ yearMonth: "asc" }, { ownerId: "asc" }],
      include: { owner: { select: { id: true, name: true } } },
    });
    return NextResponse.json({ items });
  } catch (e) {
    return apiError(e);
  }
}

// POST — upsert по (yearMonth, ownerId, category).
// Если plannedModelCount и plannedQuantity обе пусты/0 — удаляем запись.
export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth();
    if (session.user.role !== "OWNER" && session.user.role !== "DIRECTOR") {
      return NextResponse.json({ error: { code: "forbidden" } }, { status: 403 });
    }
    const data = upsertSchema.parse(await req.json());

    const isEmpty =
      (data.plannedModelCount == null || data.plannedModelCount === 0) &&
      (data.plannedQuantity == null || data.plannedQuantity === 0);

    if (isEmpty) {
      await prisma.monthlyPlan.deleteMany({
        where: {
          yearMonth: data.yearMonth,
          ownerId: data.ownerId ?? null,
          category: data.category ?? null,
        },
      });
      await logAudit({
        action: "DELETE",
        entityType: "MonthlyPlan",
        entityId: String(data.yearMonth),
        userId: session.user.id,
        changes: { yearMonth: data.yearMonth, ownerId: data.ownerId ?? null, category: data.category ?? null },
      });
      return NextResponse.json({ deleted: true });
    }

    // upsert по составному ключу не работает с NULL — делаем findFirst + create/update.
    const existing = await prisma.monthlyPlan.findFirst({
      where: {
        yearMonth: data.yearMonth,
        ownerId: data.ownerId ?? null,
        category: data.category ?? null,
      },
    });

    if (existing) {
      const updated = await prisma.monthlyPlan.update({
        where: { id: existing.id },
        data: {
          plannedModelCount: data.plannedModelCount ?? null,
          plannedQuantity: data.plannedQuantity ?? null,
          notes: data.notes ?? undefined,
        },
      });
      await logAudit({
        action: "UPDATE",
        entityType: "MonthlyPlan",
        entityId: updated.id,
        userId: session.user.id,
        changes: { plannedModelCount: data.plannedModelCount ?? null, plannedQuantity: data.plannedQuantity ?? null },
      });
      return NextResponse.json(updated);
    }

    const created = await prisma.monthlyPlan.create({
      data: {
        yearMonth: data.yearMonth,
        ownerId: data.ownerId ?? null,
        category: data.category ?? null,
        plannedModelCount: data.plannedModelCount ?? null,
        plannedQuantity: data.plannedQuantity ?? null,
        notes: data.notes ?? null,
      },
    });
    await logAudit({
      action: "CREATE",
      entityType: "MonthlyPlan",
      entityId: created.id,
      userId: session.user.id,
      changes: { yearMonth: data.yearMonth, plannedModelCount: data.plannedModelCount ?? null, plannedQuantity: data.plannedQuantity ?? null },
    });
    return NextResponse.json(created);
  } catch (e) {
    return apiError(e);
  }
}
