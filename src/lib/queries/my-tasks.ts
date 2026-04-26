import { prisma } from "@/lib/prisma";
import { Role } from "@prisma/client";

/**
 * «Мои задачи» — actionable список.
 * Каждая запись описывает КОНКРЕТНОЕ ДЕЙСТВИЕ, которое нужно сделать,
 * чтобы объект двинулся дальше по процессу.
 * Не путать со статусом — статус это «где объект», а задача это «что сделать».
 */

export type TaskUrgency = "overdue" | "urgent" | "normal" | "info";

export type MyTask = {
  id: string;           // уникальный id задачи (включает тип объекта + действие)
  entityType: "model" | "variant" | "order";
  entityId: string;
  action: string;        // глагол действия: «Утвердите образец»
  title: string;         // на чём действие: «Пальто Классика · шоколад»
  subtitle?: string;     // дополнительный контекст: «ORD-2026-0001 · 500 шт»
  deadline: Date | null;
  daysLeft: number | null;
  urgency: TaskUrgency;
  url: string;           // куда идти, чтобы сделать
  photoUrl?: string | null;
  category: "discovery" | "production" | "receiving" | "packing" | "shipping" | "content";
};

export async function getMyTasks(userId: string, role: Role): Promise<MyTask[]> {
  const isAdmin = role === "OWNER" || role === "DIRECTOR";
  const isPm = role === "PRODUCT_MANAGER" || isAdmin;
  const tasks: MyTask[] = [];

  // ====== PRODUCT MANAGER: фасоны и варианты ======
  if (isPm) {
    const models = await prisma.productModel.findMany({
      where: {
        deletedAt: null,
        status: { not: "IN_PRODUCTION" },
        ...(isAdmin ? {} : { ownerId: userId }),
      },
      include: { variants: { where: { deletedAt: null } } },
    });

    for (const m of models) {
      const photoUrl = m.photoUrls[0] ?? m.variants[0]?.photoUrls[0] ?? null;

      if (m.status === "IDEA") {
        if (!m.patternsUrl) {
          tasks.push(mkTask({
            id: `model-${m.id}-add-patterns`,
            entityType: "model", entityId: m.id,
            action: "Загрузите лекала",
            title: m.name,
            subtitle: m.category,
            deadline: m.patternsDate,
            url: `/models/${m.id}`,
            photoUrl,
            category: "discovery",
          }));
        } else {
          tasks.push(mkTask({
            id: `model-${m.id}-move-to-patterns`,
            entityType: "model", entityId: m.id,
            action: "Переведите в статус «Лекала»",
            title: m.name,
            subtitle: "Лекала загружены",
            deadline: m.patternsDate,
            url: `/models/${m.id}`,
            photoUrl,
            category: "discovery",
          }));
        }
      }

      if (m.status === "APPROVED") {
        tasks.push(mkTask({
          id: `model-${m.id}-start-production`,
          entityType: "model", entityId: m.id,
          action: "Запустите в производство",
          title: m.name,
          subtitle: "Утверждён, готов к заказу партий",
          deadline: m.productionStartDate,
          url: `/models/${m.id}`,
          photoUrl,
          category: "production",
        }));
      }

      // Варианты без фото — критично
      const draftsWithoutPhoto = m.variants.filter((v) => v.status === "DRAFT" && v.photoUrls.length === 0);
      for (const v of draftsWithoutPhoto) {
        tasks.push(mkTask({
          id: `variant-${v.id}-add-photo`,
          entityType: "variant", entityId: v.id,
          action: "Добавьте фото варианта",
          title: `${m.name} · ${v.colorName}`,
          subtitle: v.sku,
          deadline: null,
          url: `/variants/${v.id}`,
          photoUrl: null,
          category: "discovery",
        }));
      }

      // Варианты готовые, но в черновике — экономика теперь на фасоне, проверяем её там.
      const modelReady = m.fullCost != null;
      const draftsReady = m.variants.filter((v) => v.status === "DRAFT" && v.photoUrls.length > 0 && modelReady);
      for (const v of draftsReady) {
        tasks.push(mkTask({
          id: `variant-${v.id}-mark-ready`,
          entityType: "variant", entityId: v.id,
          action: "Отметьте вариант «Готов к заказу»",
          title: `${m.name} · ${v.colorName}`,
          subtitle: v.sku,
          deadline: null,
          url: `/variants/${v.id}`,
          photoUrl: v.photoUrls[0],
          category: "discovery",
        }));
      }
    }
  }

  // ====== ЗАКАЗЫ ======
  const orders = await prisma.order.findMany({
    where: { deletedAt: null, status: { not: "ON_SALE" } },
    include: {
      productModel: { select: { name: true } },
      lines: {
        include: {
          productVariant: {
            select: { sku: true, colorName: true, photoUrls: true },
          },
        },
        orderBy: { createdAt: "asc" },
      },
      factory: { select: { name: true } },
    },
  });

  for (const o of orders) {
    const colors = o.lines.map((l) => l.productVariant.colorName).join(", ");
    const totalQty = o.lines.reduce((a, l) => a + l.quantity, 0);
    const title = colors ? `${o.productModel.name} · ${colors}` : o.productModel.name;
    const subtitle = `${o.orderNumber} · ${totalQty} шт`;
    const photoUrl = o.lines[0]?.productVariant.photoUrls[0] ?? null;
    const url = `/orders/${o.id}`;

    const isMyOrder = o.ownerId === userId;
    const seesAsOwner = isPm && (isAdmin || isMyOrder);

    // === PM (владелец) ===
    if (seesAsOwner) {
      if (o.status === "PREPARATION") {
        tasks.push(mkTask({
          id: `order-${o.id}-hand-to-factory`,
          entityType: "order", entityId: o.id,
          action: "Передайте заказ на фабрику",
          title, subtitle, deadline: o.handedToFactoryDate,
          url, photoUrl, category: "production",
        }));
      }

      if (o.status === "FABRIC_ORDERED") {
        tasks.push(mkTask({
          id: `order-${o.id}-await-sewing`,
          entityType: "order", entityId: o.id,
          action: "Проверьте старт пошива",
          title, subtitle, deadline: o.sewingStartDate,
          url, photoUrl, category: "production",
        }));
      }

      if (o.status === "SEWING") {
        tasks.push(mkTask({
          id: `order-${o.id}-await-qc`,
          entityType: "order", entityId: o.id,
          action: "Дождитесь готовности на фабрике",
          title, subtitle, deadline: o.readyAtFactoryDate,
          url, photoUrl, category: "production",
        }));
      }

    }

    // === Логистика (Таня) ===
    if (role === "LOGISTICS" || isAdmin) {
      if (o.status === "READY_SHIP" && !o.deliveryMethod) {
        tasks.push(mkTask({
          id: `order-${o.id}-pick-delivery`,
          entityType: "order", entityId: o.id,
          action: "Выберите способ доставки",
          title, subtitle, deadline: o.shipmentDate,
          url, photoUrl, category: "shipping",
        }));
      }
      if (o.status === "READY_SHIP" && o.deliveryMethod) {
        tasks.push(mkTask({
          id: `order-${o.id}-ship`,
          entityType: "order", entityId: o.id,
          action: "Отправьте груз",
          title, subtitle, deadline: o.shipmentDate,
          url, photoUrl, category: "shipping",
        }));
      }
      if (o.status === "IN_TRANSIT") {
        const isClose = o.arrivalPlannedDate && daysBetween(new Date(), o.arrivalPlannedDate) <= 3;
        tasks.push(mkTask({
          id: `order-${o.id}-track`,
          entityType: "order", entityId: o.id,
          action: isClose ? "Отметьте прибытие (скоро)" : "Отслеживайте доставку",
          title, subtitle: `${subtitle} · ETA ${formatShort(o.arrivalPlannedDate)}`,
          deadline: o.arrivalPlannedDate,
          url, photoUrl, category: "shipping",
        }));
      }
    }

    // === Склад / Настя ===
    if (role === "ASSISTANT" || isAdmin) {
      if (o.status === "PACKING" && !o.packagingOrdered) {
        tasks.push(mkTask({
          id: `order-${o.id}-order-packaging`,
          entityType: "order", entityId: o.id,
          action: "Закажите упаковку",
          title, subtitle: `${subtitle} · ${o.packagingType ?? "тип не указан"}`,
          deadline: null,
          url: `${url}#packing`, photoUrl, category: "packing",
        }));
      }
      if (o.status === "PACKING" && o.packagingOrdered) {
        tasks.push(mkTask({
          id: `order-${o.id}-pack`,
          entityType: "order", entityId: o.id,
          action: "Упакуйте товар",
          title, subtitle, deadline: o.wbShipmentDate,
          url: `${url}#packing`, photoUrl, category: "packing",
        }));
      }
    }

    // === Контент (Катя) ===
    if (role === "CONTENT_MANAGER" || isAdmin) {
      // Заказы скоро придут — надо готовить карточку
      if (["IN_TRANSIT", "WAREHOUSE_MSK"].includes(o.status) && !o.wbCardReady) {
        const daysToArrival = o.arrivalPlannedDate ? daysBetween(new Date(), o.arrivalPlannedDate) : null;
        if (daysToArrival !== null && daysToArrival <= 14) {
          tasks.push(mkTask({
            id: `order-${o.id}-prep-wb-card`,
            entityType: "order", entityId: o.id,
            action: "Подготовьте карточку WB (товар скоро на складе)",
            title, subtitle: `${subtitle} · прибытие ${formatShort(o.arrivalPlannedDate)}`,
            deadline: o.arrivalPlannedDate,
            url: `${url}#wb`, photoUrl, category: "content",
          }));
        }
      }
      if (o.status === "SHIPPED_WB" && !o.wbCardReady) {
        tasks.push(mkTask({
          id: `order-${o.id}-finalize-wb-card`,
          entityType: "order", entityId: o.id,
          action: "Доделайте карточку WB — товар отгружен",
          title, subtitle, deadline: o.saleStartDate,
          url: `${url}#wb`, photoUrl, category: "content",
        }));
      }
    }
  }

  // ====== УПАКОВКА — дефицит по активным заказам ======
  // Настя/Таня (ASSISTANT/LOGISTICS) и админы: видят задачу «запустить производство упаковки»
  // OWNER/DIRECTOR видят то же + агрегированные риски по заказам.
  if (role === "ASSISTANT" || role === "LOGISTICS" || isAdmin) {
    const packagingItems = await prisma.packagingItem.findMany({
      where: { isActive: true },
      include: {
        orderUsages: {
          where: {
            order: {
              deletedAt: null,
              status: { notIn: ["ON_SALE", "SHIPPED_WB"] },
            },
          },
          select: {
            quantityPerUnit: true,
            order: {
              select: {
                id: true,
                orderNumber: true,
                lines: { select: { quantity: true } },
              },
            },
          },
        },
        packagingOrderLines: {
          where: { packagingOrder: { status: { notIn: ["ARRIVED", "CANCELLED"] } } },
          select: { quantity: true },
        },
      },
    });

    for (const p of packagingItems) {
      const required = Math.ceil(
        p.orderUsages.reduce((s, u) => {
          const orderQty = u.order.lines.reduce((a, l) => a + l.quantity, 0);
          return s + orderQty * Number(u.quantityPerUnit);
        }, 0),
      );
      const inProduction = p.packagingOrderLines.reduce((a, l) => a + l.quantity, 0);
      const have = p.stock + inProduction;
      const shortage = required - have;
      if (shortage > 0) {
        const orderNumbers = p.orderUsages
          .map((u) => u.order.orderNumber)
          .slice(0, 3)
          .join(", ");
        const more = p.orderUsages.length > 3 ? ` и ещё ${p.orderUsages.length - 3}` : "";
        tasks.push(mkTask({
          id: `packaging-${p.id}-produce`,
          entityType: "order",
          entityId: p.id,
          action: `Запустите производство упаковки — не хватает ${shortage.toLocaleString("ru-RU")} шт`,
          title: p.name,
          subtitle: `Склад: ${p.stock} · В производстве: ${inProduction} · Для заказов: ${orderNumbers}${more}`,
          deadline: null,
          url: `/packaging/${p.id}`,
          photoUrl: p.photoUrl,
          category: "packing",
        }));
      }
    }
  }

  // Дедуп по id (на случай если админ попал в несколько веток)
  const seen = new Set<string>();
  const deduped = tasks.filter((t) => {
    if (seen.has(t.id)) return false;
    seen.add(t.id);
    return true;
  });

  // Сортировка: сначала просроченные, потом срочные, потом обычные
  const urgencyWeight: Record<TaskUrgency, number> = { overdue: 0, urgent: 1, normal: 2, info: 3 };
  deduped.sort((a, b) => {
    if (a.urgency !== b.urgency) return urgencyWeight[a.urgency] - urgencyWeight[b.urgency];
    if (a.deadline && b.deadline) return a.deadline.getTime() - b.deadline.getTime();
    if (a.deadline) return -1;
    if (b.deadline) return 1;
    return 0;
  });

  return deduped;
}

// ===== helpers =====

function mkTask(input: Omit<MyTask, "urgency" | "daysLeft">): MyTask {
  const daysLeft = input.deadline ? daysBetween(new Date(), input.deadline) : null;
  let urgency: TaskUrgency = "normal";
  if (daysLeft === null) urgency = "info";
  else if (daysLeft < 0) urgency = "overdue";
  else if (daysLeft <= 3) urgency = "urgent";
  return { ...input, daysLeft, urgency };
}

function daysBetween(from: Date, to: Date): number {
  const ms = to.getTime() - from.getTime();
  return Math.ceil(ms / 86_400_000);
}

function formatShort(d: Date | null | undefined): string {
  if (!d) return "";
  return new Date(d).toLocaleDateString("ru-RU", { day: "2-digit", month: "short" });
}

export const CATEGORY_LABELS: Record<MyTask["category"], string> = {
  discovery: "Разработка",
  production: "Производство",
  receiving: "Приёмка",
  packing: "Упаковка",
  shipping: "Логистика",
  content: "Контент",
};
