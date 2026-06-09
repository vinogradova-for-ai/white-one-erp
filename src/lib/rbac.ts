import { Role } from "@prisma/client";

// RBAC: группы с дефолтным доступом.
// Политика команды (решение Алёны): сотрудники работают в системе на равных —
// PRODUCT_MANAGER = ПОЛНЫЙ рабочий доступ (фасоны/заказы/статусы/откаты/платежи
// вкл. «оплачено»/упаковка/планы/фабрики/импорт). За владельцем (OWNER/DIRECTOR)
// закреплены только УДАЛЕНИЕ записей и УПРАВЛЕНИЕ ЛЮДЬМИ (+ журнал аудита).
// Роли read-only витрины (логистика/ВЭД/контент/WB/стажёр) — только чтение.
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
  // Packaging (упаковка + заказы упаковки): PM + ASSISTANT (Настя) + админы
  | "packaging.manage"
  // Admin
  | "user.read"
  | "user.manage"
  | "import.run"
  | "audit.read";

// Поля-специфичные права (order.updateLogistics/Content/WB/Packing) удалены:
// сервис только для отдела Продукт, остальные роли — read-only витрина.

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
    // Отметка «оплачено» — PM (полноценная работа с платежами) + админы.
    case "payment.markPaid":
      return PM.includes(role);
    // Удаление платежа — только владелец/директор (удаление закреплено за владельцем).
    case "payment.delete":
      return false;

    // Создание продуктов и заказов — PM и все выше
    case "product.create":
    case "order.create":
      return PM.includes(role);

    // Обновление и смена статуса — только PM (и админы выше).
    // Владение ресурсом само по себе НЕ даёт запись read-only ролям.
    case "product.update":
    case "product.updateStatus":
    case "order.update":
    case "order.updateStatus":
      return PM.includes(role);

    // Упаковка и заказы упаковки — PM + ASSISTANT (Настя) + админы
    case "packaging.manage":
      return PM.includes(role) || role === "ASSISTANT";

    // Откат статуса — PM (полноценная работа) + админы
    case "product.rollbackStatus":
    case "order.rollbackStatus":
      return PM.includes(role);

    // Удаление — только владелец/директор (удаление закреплено за владельцем)
    case "product.delete":
    case "order.delete":
      return false;

    // Справочники планов и фабрик — PM (полноценная работа) + админы
    case "plan.manage":
    case "factory.manage":
      return PM.includes(role);
    // Управление людьми и журнал аудита — только владелец/директор
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
