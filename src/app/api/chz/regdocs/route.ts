import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth, apiError } from "@/server/api-helpers";

// Разрешительные документы (декларации/сертификаты) для IMPORT_RD.
// Создание: номер + дата + тип + категории (привязываем все текущие фасоны
// этих категорий; точечную правку состава добавим по обкатке).

const createSchema = z.object({
  kind: z.enum(["DECLARATION", "CERTIFICATE"]).default("DECLARATION"),
  number: z.string().min(5).max(120),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  categories: z.array(z.string().min(1)).min(1, "Выберите хотя бы одну категорию"),
  comment: z.string().max(500).optional().nullable(),
});

export async function GET() {
  try {
    await requireAuth();
    const docs = await prisma.regulatoryDoc.findMany({
      orderBy: { date: "desc" },
      include: { models: { select: { id: true, name: true, category: true } } },
    });
    return NextResponse.json({ docs });
  } catch (e) {
    return apiError(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireAuth();
    const data = createSchema.parse(await req.json());
    const models = await prisma.productModel.findMany({
      where: { deletedAt: null, category: { in: data.categories } },
      select: { id: true },
    });
    const doc = await prisma.regulatoryDoc.create({
      data: {
        kind: data.kind,
        number: data.number.trim(),
        date: new Date(data.date),
        comment: data.comment ?? null,
        models: { connect: models.map((m) => ({ id: m.id })) },
      },
    });
    return NextResponse.json({ doc });
  } catch (e) {
    return apiError(e);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    await requireAuth();
    const { id } = z.object({ id: z.string().min(1) }).parse(await req.json());
    await prisma.regulatoryDoc.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}
