import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, apiError } from "@/server/api-helpers";
import { sampleStatusChangeSchema } from "@/lib/validators/sample";
import { canMoveSampleStatus, SAMPLE_STATUS_DATE_FIELDS } from "@/lib/status-machine/sample-statuses";

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAuth();
    const { id } = await ctx.params;

    const sample = await prisma.sample.findUnique({ where: { id } });
    if (!sample) return NextResponse.json({ error: { code: "not_found" } }, { status: 404 });

    const body = sampleStatusChangeSchema.parse(await req.json());
    const check = canMoveSampleStatus(sample.status, body.toStatus, session.user.role);

    if (!check.ok) {
      return NextResponse.json({ error: { code: "invalid_transition", message: check.reason } }, { status: 400 });
    }
    if (check.requiresComment && !body.comment?.trim()) {
      return NextResponse.json(
        { error: { code: "comment_required", message: "Откат требует комментарий" } },
        { status: 400 },
      );
    }
    if (body.toStatus === "APPROVED" && !body.approvalComment?.trim()) {
      return NextResponse.json(
        { error: { code: "approval_comment_required", message: "Добавьте комментарий утверждения" } },
        { status: 400 },
      );
    }

    const dateField = SAMPLE_STATUS_DATE_FIELDS[body.toStatus];
    const data: Record<string, unknown> = {
      status: body.toStatus,
      ...(dateField ? { [dateField]: new Date() } : {}),
    };
    if (body.toStatus === "APPROVED") {
      data.approvedById = session.user.id;
      data.approvalComment = body.approvalComment;
      if (body.approvedPhotoUrl) data.approvedPhotoUrl = body.approvedPhotoUrl;
    }

    const updated = await prisma.$transaction(async (tx) => {
      const upd = await tx.sample.update({ where: { id }, data });
      await tx.sampleStatusLog.create({
        data: {
          sampleId: id,
          fromStatus: sample.status,
          toStatus: body.toStatus,
          changedById: session.user.id,
          comment: body.comment,
        },
      });
      return upd;
    });
    return NextResponse.json(updated);
  } catch (e) {
    return apiError(e);
  }
}
