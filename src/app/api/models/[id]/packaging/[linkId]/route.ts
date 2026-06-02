import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, apiError } from "@/server/api-helpers";
import { assertCan } from "@/lib/rbac";
import { logAudit } from "@/server/audit";
import { z } from "zod";

const patchSchema = z.object({
  quantityPerUnit: z.union([z.number(), z.string()]).optional(),
});

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string; linkId: string }> }) {
  try {
    const session = await requireAuth();
    const { linkId } = await ctx.params;
    assertCan(session.user.role, "packaging.manage"); // гард RBAC
    const data = patchSchema.parse(await req.json());
    const updated = await prisma.modelPackaging.update({
      where: { id: linkId },
      data: {
        ...(data.quantityPerUnit !== undefined && { quantityPerUnit: Number(data.quantityPerUnit) }),
      },
    });
    await logAudit({
      action: "UPDATE",
      entityType: "ModelPackaging",
      entityId: linkId,
      userId: session.user.id,
      changes: { ...(data.quantityPerUnit !== undefined && { quantityPerUnit: Number(data.quantityPerUnit) }) },
    });
    return NextResponse.json(updated);
  } catch (e) {
    return apiError(e);
  }
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string; linkId: string }> }) {
  try {
    const session = await requireAuth();
    const { linkId } = await ctx.params;
    assertCan(session.user.role, "packaging.manage"); // гард RBAC
    await prisma.modelPackaging.delete({ where: { id: linkId } });
    await logAudit({
      action: "DELETE",
      entityType: "ModelPackaging",
      entityId: linkId,
      userId: session.user.id,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}
