import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, apiError } from "@/server/api-helpers";
import { packagingStatusChangeSchema } from "@/lib/validators/packaging";
import { PACKAGING_TRANSITIONS, PACKAGING_DATE_ON_STATUS } from "@/lib/status-machine/packaging-statuses";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAuth();
    const { id } = await params;

    const item = await prisma.packagingItem.findUnique({ where: { id } });
    if (!item) return NextResponse.json({ error: { code: "not_found" } }, { status: 404 });

    const { toStatus, comment } = packagingStatusChangeSchema.parse(await req.json());

    const allowed = PACKAGING_TRANSITIONS[item.status];
    const isAdmin = session.user.role === "OWNER" || session.user.role === "DIRECTOR";
    if (!allowed.includes(toStatus) && !isAdmin) {
      return NextResponse.json(
        { error: { code: "invalid_transition", message: "Нельзя перепрыгнуть статус" } },
        { status: 400 },
      );
    }

    // Если пытается откатить (не по прямому пути) — требуем OWNER/DIRECTOR + комментарий
    const isRollback = !allowed.includes(toStatus) && isAdmin;
    if (isRollback && !comment) {
      return NextResponse.json(
        { error: { code: "comment_required", message: "При откате нужен комментарий" } },
        { status: 400 },
      );
    }

    // Проставляем дату этапа автоматически (если соответствующее поле пустое)
    const dateField = PACKAGING_DATE_ON_STATUS[toStatus];
    const patch: Record<string, unknown> = { status: toStatus };
    if (dateField) {
      const current = (item as unknown as Record<string, unknown>)[dateField];
      if (!current) patch[dateField] = new Date();
    }

    const updated = await prisma.packagingItem.update({ where: { id }, data: patch });
    await prisma.packagingItemStatusLog.create({
      data: {
        packagingItemId: id,
        fromStatus: item.status,
        toStatus,
        comment: comment ?? null,
        changedById: session.user.id,
      },
    });

    // Платежи больше не создаются при смене статуса PackagingItem — они идут через PackagingOrder.

    return NextResponse.json(updated);
  } catch (e) {
    return apiError(e);
  }
}
