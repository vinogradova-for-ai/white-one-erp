// Какие kind'ы из getMainScreenChecklist() закрываются «галкой» с фактической
// датой (через CheckableRow). См. checkable-row.tsx для UX и actions.ts для
// логики записи в БД. Эти кинды требуют ТОЛЬКО даты и автоматического перехода
// статуса — без создания сущностей или ввода доп.данных.
import type { ChecklistTask } from "@/lib/queries/main-screen-checklist";

const CHECKABLE_KINDS = new Set<ChecklistTask["kind"]>([
  "order-qc",
  "accept-qc",
  "check-delivery",
  "size-chart",
  "approve-sample",
  "pkg-check-delivery",
]);

export function isCheckable(kind: ChecklistTask["kind"]): boolean {
  return CHECKABLE_KINDS.has(kind);
}
