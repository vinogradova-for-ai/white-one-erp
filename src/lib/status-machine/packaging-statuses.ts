import { PackagingItemStatus } from "@prisma/client";

// Упрощённая схема: только «В работе» ↔ «В архиве».
// Разработка (IDEA/DESIGN/SAMPLE/APPROVED) больше не используется — развитие упаковки
// отслеживается через PackagingOrder, а не через статус справочника.
// Для существующих записей старые значения мапятся к ACTIVE (см. отображение ниже).
export const PACKAGING_TRANSITIONS: Record<PackagingItemStatus, PackagingItemStatus[]> = {
  IDEA: ["ACTIVE"],
  DESIGN: ["ACTIVE"],
  SAMPLE: ["ACTIVE"],
  APPROVED: ["ACTIVE"],
  ACTIVE: ["ARCHIVED"],
  ARCHIVED: ["ACTIVE"],
};

export const PACKAGING_DATE_ON_STATUS: Partial<Record<PackagingItemStatus, string>> = {
  ACTIVE: "productionStartDate",
};

// UI-лейблы: старые статусы показываем как «В работе», чтобы обратная совместимость.
export const PACKAGING_STATUS_LABELS: Record<PackagingItemStatus, string> = {
  IDEA: "В работе",
  DESIGN: "В работе",
  SAMPLE: "В работе",
  APPROVED: "В работе",
  ACTIVE: "В работе",
  ARCHIVED: "В архиве",
};

export const PACKAGING_STATUS_COLORS: Record<PackagingItemStatus, string> = {
  IDEA: "bg-emerald-100 text-emerald-800",
  DESIGN: "bg-emerald-100 text-emerald-800",
  SAMPLE: "bg-emerald-100 text-emerald-800",
  APPROVED: "bg-emerald-100 text-emerald-800",
  ACTIVE: "bg-emerald-100 text-emerald-800",
  ARCHIVED: "bg-slate-100 text-slate-500",
};

// Статусы, которые UI разрешает выбрать из селектора.
export const PACKAGING_USER_STATUSES: PackagingItemStatus[] = ["ACTIVE", "ARCHIVED"];
