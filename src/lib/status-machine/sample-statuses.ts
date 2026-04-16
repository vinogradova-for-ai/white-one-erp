import { SampleStatus, Role } from "@prisma/client";

// Pipeline образца — жёсткая последовательность с возможностью возврата
export const SAMPLE_TRANSITIONS: Record<SampleStatus, SampleStatus[]> = {
  REQUESTED: ["IN_SEWING"],
  IN_SEWING: ["DELIVERED"],
  DELIVERED: ["APPROVED", "RETURNED"],      // может быть забракован
  APPROVED: ["READY_FOR_SHOOT"],
  READY_FOR_SHOOT: ["RETURNED"],             // после съёмки → возвращается/утилизируется
  RETURNED: [],
};

export function canMoveSampleStatus(
  from: SampleStatus,
  to: SampleStatus,
  actorRole: Role,
): { ok: boolean; reason?: string; requiresComment?: boolean } {
  if (from === to) return { ok: false, reason: "Статус не изменился" };

  if (SAMPLE_TRANSITIONS[from].includes(to)) return { ok: true };

  const order: SampleStatus[] = ["REQUESTED", "IN_SEWING", "DELIVERED", "APPROVED", "READY_FOR_SHOOT", "RETURNED"];
  const isRollback = order.indexOf(to) < order.indexOf(from);
  if (isRollback) {
    if (actorRole === "OWNER" || actorRole === "DIRECTOR" || actorRole === "PRODUCT_MANAGER") {
      return { ok: true, requiresComment: true };
    }
    return { ok: false, reason: "Откат доступен только PM и руководителям" };
  }

  return { ok: false, reason: "Нельзя перепрыгнуть статус" };
}

export const SAMPLE_STATUS_DATE_FIELDS: Partial<Record<SampleStatus, string>> = {
  IN_SEWING: "sewingStartDate",
  DELIVERED: "deliveredDate",
  APPROVED: "approvedDate",
  READY_FOR_SHOOT: "readyForShootDate",
  RETURNED: "returnedDate",
};
