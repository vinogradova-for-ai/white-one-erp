import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, apiError } from "@/server/api-helpers";
import { z } from "zod";

// Универсальные комментарии. entityType: "model" | "order" | "variant".
//
// Алёна (27.05.2026): «Система комментариев должна автоматически протягиваться
// по заказам и цветомоделям». Реализовано через флаг includeRelated:
//   • На странице фасона — поток объединяет комменты фасона + заказов + вариантов
//   • На странице заказа — поток объединяет комменты заказа + связанного фасона
//   • Метка contextLabel: «ORD-...» для заказа, «цв. <название>» для варианта,
//     «к фасону» для родительского фасона.

const ENTITY_TYPES = ["model", "order", "variant"] as const;

const createSchema = z.object({
  entityType: z.enum(ENTITY_TYPES),
  entityId: z.string().min(1),
  body: z.string().trim().min(1, "Пустой комментарий"),
  photoUrls: z.array(z.string()).optional(),
});

export async function GET(req: NextRequest) {
  try {
    await requireAuth();
    const sp = req.nextUrl.searchParams;
    const entityType = sp.get("entityType");
    const entityId = sp.get("entityId");
    if (!entityType || !entityId) {
      return NextResponse.json(
        { error: { code: "bad_request", message: "Параметры entityType и entityId обязательны" } },
        { status: 400 },
      );
    }
    if (!ENTITY_TYPES.includes(entityType as (typeof ENTITY_TYPES)[number])) {
      return NextResponse.json(
        { error: { code: "bad_request", message: "Неизвестный entityType" } },
        { status: 400 },
      );
    }
    // includeOrders=1 (legacy) или includeRelated=1 — миксованный поток.
    const includeRelated =
      sp.get("includeOrders") === "1" || sp.get("includeRelated") === "1";

    let orderRefs: Array<{ id: string; orderNumber: string }> = [];
    let variantRefs: Array<{ id: string; colorName: string }> = [];
    let parentModelId: string | null = null;

    if (includeRelated) {
      if (entityType === "model") {
        // Фасон → тянем все его заказы + все его варианты.
        [orderRefs, variantRefs] = await Promise.all([
          prisma.order.findMany({
            where: { productModelId: entityId, deletedAt: null },
            select: { id: true, orderNumber: true },
          }),
          prisma.productVariant.findMany({
            where: { productModelId: entityId, deletedAt: null },
            select: { id: true, colorName: true },
          }),
        ]);
      } else if (entityType === "order") {
        // Заказ → тянем комменты родительского фасона (общий контекст).
        const order = await prisma.order.findUnique({
          where: { id: entityId },
          select: { productModelId: true },
        });
        parentModelId = order?.productModelId ?? null;
      } else if (entityType === "variant") {
        // Вариант → тянем комменты родительского фасона.
        const variant = await prisma.productVariant.findUnique({
          where: { id: entityId },
          select: { productModelId: true },
        });
        parentModelId = variant?.productModelId ?? null;
      }
    }

    const orWhere: Array<Record<string, unknown>> = [
      { entityType, entityId, deletedAt: null },
    ];
    if (orderRefs.length > 0) {
      orWhere.push({ entityType: "order", entityId: { in: orderRefs.map((o) => o.id) }, deletedAt: null });
    }
    if (variantRefs.length > 0) {
      orWhere.push({ entityType: "variant", entityId: { in: variantRefs.map((v) => v.id) }, deletedAt: null });
    }
    if (parentModelId) {
      orWhere.push({ entityType: "model", entityId: parentModelId, deletedAt: null });
    }
    const comments = await prisma.comment.findMany({
      where: { OR: orWhere },
      orderBy: { createdAt: "desc" },
    });
    const orderNumberByEntityId = new Map(orderRefs.map((o) => [o.id, o.orderNumber]));
    const colorByVariantId = new Map(variantRefs.map((v) => [v.id, v.colorName]));

    // Подтягиваем имена авторов одним запросом.
    const authorIds = [...new Set(comments.map((c) => c.authorId))];
    const authors = authorIds.length === 0
      ? []
      : await prisma.user.findMany({
          where: { id: { in: authorIds } },
          select: { id: true, name: true },
        });
    const authorMap = new Map(authors.map((a) => [a.id, a.name]));
    return NextResponse.json({
      comments: comments.map((c) => ({
        ...c,
        authorName: authorMap.get(c.authorId) ?? "—",
        contextLabel: labelForComment(c, {
          entityType,
          entityId,
          orderNumberByEntityId,
          colorByVariantId,
          parentModelId,
        }),
      })),
    });
  } catch (err) {
    return apiError(err);
  }
}

function labelForComment(
  c: { entityType: string; entityId: string },
  ctx: {
    entityType: string;
    entityId: string;
    orderNumberByEntityId: Map<string, string>;
    colorByVariantId: Map<string, string>;
    parentModelId: string | null;
  },
): string | null {
  // На своей сущности — без метки.
  if (c.entityType === ctx.entityType && c.entityId === ctx.entityId) return null;
  if (c.entityType === "order") {
    return ctx.orderNumberByEntityId.get(c.entityId) ?? "заказ";
  }
  if (c.entityType === "variant") {
    const color = ctx.colorByVariantId.get(c.entityId);
    return color ? `цв. ${color}` : "вариант";
  }
  if (c.entityType === "model" && ctx.parentModelId === c.entityId) {
    return "к фасону";
  }
  return null;
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth();
    const body = await req.json();
    const parsed = createSchema.parse(body);
    const authorId = (session.user as { id: string }).id;
    const created = await prisma.comment.create({
      data: {
        entityType: parsed.entityType,
        entityId: parsed.entityId,
        authorId,
        body: parsed.body,
        photoUrls: parsed.photoUrls ?? [],
      },
    });
    return NextResponse.json({ comment: created });
  } catch (err) {
    return apiError(err);
  }
}
