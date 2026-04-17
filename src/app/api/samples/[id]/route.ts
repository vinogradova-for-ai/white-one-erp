import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, apiError } from "@/server/api-helpers";
import { z } from "zod";

const samplePatchSchema = z.object({
  plannedShootDate: z.string().nullable().optional(),
  shootCompleted: z.boolean().optional(),
  photoUrls: z.array(z.string()).optional(),
  notes: z.string().nullable().optional(),
  approvedPhotoUrl: z.string().nullable().optional().transform((v) => (v === "" ? null : v)),
});

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireAuth();
    const { id } = await ctx.params;
    const sample = await prisma.sample.findUnique({
      where: { id },
      include: {
        productModel: true,
        productVariant: true,
        approvedBy: { select: { name: true } },
      },
    });
    if (!sample) return NextResponse.json({ error: { code: "not_found" } }, { status: 404 });
    return NextResponse.json(sample);
  } catch (e) {
    return apiError(e);
  }
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireAuth();
    const { id } = await ctx.params;
    const data = samplePatchSchema.parse(await req.json());
    const processed: Record<string, unknown> = { ...data };
    if (typeof data.plannedShootDate === "string") {
      processed.plannedShootDate = data.plannedShootDate ? new Date(data.plannedShootDate) : null;
    }
    const updated = await prisma.sample.update({ where: { id }, data: processed });
    return NextResponse.json(updated);
  } catch (e) {
    return apiError(e);
  }
}
