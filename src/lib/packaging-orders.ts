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
  IN_PRODUCTION: "bg-blue-100 text-blue-700",
  IN_TRANSIT: "bg-amber-100 text-amber-700",
  ARRIVED: "bg-emerald-100 text-emerald-700",
  CANCELLED: "bg-red-100 text-red-700",
};
