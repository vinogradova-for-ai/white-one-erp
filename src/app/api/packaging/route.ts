import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, apiError } from "@/server/api-helpers";
import { packagingCreateSchema } from "@/lib/validators/packaging";

export async function GET() {
  try {
    await requireAuth();
    const items = await prisma.packagingItem.findMany({
      orderBy: [{ isActive: "desc" }, { name: "asc" }],
      include: { _count: { select: { orderUsages: true } } },
    });
    return NextResponse.json({ items });
  } catch (e) {
    return apiError(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireAuth();
    const data = packagingCreateSchema.parse(await req.json());
    const item = await prisma.packagingItem.create({
      data: {
        name: data.name,
        type: data.type,
        sku: data.sku ?? null,
        description: data.description ?? null,
        photoUrl: data.photoUrl ?? null,
        stock: data.stock ?? 0,
        minStock: data.minStock ?? null,
        notes: data.notes ?? null,
        isActive: data.isActive ?? true,
      },
    });
    return NextResponse.json(item, { status: 201 });
  } catch (e) {
    return apiError(e);
  }
}
