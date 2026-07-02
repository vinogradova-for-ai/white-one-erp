import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth, apiError } from "@/server/api-helpers";
import { assertCan } from "@/lib/rbac";
import { logAudit } from "@/server/audit";

const sampleCreateSchema = z.object({
  label: z.string().max(200).optional().nullable(),
  factoryId: z.string().optional().nullable(),
});

// POST /api/models/[id]/samples — заказать образец у фабрики.
// Дата заказа = сейчас; дальнейшие даты проставляются переходами статуса.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAuth();
    assertCan(session.user.role, "product.update");
    const { id } = await params;

    const data = sampleCreateSchema.parse(await req.json());

    const model = await prisma.productModel.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, preferredFactoryId: true },
    });
    if (!model) {
      return NextResponse.json({ error: { code: "not_found" } }, { status: 404 });
    }

    const sample = await prisma.sample.create({
      data: {
        productModelId: id,
        label: data.label || null,
        // Фабрика: явная из формы, иначе — любимая фабрика фасона.
        factoryId: data.factoryId ?? model.preferredFactoryId,
        status: "ORDERED",
        orderedDate: new Date(),
        createdById: session.user.id,
      },
    });

    await logAudit({
      action: "CREATE",
      entityType: "Sample",
      entityId: sample.id,
      userId: session.user.id,
      changes: { productModelId: id, label: data.label ?? null },
    });

    return NextResponse.json({ ok: true, id: sample.id });
  } catch (e) {
    return apiError(e);
  }
}
