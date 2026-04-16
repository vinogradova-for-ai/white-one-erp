import {
  Role,
  DevelopmentType,
  ProductModelStatus,
  ProductVariantStatus,
  OrderType,
  OrderStatus,
  DeliveryMethod,
  NotificationType,
  SampleStatus,
  IdeaStatus,
  IdeaPriority,
  QcDefectCategory,
  Currency,
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

export const DEV_TYPE_LABELS: Record<DevelopmentType, string> = {
  OWN: "Собственный дизайн",
  REPEAT: "Повтор",
};

export const PRODUCT_MODEL_STATUS_LABELS: Record<ProductModelStatus, string> = {
  IDEA: "Идея",
  PATTERNS: "Лекала готовы",
  SAMPLE: "Образец",
  APPROVED: "Утверждён",
  IN_PRODUCTION: "В производстве",
};

export const PRODUCT_MODEL_STATUS_ORDER: ProductModelStatus[] = [
  "IDEA",
  "PATTERNS",
  "SAMPLE",
  "APPROVED",
  "IN_PRODUCTION",
];

export const PRODUCT_MODEL_STATUS_COLORS: Record<ProductModelStatus, string> = {
  IDEA: "bg-slate-100 text-slate-700",
  PATTERNS: "bg-indigo-100 text-indigo-700",
  SAMPLE: "bg-purple-100 text-purple-700",
  APPROVED: "bg-emerald-100 text-emerald-700",
  IN_PRODUCTION: "bg-green-100 text-green-800",
};

export const PRODUCT_VARIANT_STATUS_LABELS: Record<ProductVariantStatus, string> = {
  DRAFT: "Черновик",
  READY_TO_ORDER: "Готов к заказу",
  DISCONTINUED: "Снят с производства",
};

export const PRODUCT_VARIANT_STATUS_COLORS: Record<ProductVariantStatus, string> = {
  DRAFT: "bg-slate-100 text-slate-700",
  READY_TO_ORDER: "bg-emerald-100 text-emerald-700",
  DISCONTINUED: "bg-gray-100 text-gray-500",
};

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

export const SAMPLE_STATUS_LABELS: Record<SampleStatus, string> = {
  REQUESTED: "Заказан на фабрике",
  IN_SEWING: "В пошиве",
  DELIVERED: "Доставлен в Москву",
  APPROVED: "Утверждён",
  READY_FOR_SHOOT: "Готов для съёмки",
  RETURNED: "Возвращён / утилизирован",
};

export const SAMPLE_STATUS_ORDER: SampleStatus[] = [
  "REQUESTED",
  "IN_SEWING",
  "DELIVERED",
  "APPROVED",
  "READY_FOR_SHOOT",
  "RETURNED",
];

export const SAMPLE_STATUS_COLORS: Record<SampleStatus, string> = {
  REQUESTED: "bg-slate-100 text-slate-700",
  IN_SEWING: "bg-blue-100 text-blue-700",
  DELIVERED: "bg-purple-100 text-purple-700",
  APPROVED: "bg-emerald-100 text-emerald-700",
  READY_FOR_SHOOT: "bg-pink-100 text-pink-700",
  RETURNED: "bg-gray-100 text-gray-500",
};

export const IDEA_STATUS_LABELS: Record<IdeaStatus, string> = {
  NEW: "Новая",
  CONSIDERING: "Рассматривается",
  PROMOTED: "В разработке",
  REJECTED: "Отклонена",
};

export const IDEA_STATUS_COLORS: Record<IdeaStatus, string> = {
  NEW: "bg-blue-100 text-blue-700",
  CONSIDERING: "bg-amber-100 text-amber-700",
  PROMOTED: "bg-emerald-100 text-emerald-700",
  REJECTED: "bg-gray-100 text-gray-500",
};

export const IDEA_PRIORITY_LABELS: Record<IdeaPriority, string> = {
  HIGH: "Высокий",
  MEDIUM: "Средний",
  LOW: "Низкий",
};

export const IDEA_PRIORITY_COLORS: Record<IdeaPriority, string> = {
  HIGH: "bg-red-100 text-red-700",
  MEDIUM: "bg-amber-100 text-amber-700",
  LOW: "bg-slate-100 text-slate-500",
};

export const QC_DEFECT_LABELS: Record<QcDefectCategory, string> = {
  SEWING: "Пошив",
  FABRIC: "Ткань",
  FITTINGS: "Фурнитура",
  SIZE: "Размер",
  OTHER: "Другое",
};

export const DELIVERY_METHOD_LABELS: Record<DeliveryMethod, string> = {
  CARGO: "Карго",
  AIR: "Авиа",
  RAIL: "ЖД",
  DOMESTIC: "Внутри РФ",
};

export const CURRENCY_LABELS: Record<Currency, string> = {
  RUB: "₽",
  CNY: "¥",
};

export const NOTIFICATION_TYPE_LABELS: Record<NotificationType, string> = {
  DELAY: "Задержка",
  INCOMING_DELIVERY: "Скоро приедет товар",
  PAYMENT_DUE: "Скоро платёж",
  PLAN_GAP: "Разрыв план/факт",
  STATUS_CHANGED: "Смена статуса",
  ISSUE: "Проблема",
  SAMPLE_READY: "Образец готов",
  QC_REQUIRED: "Требуется ОТК",
};

// ======================================================
// Фиксированные справочники
// ======================================================

export const CATEGORIES = [
  "Пальто",
  "Брюки",
  "Платья",
  "Блузы/рубашки",
  "Верхняя одежда",
  "Трикотаж",
  "Лето",
  "Новые товары",
  "Сердцебиение",
] as const;

// Популярные теги для автоподсказки (стартовый набор, потом подтягивается из БД)
export const DEFAULT_TAGS = [
  "Осень 2026",
  "Весна 2026",
  "Лето 2026",
  "Зима 2026",
  "Офис",
  "Casual",
  "Вечерний",
  "Базовый",
  "Повтор",
  "Новинка",
  "Сердцебиение",
] as const;

// Дефолтный % выкупа по категории
export const DEFAULT_REDEMPTION_PCT: Record<string, number> = {
  Пальто: 30,
  Брюки: 25,
  Платья: 28,
  "Блузы/рубашки": 30,
  "Верхняя одежда": 28,
  Трикотаж: 30,
  Лето: 25,
  "Новые товары": 25,
  Сердцебиение: 30,
};
