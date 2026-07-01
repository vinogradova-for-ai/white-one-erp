import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth, apiError } from "@/server/api-helpers";
import { logAudit } from "@/server/audit";
import { generateStartPassword } from "@/server/start-password";
import { Role } from "@prisma/client";

const ROLES: ReadonlyArray<Role> = [
  "OWNER", "DIRECTOR", "PRODUCT_MANAGER", "ASSISTANT",
  "CONTENT_MANAGER", "LOGISTICS", "CUSTOMS", "WB_MANAGER", "INTERN",
];

const schema = z.object({
  name: z.string().min(1).max(80),
  // Логин — произвольная строка (не обязательно e-mail), хранится в поле email.
  email: z.string().min(1).max(60),
  role: z.enum(ROLES as [Role, ...Role[]]).optional(),
});

// POST /api/admin/users — создаёт нового сотрудника.
// Стартовый пароль генерируется индивидуально и возвращается ОДИН раз в ответе.
export async function POST(req: Request) {
  try {
    const session = await requireAuth();
    if (session.user.role !== "OWNER" && session.user.role !== "DIRECTOR") {
      return NextResponse.json({ error: { code: "forbidden" } }, { status: 403 });
    }
    const data = schema.parse(await req.json());
    // Роли OWNER/DIRECTOR может назначать только владелец
    if (data.role && ["OWNER", "DIRECTOR"].includes(data.role) && session.user.role !== "OWNER") {
      return NextResponse.json({ error: { code: "forbidden" } }, { status: 403 });
    }
    const exists = await prisma.user.findUnique({ where: { email: data.email.toLowerCase() } });
    if (exists) {
      return NextResponse.json(
        { error: { code: "exists", message: "Email уже занят" } },
        { status: 400 },
      );
    }
    const startPassword = generateStartPassword();
    const passwordHash = await bcrypt.hash(startPassword, 10);
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
    // startPassword отдаётся один раз, в БД хранится только hash
    return NextResponse.json({ ...user, startPassword });
  } catch (e) {
    return apiError(e);
  }
}
