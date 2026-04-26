import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, apiError } from "@/server/api-helpers";
import { assertCan } from "@/lib/rbac";
import { variantCreateSchema } from "@/lib/validators/variant";
import { Prisma } from "@prisma/client";

export async function GET() {
  try {
    await requireAuth();
    const items = await prisma.productVariant.findMany({
      where: { deletedAt: null },
      orderBy: { updatedAt: "desc" },
      take: 200,
      include: { productModel: { select: { name: true } } },
    });
    return NextResponse.json({ items });
  } catch (e) {
    return apiError(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth();
    assertCan(session.user.role, "product.create");
    const data = variantCreateSchema.parse(await req.json());

    const variant = await prisma.productVariant.create({
      data: data as Prisma.ProductVariantUncheckedCreateInput,
    });
    await prisma.productVariantStatusLog.create({
      data: {
        productVariantId: variant.id,
        toStatus: variant.status,
        changedById: session.user.id,
        comment: "Создание",
      },
    });
    return NextResponse.json(variant, { status: 201 });
  } catch (e) {
    return apiError(e);
  }
}
