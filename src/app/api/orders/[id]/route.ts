import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, apiError } from "@/server/api-helpers";
import { orderUpdateSchema } from "@/lib/validators/order";
import { z } from "zod";

// Универсальная схема для обновления заказа (поля + флаги + даты)
const fullOrderPatchSchema = orderUpdateSchema.extend({
  // Флаги
  packagingOrdered: z.boolean().optional(),
  wbCardReady: z.boolean().optional(),
  hasIssue: z.boolean().optional(),

  // Оплаты (старые поля оставлены для обратной совместимости)
  prepaymentDate: z.string().nullable().optional(),
  prepaymentPaid: z.boolean().optional(),
  finalPaymentDate: z.string().nullable().optional(),
  finalPaymentPaid: z.boolean().optional(),

  // Даты этапов (могут проставляться вручную)
  decisionDate: z.string().nullable().optional(),
  handedToFactoryDate: z.string().nullable().optional(),
  sewingStartDate: z.string().nullable().optional(),
  readyAtFactoryDate: z.string().nullable().optional(),
  shipmentDate: z.string().nullable().optional(),
  arrivalPlannedDate: z.string().nullable().optional(),
  arrivalActualDate: z.string().nullable().optional(),
  packingDoneDate: z.string().nullable().optional(),
  wbShipmentDate: z.string().nullable().optional(),
  saleStartDate: z.string().nullable().optional(),
});

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireAuth();
    const { id } = await ctx.params;
    const order = await prisma.order.findFirst({
      where: { id, deletedAt: null },
      include: {
        productModel: { include: { sizeGrid: true } },
        lines: {
          include: { productVariant: true },
          orderBy: { createdAt: "asc" },
        },
        factory: true,
        owner: { select: { id: true, name: true } },
      },
    });
    if (!order) return NextResponse.json({ error: { code: "not_found" } }, { status: 404 });
    return NextResponse.json(order);
  } catch (e) {
    return apiError(e);
  }
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAuth();
    const { id } = await ctx.params;

    const existing = await prisma.order.findFirst({ where: { id, deletedAt: null } });
    if (!existing) return NextResponse.json({ error: { code: "not_found" } }, { status: 404 });

    const raw = await req.json();
    const data = fullOrderPatchSchema.parse(raw);

    // Преобразуем строки дат в Date
    const dateFields = [
      "prepaymentDate", "finalPaymentDate", "decisionDate",
      "handedToFactoryDate", "sewingStartDate", "readyAtFactoryDate",
      "shipmentDate", "arrivalPlannedDate", "arrivalActualDate",
      "packingDoneDate", "wbShipmentDate", "saleStartDate",
    ] as const;

    const processed: Record<string, unknown> = { ...data };
    for (const f of dateFields) {
      const v = processed[f];
      if (typeof v === "string") processed[f] = v ? new Date(v) : null;
    }

    const updated = await prisma.order.update({ where: { id }, data: processed });
    return NextResponse.json(updated);
  } catch (e) {
    return apiError(e);
  }
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAuth();
    if (session.user.role !== "OWNER" && session.user.role !== "DIRECTOR") {
      return NextResponse.json({ error: { code: "forbidden", message: "Удаление доступно только руководителям" } }, { status: 403 });
    }
    const { id } = await ctx.params;
    await prisma.order.update({ where: { id }, data: { deletedAt: new Date() } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}
