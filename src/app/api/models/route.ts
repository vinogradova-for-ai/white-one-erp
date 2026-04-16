import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, apiError } from "@/server/api-helpers";
import { assertCan } from "@/lib/rbac";
import { modelCreateSchema } from "@/lib/validators/model";
import { Prisma } from "@prisma/client";

export async function GET(req: NextRequest) {
  try {
    await requireAuth();
    const sp = req.nextUrl.searchParams;
    const where: Prisma.ProductModelWhereInput = { deletedAt: null };
    if (sp.get("status")) where.status = sp.get("status")! as Prisma.ProductModelWhereInput["status"];
    if (sp.get("category")) where.category = sp.get("category")!;
    if (sp.get("tag")) where.tags = { has: sp.get("tag")! };
    if (sp.get("ownerId")) where.ownerId = sp.get("ownerId")!;
    if (sp.get("q")) where.name = { contains: sp.get("q")!, mode: "insensitive" };

    const [items, total] = await Promise.all([
      prisma.productModel.findMany({
        where,
        orderBy: { updatedAt: "desc" },
        take: 200,
        include: {
          owner: { select: { id: true, name: true } },
          preferredFactory: { select: { id: true, name: true } },
          _count: { select: { variants: true } },
        },
      }),
      prisma.productModel.count({ where }),
    ]);

    return NextResponse.json({ items, total });
  } catch (e) {
    return apiError(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth();
    assertCan(session.user.role, "product.create");
    const body = await req.json();
    const data = modelCreateSchema.parse(body);

    const model = await prisma.productModel.create({
      data: {
        ...data,
        patternsUrl: data.patternsUrl || null,
        techPackUrl: data.techPackUrl || null,
        sampleApprovalUrl: data.sampleApprovalUrl || null,
      },
    });
    await prisma.productModelStatusLog.create({
      data: {
        productModelId: model.id,
        toStatus: model.status,
        changedById: session.user.id,
        comment: "Создание",
      },
    });
    return NextResponse.json(model, { status: 201 });
  } catch (e) {
    return apiError(e);
  }
}
