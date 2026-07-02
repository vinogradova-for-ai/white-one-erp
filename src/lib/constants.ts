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
  Currency,
  PackagingType,
  ShipmentStatus,
} from "@prisma/client";

export const SHIPMENT_STATUS_LABELS: Record<ShipmentStatus, string> = {
  DRAFT: "Черновик",
  IN_TRANSIT: "В пути",
  ARRIVED: "Приехала",
  RECEIVED: "Принята",
};

export const SHIPMENT_STATUS_COLORS: Record<ShipmentStatus, string> = {
  DRAFT: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  IN_TRANSIT: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300",
  ARRIVED: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  RECEIVED: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
};

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

/**
 * Дефолтный курс ¥→₽. ЕДИНЫЙ источник (аудит п.8): раньше 13.5 был зашит
 * прямо в форме редактирования фасона и подставлялся в БД молча. Теперь это
 * только ДЕФОЛТ для видимого поля «Курс ¥→₽» — фактический курс вводит человек
 * и он хранится в фасоне (ProductModel.cnyRubRate). Расчёт себестоимости в ¥
 * везде идёт через resolveModelCost по сохранённому курсу.
 */
export const DEFAULT_CNY_RUB_RATE = 13.5;

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

// Список соответствует реальным категориям, которые есть в БД.
// «Блузы/рубашки», «Верхняя одежда», «Трикотаж», «Жакеты», «Лето»,
// «Новые товары» удалены — ни одного фасона. Если понадобится — добавим
// обратно в момент заведения первого товара.
export const CATEGORIES = [
  "Пальто",
  "Полупальто",
  "Брюки",
  "Платья",
  "Костюмы",
  "Сарафаны",
  "Юбки",
  "Блузки",
  "Джинсы",
  "Трикотажные костюмы",
] as const;

// Дефолтный % выкупа по категории
export const DEFAULT_REDEMPTION_PCT: Record<string, number> = {
  Пальто: 30,
  Полупальто: 30,
  Брюки: 25,
  Платья: 28,
  Костюмы: 25,
  Сарафаны: 25,
  Юбки: 28,
  Блузки: 28,
  Джинсы: 25,
  "Трикотажные костюмы": 25,
};
