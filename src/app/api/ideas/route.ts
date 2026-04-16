import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, apiError } from "@/server/api-helpers";
import { ideaCreateSchema } from "@/lib/validators/idea";

export async function GET() {
  try {
    await requireAuth();
    const items = await prisma.idea.findMany({
      orderBy: [{ priority: "asc" }, { createdAt: "desc" }],
      include: { createdBy: { select: { name: true } } },
    });
    return NextResponse.json({ items });
  } catch (e) {
    return apiError(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth();
    const data = ideaCreateSchema.parse(await req.json());
    const idea = await prisma.idea.create({
      data: { ...data, createdById: session.user.id },
    });
    return NextResponse.json(idea, { status: 201 });
  } catch (e) {
    return apiError(e);
  }
}
