import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, apiError } from "@/server/api-helpers";
import { assertCan } from "@/lib/rbac";
import { modelCreateSchema } from "@/lib/validators/model";
import { logAudit } from "@/server/audit";
import { generateArtikulBase } from "@/server/artikul";
import { Prisma } from "@prisma/client";

export async function GET(req: NextRequest) {
  try {
    await requireAuth();
    const sp = req.nextUrl.searchParams;
    const where: Prisma.ProductModelWhereInput = { deletedAt: null };
    if (sp.get("status")) where.status = sp.get("status")! as Prisma.ProductModelWhereInput["status"];
    if (sp.get("category")) where.category = sp.get("category")!;
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
    // Метка для латинского артикула приходит отдельно (не колонка БД). Пусто = возьмём из названия.
    const artikulStyle = typeof body.artikulStyle === "string" ? body.artikulStyle : "";
    const data = modelCreateSchema.parse(body);

    // База артикула (vendorCode на WB) — алфавит выбирает страна, номер для России авто.
    const artikulBase = await generateArtikulBase({
      category: data.category,
      country: data.countryOfOrigin,
      name: data.name,
      styleWord: artikulStyle,
    });

    // Маржу/ROI/наценку не считаем — Алёна явно убрала это из скоупа сервиса.
    const model = await prisma.productModel.create({
      data: {
        ...data,
        artikulBase,
        patternsUrl: data.patternsUrl || null,
      } as Prisma.ProductModelUncheckedCreateInput,
    });
    await prisma.productModelStatusLog.create({
      data: {
        productModelId: model.id,
        toStatus: model.status,
        changedById: session.user.id,
        comment: "Создание",
      },
    });
    await logAudit({
      action: "CREATE",
      entityType: "ProductModel",
      entityId: model.id,
      userId: session.user.id,
      changes: { name: model.name, category: model.category },
    });
    return NextResponse.json(model, { status: 201 });
  } catch (e) {
    return apiError(e);
  }
}
