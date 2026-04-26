import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, apiError } from "@/server/api-helpers";
import { assertCan } from "@/lib/rbac";
import { factoryUpdateSchema } from "@/lib/validators/factory";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireAuth();
    const { id } = await ctx.params;
    const f = await prisma.factory.findUnique({
      where: { id },
      include: { _count: { select: { orders: true, preferredForModels: true } } },
    });
    if (!f) return NextResponse.json({ error: { code: "not_found" } }, { status: 404 });
    return NextResponse.json(f);
  } catch (e) {
    return apiError(e);
  }
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAuth();
    assertCan(session.user.role, "factory.manage");
    const { id } = await ctx.params;
    const data = factoryUpdateSchema.parse(await req.json());

    const f = await prisma.factory.findUnique({ where: { id } });
    if (!f) return NextResponse.json({ error: { code: "not_found" } }, { status: 404 });

    if (data.name && data.name !== f.name) {
      const collision = await prisma.factory.findUnique({ where: { name: data.name } });
      if (collision) {
        return NextResponse.json(
          { error: { code: "conflict", message: "Фабрика с таким названием уже есть" } },
          { status: 409 },
        );
      }
    }

    const updated = await prisma.factory.update({ where: { id }, data });
    return NextResponse.json(updated);
  } catch (e) {
    return apiError(e);
  }
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAuth();
    assertCan(session.user.role, "factory.manage");
    const { id } = await ctx.params;
    const f = await prisma.factory.findUnique({
      where: { id },
      include: { _count: { select: { orders: true, preferredForModels: true } } },
    });
    if (!f) return NextResponse.json({ error: { code: "not_found" } }, { status: 404 });

    const usedByOrders = f._count.orders;
    const usedByModels = f._count.preferredForModels;

    if (usedByOrders > 0 || usedByModels > 0) {
      return NextResponse.json(
        {
          error: {
            code: "in_use",
            message: `Нельзя удалить: фабрика используется в ${usedByOrders} заказах и ${usedByModels} фасонах. Отправьте в архив вместо удаления.`,
          },
        },
        { status: 409 },
      );
    }

    await prisma.factory.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}
