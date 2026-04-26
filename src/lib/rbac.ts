import { Role } from "@prisma/client";

// RBAC MVP: три группы с дефолтным доступом.
// Детализация тонких прав (отдельные поля заказа для логиста/ВЭД/контента) — по факту после беты.
// Функция can() используется и на фронте (скрытие кнопок), и на бэке (guards).

export type Action =
  // Products
  | "product.read"
  | "product.create"
  | "product.update"
  | "product.delete"
  | "product.updateStatus"
  | "product.rollbackStatus"
  // Orders
  | "order.read"
  | "order.create"
  | "order.update"
  | "order.delete"
  | "order.updateStatus"
  | "order.rollbackStatus"
  | "order.updateLogistics" // даты доставки, способ, ВЭД
  | "order.updateContent"   // wbCardReady
  | "order.updateWB"        // factRedemption, actualRevenue
  | "order.updatePacking"   // packagingOrdered, packing dates
  // Plans & Factories
  | "plan.read"
  | "plan.manage"
  | "factory.read"
  | "factory.manage"
  // Payments
  | "payment.read"
  | "payment.create"
  | "payment.update"
  | "payment.markPaid"
  | "payment.delete"
  // Admin
  | "user.read"
  | "user.manage"
  | "import.run"
  | "audit.read";

export type RoleCan = (action: Action, resourceOwnerId?: string, actorId?: string) => boolean;

const ADMINS: Role[] = ["OWNER", "DIRECTOR"];
const PM: Role[] = ["PRODUCT_MANAGER"];
const ALL_AUTHENTICATED: Role[] = [
  "OWNER",
  "DIRECTOR",
  "PRODUCT_MANAGER",
  "ASSISTANT",
  "CONTENT_MANAGER",
  "LOGISTICS",
  "CUSTOMS",
  "WB_MANAGER",
  "INTERN",
];

export function can(
  role: Role,
  action: Action,
  resourceOwnerId?: string,
  actorId?: string,
): boolean {
  // Админы могут всё
  if (ADMINS.includes(role)) return true;

  const isOwner = !!resourceOwnerId && !!actorId && resourceOwnerId === actorId;

  switch (action) {
    // Чтение — все авторизованные
    case "product.read":
    case "order.read":
    case "plan.read":
    case "factory.read":
    case "user.read":
    case "payment.read":
      return ALL_AUTHENTICATED.includes(role);

    // Платежи: создание/правка — PM + админы (админы выше). Настя — тоже (для упаковки, проверку типа делает роут).
    case "payment.create":
    case "payment.update":
      return PM.includes(role) || role === "ASSISTANT";
    // Отметка «оплачено» и удаление — только админы (выше уже true)
    case "payment.markPaid":
    case "payment.delete":
      return false;

    // Создание продуктов и заказов — PM и все выше
    case "product.create":
    case "order.create":
      return PM.includes(role);

    // Обновление и смена статуса — владелец или PM (для своих)
    case "product.update":
    case "product.updateStatus":
    case "order.update":
    case "order.updateStatus":
      return isOwner || PM.includes(role);

    // Откат статуса — только админы (отработано выше)
    case "product.rollbackStatus":
    case "order.rollbackStatus":
      return false;

    // Удаление — только админы
    case "product.delete":
    case "order.delete":
      return false;

    // Поле-специфичные действия
    case "order.updateLogistics":
      return role === "LOGISTICS" || role === "CUSTOMS" || isOwner || PM.includes(role);
    case "order.updateContent":
      return role === "CONTENT_MANAGER" || isOwner || PM.includes(role);
    case "order.updateWB":
      return role === "WB_MANAGER" || isOwner || PM.includes(role);
    case "order.updatePacking":
      return role === "ASSISTANT" || isOwner || PM.includes(role);

    // Справочники и импорт
    case "plan.manage":
    case "factory.manage":
    case "user.manage":
    case "audit.read":
      return false; // только админы (уже вернули true выше)
    case "import.run":
      return PM.includes(role);

    default:
      return false;
  }
}

// Исключительная проверка с бросанием ошибки — для route handlers
export function assertCan(
  role: Role,
  action: Action,
  resourceOwnerId?: string,
  actorId?: string,
): void {
  if (!can(role, action, resourceOwnerId, actorId)) {
    throw new RbacError(`Доступ запрещён: ${action}`);
  }
}

export class RbacError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RbacError";
  }
}
