import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth, apiError } from "@/server/api-helpers";
import { logAudit } from "@/server/audit";
import { Role } from "@prisma/client";

const ROLES: ReadonlyArray<Role> = [
  "OWNER", "DIRECTOR", "PRODUCT_MANAGER", "ASSISTANT",
  "CONTENT_MANAGER", "LOGISTICS", "CUSTOMS", "WB_MANAGER", "INTERN",
];

const schema = z.object({
  name: z.string().min(1).max(80),
  email: z.string().email(),
  role: z.enum(ROLES as [Role, ...Role[]]).optional(),
});

// POST /api/admin/users — создаёт нового сотрудника.
// Пароль по умолчанию whiteone2026 (общий стартовый, юзер потом поменяет).
export async function POST(req: Request) {
  try {
    const session = await requireAuth();
    if (session.user.role !== "OWNER" && session.user.role !== "DIRECTOR") {
      return NextResponse.json({ error: { code: "forbidden" } }, { status: 403 });
    }
    const data = schema.parse(await req.json());
    const exists = await prisma.user.findUnique({ where: { email: data.email.toLowerCase() } });
    if (exists) {
      return NextResponse.json(
        { error: { code: "exists", message: "Email уже занят" } },
        { status: 400 },
      );
    }
    const passwordHash = await bcrypt.hash("whiteone2026", 10);
    const user = await prisma.user.create({
      data: {
        name: data.name,
        email: data.email.toLowerCase(),
        passwordHash,
        role: data.role ?? "ASSISTANT",
        isActive: true,
      },
      select: { id: true, name: true, email: true },
    });
    await logAudit({
      action: "CREATE",
      entityType: "User",
      entityId: user.id,
      userId: session.user.id,
      changes: {
        name: data.name,
        email: data.email.toLowerCase(),
        role: data.role ?? "ASSISTANT",
      },
    });
    return NextResponse.json(user);
  } catch (e) {
    return apiError(e);
  }
}
