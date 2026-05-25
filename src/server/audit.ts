import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import type { AuditAction } from "@prisma/client";

/**
 * Запись действия в журнал.
 *
 * Используется во всех API-роутах, которые меняют важные сущности:
 * orders, models, variants, payments, packaging-orders, factories, users.
 *
 * Идея: один источник правды о том, кто что когда поменял.
 * НЕ блокирующий — ошибка логирования не должна валить запись.
 *
 * @param action     CREATE / UPDATE / DELETE / STATUS_CHANGE
 * @param entityType "Order", "ProductModel", "ProductVariant", ...
 * @param entityId   id записи
 * @param userId     кто действует (берётся из session)
 * @param changes    необязательно — патч с новыми значениями или {from, to}
 */
export async function logAudit(params: {
  action: AuditAction;
  entityType: string;
  entityId: string;
  userId: string | null;
  changes?: unknown;
}): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        action: params.action,
        entityType: params.entityType,
        entityId: params.entityId,
        userId: params.userId,
        changes: params.changes === undefined
          ? Prisma.DbNull
          : (params.changes as Prisma.InputJsonValue),
      },
    });
  } catch (e) {
    // Журнал не должен валить запись. Залогируем в консоль для разработчика.
    console.error("[audit] failed to log:", e);
  }
}
