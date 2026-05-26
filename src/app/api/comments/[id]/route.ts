import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, apiError } from "@/server/api-helpers";

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAuth();
    const { id } = await ctx.params;
    const user = session.user as { id: string; role: string };

    const comment = await prisma.comment.findUnique({ where: { id } });
    if (!comment || comment.deletedAt) {
      return NextResponse.json(
        { error: { code: "not_found", message: "Комментарий не найден" } },
        { status: 404 },
      );
    }
    // Удалять может автор или администратор (OWNER/DIRECTOR).
    const isAdmin = user.role === "OWNER" || user.role === "DIRECTOR";
    if (comment.authorId !== user.id && !isAdmin) {
      return NextResponse.json(
        { error: { code: "forbidden", message: "Можно удалить только свой комментарий" } },
        { status: 403 },
      );
    }
    await prisma.comment.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return apiError(err);
  }
}
