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
  entityType: "model" | "variant" | "sample" | "order";
  entityId: string;
  action: string;        // глагол действия: «Утвердите образец»
  title: string;         // на чём действие: «Пальто Классика · шоколад»
  subtitle?: string;     // дополнительный контекст: «ORD-2026-0001 · 500 шт»
  deadline: Date | null;
  daysLeft: number | null;
  urgency: TaskUrgency;
  url: string;           // куда идти, чтобы сделать
  photoUrl?: string | null;
  category: "discovery" | "production" | "sample" | "receiving" | "packing" | "shipping" | "customs" | "content";
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

      if (m.status === "PATTERNS") {
        tasks.push(mkTask({
          id: `model-${m.id}-request-sample`,
          entityType: "model", entityId: m.id,
          action: "Закажите образец на фабрике",
          title: m.name,
          subtitle: m.category,
          deadline: m.sampleDate,
          url: `/models/${m.id}`,
          photoUrl,
          category: "sample",
        }));
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

      // Варианты готовые, но в черновике
      const draftsReady = m.variants.filter((v) => v.status === "DRAFT" && v.photoUrls.length > 0 && v.fullCost);
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

  // ====== ОБРАЗЦЫ ======
  const sampleWhere: Record<string, unknown> = {
    status: { notIn: ["RETURNED"] },
  };

  if (!isPm && role === "CONTENT_MANAGER") {
    sampleWhere.status = { in: ["READY_FOR_SHOOT", "APPROVED"] };
  } else if (!isPm) {
    sampleWhere.status = "READY_FOR_SHOOT"; // остальные видят только готовые к съёмке
  } else if (!isAdmin) {
    sampleWhere.productModel = { ownerId: userId };
  }

  const samples = await prisma.sample.findMany({
    where: sampleWhere,
    include: {
      productModel: { select: { name: true, ownerId: true } },
      productVariant: { select: { colorName: true, photoUrls: true } },
    },
  });

  for (const s of samples) {
    const title = `${s.productModel.name}${s.productVariant ? ` · ${s.productVariant.colorName}` : ""}`;
    const photoUrl = s.productVariant?.photoUrls[0] ?? null;

    if (s.status === "REQUESTED" && isPm && (isAdmin || s.productModel.ownerId === userId)) {
      tasks.push(mkTask({
        id: `sample-${s.id}-await-sewing`,
        entityType: "sample", entityId: s.id,
        action: "Дождитесь начала пошива на фабрике",
        title, subtitle: "Образец заказан",
        deadline: s.sewingStartDate,
        url: `/samples/${s.id}`, photoUrl, category: "sample",
      }));
    }

    if (s.status === "IN_SEWING" && isPm && (isAdmin || s.productModel.ownerId === userId)) {
      tasks.push(mkTask({
        id: `sample-${s.id}-await-delivery`,
        entityType: "sample", entityId: s.id,
        action: "Отслеживайте доставку образца",
        title, subtitle: "Образец шьётся",
        deadline: s.deliveredDate,
        url: `/samples/${s.id}`, photoUrl, category: "sample",
      }));
    }

    if (s.status === "DELIVERED" && isPm && (isAdmin || s.productModel.ownerId === userId)) {
      tasks.push(mkTask({
        id: `sample-${s.id}-review`,
        entityType: "sample", entityId: s.id,
        action: "Осмотрите образец и утвердите (или верните)",
        title, subtitle: "Пришёл в Москву",
        deadline: s.approvedDate,
        url: `/samples/${s.id}`, photoUrl, category: "sample",
      }));
    }

    if (s.status === "APPROVED") {
      if (role === "CONTENT_MANAGER" || isAdmin) {
        tasks.push(mkTask({
          id: `sample-${s.id}-prep-shoot`,
          entityType: "sample", entityId: s.id,
          action: "Запланируйте фотосессию",
          title, subtitle: "Образец утверждён",
          deadline: s.readyForShootDate,
          url: `/samples/${s.id}`, photoUrl, category: "content",
        }));
      }
    }

    if (s.status === "READY_FOR_SHOOT" && (role === "CONTENT_MANAGER" || isAdmin)) {
      if (!s.plannedShootDate) {
        tasks.push(mkTask({
          id: `sample-${s.id}-schedule-shoot`,
          entityType: "sample", entityId: s.id,
          action: "Назначьте дату фотосессии",
          title, subtitle: "Образец готов для съёмки",
          deadline: null,
          url: `/samples/${s.id}#shoot-date`, photoUrl, category: "content",
        }));
      } else if (!s.shootCompleted) {
        const daysUntilShoot = daysBetween(new Date(), s.plannedShootDate);
        tasks.push(mkTask({
          id: `sample-${s.id}-do-shoot`,
          entityType: "sample", entityId: s.id,
          action: daysUntilShoot < 0 ? "Проведите съёмку (сроки сдвинулись)" : daysUntilShoot <= 2 ? "Проведите съёмку (скоро дата)" : "Готовьтесь к фотосессии",
          title, subtitle: `Съёмка назначена на ${formatShort(s.plannedShootDate)}`,
          deadline: s.plannedShootDate,
          url: `/samples/${s.id}#shoot-date`, photoUrl, category: "content",
        }));
      }
    }
  }

  // ====== ЗАКАЗЫ ======
  const orders = await prisma.order.findMany({
    where: { deletedAt: null, status: { not: "ON_SALE" } },
    include: {
      productVariant: {
        select: {
          sku: true, colorName: true, photoUrls: true,
          productModel: { select: { name: true } },
        },
      },
      factory: { select: { name: true } },
    },
  });

  for (const o of orders) {
    const title = `${o.productVariant.productModel.name} · ${o.productVariant.colorName}`;
    const subtitle = `${o.orderNumber} · ${o.quantity} шт`;
    const photoUrl = o.productVariant.photoUrls[0] ?? null;
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

      if (o.status === "QC" && (o.qcQuantityOk === null || o.qcQuantityOk === undefined)) {
        tasks.push(mkTask({
          id: `order-${o.id}-fill-qc`,
          entityType: "order", entityId: o.id,
          action: "Проведите ОТК и заполните приёмку",
          title, subtitle, deadline: o.readyAtFactoryDate,
          url: `${url}#qc`, photoUrl, category: "receiving",
        }));
      }

      if (o.status === "QC" && (o.qcQuantityDefects ?? 0) > 0 && !o.qcResolutionNote) {
        tasks.push(mkTask({
          id: `order-${o.id}-resolve-defects`,
          entityType: "order", entityId: o.id,
          action: `Решите по браку: ${o.qcQuantityDefects} шт`,
          title, subtitle, deadline: null,
          url: `${url}#qc`, photoUrl, category: "receiving",
        }));
      }
    }

    // === ВЭД (Элина) ===
    if (role === "CUSTOMS" || isAdmin) {
      if (["READY_SHIP", "SEWING", "QC"].includes(o.status)) {
        if (!o.specReady) {
          tasks.push(mkTask({
            id: `order-${o.id}-prepare-spec`,
            entityType: "order", entityId: o.id,
            action: "Подготовьте спецификацию",
            title, subtitle, deadline: o.shipmentDate,
            url: `${url}#customs`, photoUrl, category: "customs",
          }));
        }
        if (!o.declarationReady) {
          tasks.push(mkTask({
            id: `order-${o.id}-prepare-declaration`,
            entityType: "order", entityId: o.id,
            action: "Подготовьте декларацию",
            title, subtitle, deadline: o.shipmentDate,
            url: `${url}#customs`, photoUrl, category: "customs",
          }));
        }
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
      if (o.status === "WAREHOUSE_MSK" && !o.qcDate) {
        tasks.push(mkTask({
          id: `order-${o.id}-receive`,
          entityType: "order", entityId: o.id,
          action: "Примите товар и проведите ОТК",
          title, subtitle, deadline: null,
          url: `${url}#receiving`, photoUrl, category: "receiving",
        }));
      }
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
  sample: "Образец",
  receiving: "Приёмка и ОТК",
  packing: "Упаковка",
  shipping: "Логистика",
  customs: "Документы",
  content: "Контент",
};
