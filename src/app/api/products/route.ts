import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, apiError } from "@/server/api-helpers";
import { assertCan } from "@/lib/rbac";
import { productCreateSchema } from "@/lib/validators/product";
import { calculateProductEconomics } from "@/lib/calculations/product-cost";
import { Prisma } from "@prisma/client";

export async function GET(req: NextRequest) {
  try {
    await requireAuth();
    const sp = req.nextUrl.searchParams;

    const where: Prisma.ProductWhereInput = { deletedAt: null };
    if (sp.get("q")) {
      const q = sp.get("q")!;
      where.OR = [
        { sku: { contains: q, mode: "insensitive" } },
        { name: { contains: q, mode: "insensitive" } },
      ];
    }
    if (sp.get("status")) where.status = sp.get("status")! as Prisma.ProductWhereInput["status"];
    if (sp.get("brand")) where.brand = sp.get("brand")! as Prisma.ProductWhereInput["brand"];
    if (sp.get("category")) where.category = sp.get("category")!;
    if (sp.get("ownerId")) where.ownerId = sp.get("ownerId")!;

    const page = Math.max(1, Number(sp.get("page") ?? 1));
    const pageSize = Math.min(500, Math.max(1, Number(sp.get("pageSize") ?? 50)));

    const [items, total] = await Promise.all([
      prisma.product.findMany({
        where,
        orderBy: { updatedAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          owner: { select: { id: true, name: true } },
          preferredFactory: { select: { id: true, name: true } },
          _count: { select: { orders: true } },
        },
      }),
      prisma.product.count({ where }),
    ]);

    return NextResponse.json({
      items,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    });
  } catch (e) {
    return apiError(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth();
    assertCan(session.user.role, "product.create");

    const body = await req.json();
    const data = productCreateSchema.parse(body);

    const economics = calculateProductEconomics(data);

    const product = await prisma.product.create({
      data: {
        ...data,
        patternsUrl: data.patternsUrl || null,
        techDocsUrl: data.techDocsUrl || null,
        sampleUrl: data.sampleUrl || null,
        fullCost: economics.fullCost ?? null,
        marginBeforeDrr: economics.marginBeforeDrr ?? null,
        marginAfterDrrPct: economics.marginAfterDrrPct ?? null,
        roi: economics.roi ?? null,
        markupPct: economics.markupPct ?? null,
      },
    });

    await prisma.productStatusLog.create({
      data: {
        productId: product.id,
        toStatus: product.status,
        changedById: session.user.id,
        comment: "Создание",
      },
    });

    return NextResponse.json(product, { status: 201 });
  } catch (e) {
    return apiError(e);
  }
}
