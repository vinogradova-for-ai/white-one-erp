import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, apiError } from "@/server/api-helpers";
import { ideaUpdateSchema } from "@/lib/validators/idea";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireAuth();
    const { id } = await ctx.params;
    const idea = await prisma.idea.findUnique({
      where: { id },
      include: { createdBy: { select: { name: true } }, promotedToModel: true },
    });
    if (!idea) return NextResponse.json({ error: { code: "not_found" } }, { status: 404 });
    return NextResponse.json(idea);
  } catch (e) {
    return apiError(e);
  }
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAuth();
    const { id } = await ctx.params;
    const data = ideaUpdateSchema.parse(await req.json());

    const idea = await prisma.idea.findUnique({ where: { id } });
    if (!idea) return NextResponse.json({ error: { code: "not_found" } }, { status: 404 });

    // Если PROMOTED — создаём ProductModel из идеи
    if (data.status === "PROMOTED" && idea.status !== "PROMOTED") {
      const newModel = await prisma.productModel.create({
        data: {
          name: idea.title,
          category: "Новые товары",
          tags: idea.tags,
          countryOfOrigin: "Китай",
          ownerId: session.user.id,
          status: "IDEA",
          photoUrls: [],
          notes: idea.description,
        },
      });
      await prisma.productModelStatusLog.create({
        data: {
          productModelId: newModel.id,
          toStatus: "IDEA",
          changedById: session.user.id,
          comment: `Создано из идеи: ${idea.title}`,
        },
      });
      const updated = await prisma.idea.update({
        where: { id },
        data: { status: "PROMOTED", promotedToModelId: newModel.id, rejectedReason: null },
      });
      return NextResponse.json({ ...updated, createdModelId: newModel.id });
    }

    const updated = await prisma.idea.update({ where: { id }, data });
    return NextResponse.json(updated);
  } catch (e) {
    return apiError(e);
  }
}
