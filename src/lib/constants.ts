import {
  Role,
  Brand,
  DevelopmentType,
  ProductStatus,
  OrderType,
  OrderStatus,
  DeliveryMethod,
  NotificationType,
} from "@prisma/client";

// ======================================================
// Лейблы для UI (русские подписи к enum-значениям)
// ======================================================

export const ROLE_LABELS: Record<Role, string> = {
  OWNER: "Собственник",
  DIRECTOR: "Руководитель",
  PRODUCT_MANAGER: "Продукт-менеджер",
  ASSISTANT: "Ассистент",
  CONTENT_MANAGER: "Контент-менеджер",
  LOGISTICS: "Логист",
  CUSTOMS: "Менеджер ВЭД",
  WB_MANAGER: "Менеджер WB",
  INTERN: "Стажёр",
};

export const BRAND_LABELS: Record<Brand, string> = {
  WHITE_ONE: "White One",
  SERDCEBIENIE: "Сердцебиение",
};

export const DEV_TYPE_LABELS: Record<DevelopmentType, string> = {
  OWN: "Собственный дизайн",
  REPEAT: "Повтор",
};

export const PRODUCT_STATUS_LABELS: Record<ProductStatus, string> = {
  IDEA: "Идея",
  SKETCH: "Эскиз утверждён",
  PATTERNS: "Лекала готовы",
  SAMPLE: "Образец прошит",
  CORRECTIONS: "Корректировки",
  SIZE_CHART: "Размерная сетка",
  APPROVED: "Финальное утверждение",
  READY_FOR_PRODUCTION: "Готов к производству",
};

export const PRODUCT_STATUS_ORDER: ProductStatus[] = [
  "IDEA",
  "SKETCH",
  "PATTERNS",
  "SAMPLE",
  "CORRECTIONS",
  "SIZE_CHART",
  "APPROVED",
  "READY_FOR_PRODUCTION",
];

export const ORDER_TYPE_LABELS: Record<OrderType, string> = {
  SEASONAL: "Сезонный",
  RESTOCK: "Досорт",
  TEST: "Тест",
};

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  PREPARATION: "Подготовка",
  FABRIC_ORDERED: "Ткань заказана",
  SEWING: "В пошиве",
  QC: "ОТК",
  READY_SHIP: "Готов к отгрузке",
  IN_TRANSIT: "В доставке",
  WAREHOUSE_MSK: "На складе Москва",
  PACKING: "Упаковка",
  SHIPPED_WB: "Отгружен на WB",
  ON_SALE: "В продаже",
};

export const ORDER_STATUS_ORDER: OrderStatus[] = [
  "PREPARATION",
  "FABRIC_ORDERED",
  "SEWING",
  "QC",
  "READY_SHIP",
  "IN_TRANSIT",
  "WAREHOUSE_MSK",
  "PACKING",
  "SHIPPED_WB",
  "ON_SALE",
];

export const DELIVERY_METHOD_LABELS: Record<DeliveryMethod, string> = {
  CARGO: "Карго",
  AIR: "Авиа",
  RAIL: "ЖД",
  DOMESTIC: "Внутри РФ",
};

export const NOTIFICATION_TYPE_LABELS: Record<NotificationType, string> = {
  DELAY: "Задержка",
  INCOMING_DELIVERY: "Скоро приедет товар",
  PAYMENT_DUE: "Скоро платёж",
  PLAN_GAP: "Разрыв план/факт",
  STATUS_CHANGED: "Смена статуса",
  ISSUE: "Проблема",
};

// ======================================================
// Фиксированные справочники из ТЗ
// ======================================================

export const CATEGORIES = [
  "Пальто",
  "Брюки",
  "Лето",
  "Сердцебиение",
  "Новые товары",
] as const;

export const DEFAULT_REDEMPTION_PCT: Record<string, number> = {
  Пальто: 30,
  Брюки: 25,
  Лето: 25,
  Сердцебиение: 30,
  "Новые товары": 25,
};

// Цвета бейджей статусов (tailwind-классы)
export const PRODUCT_STATUS_COLORS: Record<ProductStatus, string> = {
  IDEA: "bg-slate-100 text-slate-700",
  SKETCH: "bg-blue-100 text-blue-700",
  PATTERNS: "bg-indigo-100 text-indigo-700",
  SAMPLE: "bg-purple-100 text-purple-700",
  CORRECTIONS: "bg-amber-100 text-amber-700",
  SIZE_CHART: "bg-teal-100 text-teal-700",
  APPROVED: "bg-emerald-100 text-emerald-700",
  READY_FOR_PRODUCTION: "bg-green-100 text-green-800",
};

export const ORDER_STATUS_COLORS: Record<OrderStatus, string> = {
  PREPARATION: "bg-slate-100 text-slate-700",
  FABRIC_ORDERED: "bg-sky-100 text-sky-700",
  SEWING: "bg-blue-100 text-blue-700",
  QC: "bg-indigo-100 text-indigo-700",
  READY_SHIP: "bg-violet-100 text-violet-700",
  IN_TRANSIT: "bg-purple-100 text-purple-700",
  WAREHOUSE_MSK: "bg-amber-100 text-amber-700",
  PACKING: "bg-orange-100 text-orange-700",
  SHIPPED_WB: "bg-lime-100 text-lime-700",
  ON_SALE: "bg-emerald-100 text-emerald-800",
};
