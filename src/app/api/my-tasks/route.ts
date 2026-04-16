import { NextResponse } from "next/server";
import { requireAuth, apiError } from "@/server/api-helpers";
import { getMyTasks } from "@/lib/queries/my-tasks";

export async function GET() {
  try {
    const session = await requireAuth();
    const tasks = await getMyTasks(session.user.id, session.user.role);
    return NextResponse.json({ tasks });
  } catch (e) {
    return apiError(e);
  }
}
