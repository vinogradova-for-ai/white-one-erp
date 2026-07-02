import { NextRequest, NextResponse } from "next/server";
import { requireAuth, apiError } from "@/server/api-helpers";
import { assertCan } from "@/lib/rbac";
import { orderStatusChangeSchema } from "@/lib/validators/order";
import { changeOrderStatus } from "@/server/change-order-status";
import { ORDER_STATUS_DATE_FIELDS } from "@/lib/status-machine/order-statuses";

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAuth();
    const { id } = await ctx.params;
    assertCan(session.user.role, "order.updateStatus"); // RBAC: смена статуса заказа

    const { toStatus, comment, dateIso } = orderStatusChangeSchema.parse(await req.json());

    // Дата задним числом: если UI прислал dateIso — она перекрывает «сейчас»
    // в дате-поле статуса (extraData спредится после дефолта в changeOrderStatus).
    const dateField = ORDER_STATUS_DATE_FIELDS[toStatus];
    const extraData =
      dateIso && dateField ? { [dateField]: new Date(dateIso) } : undefined;

    // Единый путь смены статуса: гейт упаковки, списание consumedQty, откаты,
    // OrderStatusLog и аудит — всё внутри changeOrderStatus (общий с дашбордом).
    const result = await changeOrderStatus({
      orderId: id,
      toStatus,
      actorId: session.user.id,
      actorRole: session.user.role,
      comment,
      extraData,
    });

    if (!result.ok) {
      const status = result.code === "not_found" ? 404 : 400;
      return NextResponse.json(
        { error: { code: result.code, message: result.message } },
        { status },
      );
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}
