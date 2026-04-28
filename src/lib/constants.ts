import {
  Role,
  Brand,
  DevelopmentType,
  ProductModelStatus,
  ProductVariantStatus,
  OrderType,
  OrderStatus,
  DeliveryMethod,
  NotificationType,
  IdeaStatus,
  IdeaPriority,
  Currency,
  PackagingType,
} from "@prisma/client";

export const PACKAGING_TYPE_LABELS: Record<PackagingType, string> = {
  LABEL: "Бирка навесная",
  SIZE_LABEL: "Размерник",
  POLYBAG: "Полибэг / пакет",
  MESH: "Сетка",
  COVER: "Чехол",
  BAG: "Сумка",
  BOX: "Коробка",
  CARE_LABEL: "Ярлык (состав/уход)",
  OTHER: "Другое",
};

export const PACKAGING_TYPE_ICONS: Record<PackagingType, string> = {
  LABEL: "◇",
  SIZE_LABEL: "#",
  POLYBAG: "▯",
  MESH: "▦",
  COVER: "⬚",
  BAG: "◧",
  BOX: "▣",
  CARE_LABEL: "⌇",
  OTHER: "•",
};

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

export const BRAND_LABELS: Record<Brand, string> = {
  WHITE_ONE: "White One",
  SERDCEBIENIE: "Сердцебиение",
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

export const DELIVERY_METHOD_LABELS: Record<DeliveryMethod, string> = {
  DOMESTIC_RU: "Внутри РФ",
  CARGO_KG: "Карго Киргизия",
  CARGO_CN: "Карго Китай",
  TK_CN: "Транспортная компания Китай",
};

// Дефолтная длительность фазы доставки в днях
export const DELIVERY_DURATION_DAYS: Record<DeliveryMethod, number> = {
  DOMESTIC_RU: 0,
  CARGO_KG: 14,
  CARGO_CN: 30,
  TK_CN: 45,
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
  "Юбки",
  "Жакеты",
  "Лето",
  "Новые товары",
] as const;

// Дефолтный % выкупа по категории
export const DEFAULT_REDEMPTION_PCT: Record<string, number> = {
  Пальто: 30,
  Брюки: 25,
  Платья: 28,
  "Блузы/рубашки": 30,
  "Верхняя одежда": 28,
  Трикотаж: 30,
  Юбки: 28,
  Жакеты: 28,
  Лето: 25,
  "Новые товары": 25,
};
