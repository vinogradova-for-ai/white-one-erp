import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, apiError } from "@/server/api-helpers";

// Только OWNER/DIRECTOR могут переключать активность.
export async function PATCH(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAuth();
    if (session.user.role !== "OWNER" && session.user.role !== "DIRECTOR") {
      return NextResponse.json({ error: { code: "forbidden" } }, { status: 403 });
    }
    const { id } = await ctx.params;
    const u = await prisma.user.findUnique({ where: { id }, select: { isActive: true } });
    if (!u) return NextResponse.json({ error: { code: "not_found" } }, { status: 404 });
    await prisma.user.update({ where: { id }, data: { isActive: !u.isActive } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}
