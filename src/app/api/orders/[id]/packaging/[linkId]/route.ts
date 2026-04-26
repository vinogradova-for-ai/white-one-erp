import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, apiError } from "@/server/api-helpers";
import { z } from "zod";

const patchSchema = z.object({
  quantityPerUnit: z.union([z.number(), z.string()]).optional(),
  notes: z.string().optional().nullable(),
});

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string; linkId: string }> }) {
  try {
    await requireAuth();
    const { linkId } = await ctx.params;
    const data = patchSchema.parse(await req.json());
    const updated = await prisma.orderPackaging.update({
      where: { id: linkId },
      data: {
        ...(data.quantityPerUnit !== undefined && { quantityPerUnit: Number(data.quantityPerUnit) }),
        ...(data.notes !== undefined && { notes: data.notes }),
      },
    });
    return NextResponse.json(updated);
  } catch (e) {
    return apiError(e);
  }
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string; linkId: string }> }) {
  try {
    await requireAuth();
    const { linkId } = await ctx.params;
    await prisma.orderPackaging.delete({ where: { id: linkId } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}
