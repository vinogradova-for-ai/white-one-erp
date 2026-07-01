import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { requireAuth, apiError } from "@/server/api-helpers";
import { logAudit } from "@/server/audit";
import { generateStartPassword } from "@/server/start-password";

// POST /api/admin/users/[id]/reset-password — сброс пароля сотрудника.
// OWNER/DIRECTOR; пароль OWNER/DIRECTOR сбрасывает только OWNER.
// Новый временный пароль возвращается ОДИН раз, в БД хранится только hash.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAuth();
    const actorRole = session.user.role;
    if (actorRole !== "OWNER" && actorRole !== "DIRECTOR") {
      return NextResponse.json({ error: { code: "forbidden" } }, { status: 403 });
    }
    const { id } = await params;
    const target = await prisma.user.findUnique({ where: { id }, select: { role: true, name: true } });
    if (!target) {
      return NextResponse.json({ error: { code: "not_found" } }, { status: 404 });
    }
    if (["OWNER", "DIRECTOR"].includes(target.role) && actorRole !== "OWNER" && id !== session.user.id) {
      return NextResponse.json(
        { error: { code: "forbidden", message: "Пароль владельца/руководителя сбрасывает только владелец" } },
        { status: 403 },
      );
    }

    const tempPassword = generateStartPassword();
    const passwordHash = await bcrypt.hash(tempPassword, 10);
    await prisma.user.update({ where: { id }, data: { passwordHash } });
    await logAudit({
      action: "UPDATE",
      entityType: "User",
      entityId: id,
      userId: session.user.id,
      changes: { password: "reset" },
    });
    return NextResponse.json({ id, tempPassword });
  } catch (e) {
    return apiError(e);
  }
}
