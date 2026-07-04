import { PackagingOrderStatus } from "@prisma/client";

export const PACKAGING_ORDER_STATUS_LABELS: Record<PackagingOrderStatus, string> = {
  ORDERED: "Заказано",
  IN_PRODUCTION: "В производстве",
  IN_TRANSIT: "В пути",
  ARRIVED: "Поступило на склад",
  CANCELLED: "Отменено",
};

export const PACKAGING_ORDER_STATUS_COLORS: Record<PackagingOrderStatus, string> = {
  ORDERED: "bg-slate-100 text-slate-700",
  IN_PRODUCTION: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  IN_TRANSIT: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  ARRIVED: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  CANCELLED: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
};

/**
 * ЕДИНЫЙ этап заказа упаковки — как orderPhase() у одежды (lib/order-stage).
 * Расхождение 04.07: канбан ставил ORDERED в «Производство», а Гант держал
 * «Разработку» — правило жило в двух местах. Теперь и канбан, и Гант берут
 * этап ТОЛЬКО отсюда; у упаковки нет фазы ОТК.
 *   ORDERED / IN_PRODUCTION → production (заказ размещён — разработка позади)
 *   IN_TRANSIT              → delivery
 *   ARRIVED                 → done
 *   CANCELLED               → null (нигде не показываем)
 */
export type PackagingPhase = "production" | "delivery" | "done";

export function packagingOrderPhase(status: PackagingOrderStatus): PackagingPhase | null {
  switch (status) {
    case "ORDERED":
    case "IN_PRODUCTION":
      return "production";
    case "IN_TRANSIT":
      return "delivery";
    case "ARRIVED":
      return "done";
    case "CANCELLED":
      return null;
  }
}

/** Индекс активной полосы на 3-фазной ленте Ганта упаковки (0=Разработка, 1=Производство, 2=Доставка); -1 = всё закрыто. */
export function packagingActivePhaseIndex(status: PackagingOrderStatus): number {
  const p = packagingOrderPhase(status);
  if (p === "production") return 1;
  if (p === "delivery") return 2;
  return -1; // done или cancelled — активной фазы нет
}
