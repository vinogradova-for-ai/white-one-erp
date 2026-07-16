import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth, apiError } from "@/server/api-helpers";
import { logAudit } from "@/server/audit";

const schema = z.object({
  current: z.string().min(1, "Введите текущий пароль"),
  next: z.string().min(8, "Новый пароль — минимум 8 символов").max(72),
});

// POST /api/profile/password — смена СВОЕГО пароля (любой залогиненный).
export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth();
    const data = schema.parse(await req.json());

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { passwordHash: true },
    });
    if (!user) {
      return NextResponse.json({ error: { code: "not_found" } }, { status: 404 });
    }
    const ok = await bcrypt.compare(data.current, user.passwordHash);
    if (!ok) {
      return NextResponse.json(
        { error: { code: "wrong_password", message: "Текущий пароль не подходит" } },
        { status: 400 },
      );
    }
    const passwordHash = await bcrypt.hash(data.next, 10);
    await prisma.user.update({ where: { id: session.user.id }, data: { passwordHash } });
    await logAudit({
      action: "UPDATE",
      entityType: "User",
      entityId: session.user.id,
      userId: session.user.id,
      changes: { password: "changed" },
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}
