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
