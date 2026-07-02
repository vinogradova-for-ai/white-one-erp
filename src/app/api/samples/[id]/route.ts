import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth, apiError } from "@/server/api-helpers";
import { assertCan } from "@/lib/rbac";
import { logAudit } from "@/server/audit";

const sampleUpdateSchema = z.object({
  status: z.enum(["ORDERED", "IN_TRANSIT", "RECEIVED", "APPROVED", "REWORK"]).optional(),
  label: z.string().max(200).optional().nullable(),
  verdictNote: z.string().max(2000).optional().nullable(),
  photoUrls: z.array(z.string()).max(20).optional(),
});

// PATCH /api/samples/[id] — статус/подпись/вердикт/фото образца.
// Даты проставляются автоматически по переходу статуса:
//   RECEIVED → receivedDate, APPROVED/REWORK → verdictDate (+receivedDate, если пропустили шаг).
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAuth();
    assertCan(session.user.role, "product.update");
    const { id } = await params;

    const data = sampleUpdateSchema.parse(await req.json());

    const sample = await prisma.sample.findFirst({ where: { id, deletedAt: null } });
    if (!sample) {
      return NextResponse.json({ error: { code: "not_found" } }, { status: 404 });
    }

    const now = new Date();
    const dates: Record<string, Date> = {};
    if (data.status && data.status !== sample.status) {
      if (data.status === "RECEIVED" && !sample.receivedDate) dates.receivedDate = now;
      if (data.status === "APPROVED" || data.status === "REWORK") {
        dates.verdictDate = now;
        if (!sample.receivedDate) dates.receivedDate = now;
      }
    }

    await prisma.sample.update({
      where: { id },
      data: {
        ...(data.status ? { status: data.status } : {}),
        ...(data.label !== undefined ? { label: data.label || null } : {}),
        ...(data.verdictNote !== undefined ? { verdictNote: data.verdictNote || null } : {}),
        ...(data.photoUrls ? { photoUrls: data.photoUrls } : {}),
        ...dates,
      },
    });

    await logAudit({
      action: "UPDATE",
      entityType: "Sample",
      entityId: id,
      userId: session.user.id,
      changes: { ...data },
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}

// DELETE /api/samples/[id] — мягкое удаление (только админы; записи не стираем).
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAuth();
    assertCan(session.user.role, "product.delete");
    const { id } = await params;

    const sample = await prisma.sample.findFirst({ where: { id, deletedAt: null } });
    if (!sample) {
      return NextResponse.json({ error: { code: "not_found" } }, { status: 404 });
    }

    await prisma.sample.update({ where: { id }, data: { deletedAt: new Date() } });

    await logAudit({
      action: "DELETE",
      entityType: "Sample",
      entityId: id,
      userId: session.user.id,
      changes: {},
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}
