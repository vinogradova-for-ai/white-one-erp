import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
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

    // upsert Prisma по составному ключу с NULL не работает (NULL≠NULL), поэтому
    // делаем findFirst + create/update. Идемпотентность при двойном клике:
    // если параллельный запрос успел вставить строку между find и create,
    // ловим P2002 (частичные NULL-уникальные индексы, миграция
    // 20260702200000) и повторяем как update — дубль «общего плана» не создаём.
    const keyWhere = {
      yearMonth: data.yearMonth,
      ownerId: data.ownerId ?? null,
      category: data.category ?? null,
    };
    const updateData = {
      plannedModelCount: data.plannedModelCount ?? null,
      plannedQuantity: data.plannedQuantity ?? null,
      notes: data.notes ?? undefined,
    };

    const existing = await prisma.monthlyPlan.findFirst({ where: keyWhere });

    if (existing) {
      const updated = await prisma.monthlyPlan.update({
        where: { id: existing.id },
        data: updateData,
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

    try {
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
    } catch (err) {
      // Гонка: параллельный запрос уже создал эту строку → обновляем её.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        const raced = await prisma.monthlyPlan.findFirst({ where: keyWhere });
        if (raced) {
          const updated = await prisma.monthlyPlan.update({ where: { id: raced.id }, data: updateData });
          return NextResponse.json(updated);
        }
      }
      throw err;
    }
  } catch (e) {
    return apiError(e);
  }
}
