import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, apiError } from "@/server/api-helpers";
import { z } from "zod";

// Универсальные комментарии. На текущем этапе entityType: "model" | "order".

const ENTITY_TYPES = ["model", "order"] as const;

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
    const comments = await prisma.comment.findMany({
      where: { entityType, entityId, deletedAt: null },
      orderBy: { createdAt: "desc" },
    });
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
      })),
    });
  } catch (err) {
    return apiError(err);
  }
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
