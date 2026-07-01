import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth, apiError } from "@/server/api-helpers";
import { logAudit } from "@/server/audit";
import { Role } from "@prisma/client";

const ROLES: ReadonlyArray<Role> = [
  "OWNER", "DIRECTOR", "PRODUCT_MANAGER", "ASSISTANT",
  "CONTENT_MANAGER", "LOGISTICS", "CUSTOMS", "WB_MANAGER", "INTERN",
];

const schema = z.object({ role: z.enum(ROLES as [Role, ...Role[]]) });

// PATCH /api/admin/users/[id]/role — смена роли сотрудника.
// OWNER/DIRECTOR; трогать роли OWNER/DIRECTOR (снять или назначить) может только OWNER.
// Свою роль менять нельзя — чтобы владелец случайно не запер сам себя.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAuth();
    const actorRole = session.user.role;
    if (actorRole !== "OWNER" && actorRole !== "DIRECTOR") {
      return NextResponse.json({ error: { code: "forbidden" } }, { status: 403 });
    }
    const { id } = await params;
    if (id === session.user.id) {
      return NextResponse.json(
        { error: { code: "forbidden", message: "Свою роль менять нельзя" } },
        { status: 403 },
      );
    }
    const { role } = schema.parse(await req.json());

    const target = await prisma.user.findUnique({ where: { id }, select: { role: true, name: true } });
    if (!target) {
      return NextResponse.json({ error: { code: "not_found" } }, { status: 404 });
    }
    const touchesAdmin = ["OWNER", "DIRECTOR"].includes(role) || ["OWNER", "DIRECTOR"].includes(target.role);
    if (touchesAdmin && actorRole !== "OWNER") {
      return NextResponse.json(
        { error: { code: "forbidden", message: "Роли владельца/руководителя меняет только владелец" } },
        { status: 403 },
      );
    }

    const user = await prisma.user.update({
      where: { id },
      data: { role },
      select: { id: true, name: true, role: true },
    });
    await logAudit({
      action: "UPDATE",
      entityType: "User",
      entityId: id,
      userId: session.user.id,
      changes: { role: { from: target.role, to: role } },
    });
    return NextResponse.json(user);
  } catch (e) {
    return apiError(e);
  }
}
