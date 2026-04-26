import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, apiError } from "@/server/api-helpers";
import { assertCan } from "@/lib/rbac";
import { factoryCreateSchema } from "@/lib/validators/factory";

export async function GET() {
  try {
    await requireAuth();
    const items = await prisma.factory.findMany({
      orderBy: [{ isActive: "desc" }, { name: "asc" }],
      include: {
        _count: { select: { orders: true, preferredForModels: true } },
      },
    });
    return NextResponse.json({ items });
  } catch (e) {
    return apiError(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth();
    assertCan(session.user.role, "factory.manage");
    const data = factoryCreateSchema.parse(await req.json());

    const existing = await prisma.factory.findUnique({ where: { name: data.name } });
    if (existing) {
      return NextResponse.json(
        { error: { code: "conflict", message: "Фабрика с таким названием уже есть" } },
        { status: 409 },
      );
    }

    const factory = await prisma.factory.create({
      data: {
        name: data.name,
        country: data.country,
        city: data.city ?? null,
        contactName: data.contactName ?? null,
        contactInfo: data.contactInfo ?? null,
        capacityPerMonth: data.capacityPerMonth ?? null,
        notes: data.notes ?? null,
        isActive: data.isActive ?? true,
      },
    });
    return NextResponse.json(factory, { status: 201 });
  } catch (e) {
    return apiError(e);
  }
}
